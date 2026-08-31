// ============================================================
// ESTADO EN MEMORIA
// ============================================================
let centroActual = null;

// Contexto del activo que se está por cargar en el modal (se define
// justo antes de abrir el modal, según qué botón se presionó).
let contextoModal = { tipoActivo: null, nombreActivo: null };

const ESTADO_META = {
  VIGENTE:          { texto: '🟢 Vigente',           badge: 'badge-vigente' },
  PROXIMO_A_VENCER: { texto: '🟡 Próximo a vencer',  badge: 'badge-proximo' },
  VENCIDO:          { texto: '🔴 Vencido',           badge: 'badge-vencido' },
  SIN_CERTIFICADO:  { texto: '⚪ Sin certificado',   badge: 'badge-sin' }
};

const TIPO_LABEL = {
  CENTRO: 'Centro de Trabajo',
  BOTE: 'Bote',
  ARTEFACTO_NAVAL: 'Artefacto Naval'
};

// ============================================================
// LLAMADAS A LA API
// ============================================================
async function apiGet(action, params) {
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));

  const resp = await fetch(url.toString());
  const json = await resp.json();
  if (!json.ok) throw new Error(json.error || 'Error desconocido en la API.');
  return json.data;
}

async function apiPost(action, payload) {
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload })
  });
  const json = await resp.json();
  if (!json.ok) throw new Error(json.error || 'Error desconocido en la API.');
  return json.data;
}

// ============================================================
// INICIO
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  cargarCentros();
  cargarDashboard();
  configurarEventos();
});

function configurarEventos() {
  document.getElementById('selector-centro').addEventListener('change', (e) => {
    if (!e.target.value) return;
    seleccionarCentro(e.target.value);
  });

  document.getElementById('btn-descargar-centro').addEventListener('click', () => {
    const url = document.getElementById('btn-descargar-centro').dataset.url;
    if (!url) return mostrarToast('Este centro no posee un certificado vigente.', 'error');
    window.open(url, '_blank');
  });

  document.getElementById('btn-cargar-centro').addEventListener('click', () => {
    abrirModal('CENTRO', centroActual);
  });

  document.getElementById('btn-agregar-bote').addEventListener('click', () => {
    const nombre = document.getElementById('input-nuevo-bote').value.trim();
    if (!nombre) return mostrarToast('Escriba el nombre o código del bote.', 'error');
    abrirModal('BOTE', nombre);
  });
  document.getElementById('input-nuevo-bote').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btn-agregar-bote').click(); }
  });

  document.getElementById('btn-agregar-artefacto').addEventListener('click', () => {
    const nombre = document.getElementById('input-nuevo-artefacto').value.trim();
    if (!nombre) return mostrarToast('Escriba el nombre o código del artefacto naval.', 'error');
    abrirModal('ARTEFACTO_NAVAL', nombre);
  });
  document.getElementById('input-nuevo-artefacto').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btn-agregar-artefacto').click(); }
  });

  document.getElementById('btn-cancelar').addEventListener('click', cerrarModal);
  document.getElementById('modal-cerrar').addEventListener('click', cerrarModal);
  document.getElementById('modal-cargar').addEventListener('click', (e) => {
    if (e.target.id === 'modal-cargar') cerrarModal();
  });
  document.getElementById('form-cargar').addEventListener('submit', onSubmitCargar);
  document.getElementById('input-archivo').addEventListener('change', onSeleccionarArchivo);
}

// ============================================================
// CARGA INICIAL
// ============================================================
async function cargarCentros() {
  try {
    const centros = await apiGet('centros');
    const select = document.getElementById('selector-centro');
    centros.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.nombre;
      opt.textContent = c.nombre;
      select.appendChild(opt);
    });
  } catch (err) {
    mostrarToast('No se pudo cargar la lista de centros. Recargue la página.', 'error');
  }
}

async function cargarDashboard() {
  try {
    const stats = await apiGet('dashboard');
    pintarGrupoDashboard('centro', stats.centros);
    pintarGrupoDashboard('bote', stats.botes);
    pintarGrupoDashboard('artefacto', stats.artefactosNavales);
  } catch (err) {
    // El dashboard es informativo; si falla, no interrumpimos el resto de la app.
  }
}

function pintarGrupoDashboard(prefijo, stats) {
  document.getElementById(`stat-${prefijo}-total`).textContent = stats.total;
  document.getElementById(`stat-${prefijo}-vigentes`).textContent = stats.vigentes;
  document.getElementById(`stat-${prefijo}-proximos`).textContent = stats.proximosAVencer;
  document.getElementById(`stat-${prefijo}-vencidos`).textContent = stats.vencidos;
}

// ============================================================
// SELECCIÓN DE CENTRO
// ============================================================
async function seleccionarCentro(centro) {
  centroActual = centro;

  document.getElementById('empty-state').hidden = true;
  document.getElementById('centro-panel').hidden = false;
  document.getElementById('centro-nombre').textContent = centro;

  mostrarCargando('Consultando centro…');
  try {
    const info = await apiGet('infoCentroCompleto', { centro });
    renderCentroCompleto(info);
  } catch (err) {
    mostrarToast('Error al consultar el centro: ' + err.message, 'error');
  } finally {
    ocultarCargando();
  }
}

function renderCentroCompleto(info) {
  // --- Certificado propio del centro ---
  const meta = ESTADO_META[info.estadoCentro] || ESTADO_META.SIN_CERTIFICADO;
  const badge = document.getElementById('centro-badge');
  badge.textContent = meta.texto;
  badge.className = 'badge ' + meta.badge;

  const cert = info.certificadoCentro;
  const sinMsg = document.getElementById('centro-sin-certificado-msg');
  const btnDescargar = document.getElementById('btn-descargar-centro');

  if (cert && info.estadoCentro !== 'SIN_CERTIFICADO') {
    document.getElementById('centro-fecha-cert').textContent = cert.fechaCertificacion || '—';
    document.getElementById('centro-fecha-venc').textContent = cert.fechaVencimiento || '—';
    document.getElementById('centro-dias').textContent = formatearDias(cert.diasRestantes);
    document.getElementById('centro-empresa').textContent = cert.empresaCertificadora || '—';
    sinMsg.hidden = true;
    btnDescargar.disabled = false;
    btnDescargar.dataset.url = cert.urlArchivo || '';
  } else {
    document.getElementById('centro-fecha-cert').textContent = '—';
    document.getElementById('centro-fecha-venc').textContent = '—';
    document.getElementById('centro-dias').textContent = '—';
    document.getElementById('centro-empresa').textContent = '—';
    sinMsg.hidden = false;
    btnDescargar.disabled = true;
    btnDescargar.dataset.url = '';
  }

  // --- Botes y Artefactos Navales ---
  renderListaActivos('lista-botes', info.botes, 'BOTE');
  renderListaActivos('lista-artefactos', info.artefactosNavales, 'ARTEFACTO_NAVAL');

  // Limpiar los campos de "agregar nuevo"
  document.getElementById('input-nuevo-bote').value = '';
  document.getElementById('input-nuevo-artefacto').value = '';
}

function renderListaActivos(contenedorId, items, tipoActivo) {
  const cont = document.getElementById(contenedorId);
  cont.innerHTML = '';

  if (!items || items.length === 0) {
    const vacio = document.createElement('p');
    vacio.className = 'lista-vacia';
    vacio.textContent = tipoActivo === 'BOTE'
      ? 'Este centro no tiene botes con certificado registrado todavía.'
      : 'Este centro no tiene artefactos navales con certificado registrado todavía.';
    cont.appendChild(vacio);
    return;
  }

  items.forEach(item => {
    const meta = ESTADO_META[item.estado] || ESTADO_META.SIN_CERTIFICADO;
    const cert = item.certificado;

    const row = document.createElement('div');
    row.className = 'activo-item';
    row.innerHTML = `
      <div class="activo-item-info">
        <span class="activo-item-nombre">${escapeHtml(item.nombre)}</span>
        <span class="badge ${meta.badge}">${meta.texto}</span>
        ${cert ? `<span class="activo-item-detalle">Vence: ${escapeHtml(cert.fechaVencimiento || '—')}</span>` : ''}
      </div>
      <div class="activo-item-acciones">
        <button type="button" class="btn-mini btn-ver" ${cert && cert.urlArchivo ? '' : 'disabled'}>Descargar</button>
        <button type="button" class="btn-mini btn-mini-primary btn-actualizar">Actualizar certificado</button>
      </div>
    `;

    const btnVer = row.querySelector('.btn-ver');
    if (cert && cert.urlArchivo) {
      btnVer.addEventListener('click', () => window.open(cert.urlArchivo, '_blank'));
    }

    row.querySelector('.btn-actualizar').addEventListener('click', () => {
      abrirModal(tipoActivo, item.nombre);
    });

    cont.appendChild(row);
  });
}

function formatearDias(dias) {
  if (dias === null || dias === undefined) return '—';
  if (dias < 0) return Math.abs(dias) + ' días vencido';
  if (dias === 0) return 'Vence hoy';
  return dias + ' días';
}

// ============================================================
// MODAL DE CARGA
// ============================================================
function abrirModal(tipoActivo, nombreActivo) {
  if (!centroActual) return;
  contextoModal = { tipoActivo, nombreActivo };

  document.getElementById('form-error').hidden = true;
  document.getElementById('form-cargar').reset();

  const etiquetaTipo = TIPO_LABEL[tipoActivo] || tipoActivo;
  document.getElementById('modal-titulo').textContent =
    tipoActivo === 'CENTRO' ? 'Cargar certificado del centro' : `Cargar certificado — ${etiquetaTipo}`;
  document.getElementById('input-activo-resumen').value =
    tipoActivo === 'CENTRO' ? `${centroActual} (Centro de Trabajo)` : `${nombreActivo} — ${etiquetaTipo} de ${centroActual}`;

  document.getElementById('archivo-nombre').textContent = '';
  document.getElementById('modal-cargar').hidden = false;
}

function cerrarModal() {
  document.getElementById('modal-cargar').hidden = true;
}

function onSeleccionarArchivo(e) {
  const archivo = e.target.files[0];
  document.getElementById('archivo-nombre').textContent = archivo ? archivo.name : '';
}

async function onSubmitCargar(e) {
  e.preventDefault();

  const errorEl = document.getElementById('form-error');
  errorEl.hidden = true;

  const fechaCert = document.getElementById('input-fecha-cert').value;
  const fechaVenc = document.getElementById('input-fecha-venc').value;
  const empresa = document.getElementById('input-empresa').value.trim();
  const nroCert = document.getElementById('input-nro-cert').value.trim();
  const archivoInput = document.getElementById('input-archivo');
  const archivo = archivoInput.files[0];

  if (!centroActual || !contextoModal.tipoActivo) return mostrarErrorForm('Falta seleccionar un activo.');
  if (!archivo) return mostrarErrorForm('Debe seleccionar un archivo.');
  if (archivo.type !== 'application/pdf') return mostrarErrorForm('El archivo debe ser un PDF.');
  if (!fechaCert) return mostrarErrorForm('Debe indicar la fecha de certificación.');
  if (!fechaVenc) return mostrarErrorForm('Debe indicar la fecha de vencimiento.');
  if (new Date(fechaVenc) <= new Date(fechaCert)) {
    return mostrarErrorForm('La fecha de vencimiento debe ser posterior a la fecha de certificación.');
  }

  try {
    const base64 = await leerArchivoComoBase64(archivo);
    mostrarCargando('Subiendo certificado…');

    await apiPost('subirCertificado', {
      centro: centroActual,
      tipoActivo: contextoModal.tipoActivo,
      nombreActivo: contextoModal.nombreActivo,
      fechaCertificacion: fechaCert,
      fechaVencimiento: fechaVenc,
      empresaCertificadora: empresa,
      nroCertificado: nroCert,
      archivoBase64: base64,
      nombreArchivo: archivo.name,
      mimeType: archivo.type
    });

    cerrarModal();
    mostrarToast('Certificado cargado correctamente. El anterior (si existía) fue reemplazado.', 'success');
    seleccionarCentro(centroActual);
    cargarDashboard();
  } catch (err) {
    mostrarErrorForm(err.message || 'Ocurrió un error al guardar el certificado.');
  } finally {
    ocultarCargando();
  }
}

function leerArchivoComoBase64(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result.split(',')[1]);
    lector.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
    lector.readAsDataURL(archivo);
  });
}

function mostrarErrorForm(mensaje) {
  const el = document.getElementById('form-error');
  el.textContent = mensaje;
  el.hidden = false;
}

// ============================================================
// UTILIDADES DE UI
// ============================================================
function mostrarCargando(texto) {
  document.getElementById('loading-texto').textContent = texto || 'Procesando…';
  document.getElementById('loading-overlay').hidden = false;
}

function ocultarCargando() {
  document.getElementById('loading-overlay').hidden = true;
}

function mostrarToast(mensaje, tipo) {
  const cont = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast' + (tipo === 'success' ? ' toast-success' : tipo === 'error' ? ' toast-error' : '');
  toast.textContent = mensaje;
  cont.appendChild(toast);
  setTimeout(() => toast.remove(), 4500);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
