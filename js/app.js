// ============================================================
// ESTADO EN MEMORIA
// ============================================================
let activoActual = { tipo: null, nombre: null };

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
    seleccionarActivo('CENTRO', e.target.value);
  });

  document.getElementById('btn-buscar-bote').addEventListener('click', () => {
    const nombre = document.getElementById('input-bote').value.trim();
    if (!nombre) return mostrarToast('Escriba el nombre o código del bote.', 'error');
    seleccionarActivo('BOTE', nombre);
  });
  document.getElementById('input-bote').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btn-buscar-bote').click(); }
  });

  document.getElementById('btn-buscar-artefacto').addEventListener('click', () => {
    const nombre = document.getElementById('input-artefacto').value.trim();
    if (!nombre) return mostrarToast('Escriba el nombre o código del artefacto naval.', 'error');
    seleccionarActivo('ARTEFACTO_NAVAL', nombre);
  });
  document.getElementById('input-artefacto').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btn-buscar-artefacto').click(); }
  });

  document.getElementById('btn-cargar').addEventListener('click', abrirModal);
  document.getElementById('btn-cancelar').addEventListener('click', cerrarModal);
  document.getElementById('modal-cerrar').addEventListener('click', cerrarModal);
  document.getElementById('modal-cargar').addEventListener('click', (e) => {
    if (e.target.id === 'modal-cargar') cerrarModal();
  });
  document.getElementById('btn-descargar').addEventListener('click', descargarCertificadoVigente);
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
// SELECCIÓN DE ACTIVO
// ============================================================
async function seleccionarActivo(tipo, nombre) {
  activoActual = { tipo, nombre };
  resaltarBloqueActivo(tipo);

  document.getElementById('empty-state').hidden = true;
  document.getElementById('activo-panel').hidden = false;
  document.getElementById('activo-tipo-label').textContent = TIPO_LABEL[tipo] || tipo;
  document.getElementById('activo-nombre').textContent = nombre;

  mostrarCargando('Consultando certificado…');
  try {
    const info = await apiGet('infoActivo', { tipo, nombre });
    renderInfoActivo(info);
  } catch (err) {
    mostrarToast('Error al consultar el activo: ' + err.message, 'error');
  } finally {
    ocultarCargando();
  }
}

/** Marca visualmente cuál de los 3 bloques está activo y limpia los otros dos. */
function resaltarBloqueActivo(tipo) {
  document.getElementById('bloque-centro').classList.toggle('activo', tipo === 'CENTRO');
  document.getElementById('bloque-bote').classList.toggle('activo', tipo === 'BOTE');
  document.getElementById('bloque-artefacto').classList.toggle('activo', tipo === 'ARTEFACTO_NAVAL');

  if (tipo !== 'CENTRO') document.getElementById('selector-centro').value = '';
  if (tipo !== 'BOTE') document.getElementById('input-bote').value = '';
  if (tipo !== 'ARTEFACTO_NAVAL') document.getElementById('input-artefacto').value = '';

  // Conserva en el campo activo lo que el usuario buscó, para que se vea qué está consultando.
  if (tipo === 'BOTE') document.getElementById('input-bote').value = activoActual.nombre;
  if (tipo === 'ARTEFACTO_NAVAL') document.getElementById('input-artefacto').value = activoActual.nombre;
  if (tipo === 'CENTRO') document.getElementById('selector-centro').value = activoActual.nombre;
}

function renderInfoActivo(info) {
  const meta = ESTADO_META[info.estado] || ESTADO_META.SIN_CERTIFICADO;
  const badge = document.getElementById('activo-badge');
  badge.textContent = meta.texto;
  badge.className = 'badge ' + meta.badge;

  const cert = info.certificado;
  const sinMsg = document.getElementById('sin-certificado-msg');
  const btnDescargar = document.getElementById('btn-descargar');

  if (cert && info.estado !== 'SIN_CERTIFICADO') {
    document.getElementById('activo-fecha-cert').textContent = cert.fechaCertificacion || '—';
    document.getElementById('activo-fecha-venc').textContent = cert.fechaVencimiento || '—';
    document.getElementById('activo-dias').textContent = formatearDias(cert.diasRestantes);
    document.getElementById('activo-empresa').textContent = cert.empresaCertificadora || '—';
    sinMsg.hidden = true;
    btnDescargar.disabled = false;
    btnDescargar.dataset.url = cert.urlArchivo || '';
  } else {
    document.getElementById('activo-fecha-cert').textContent = '—';
    document.getElementById('activo-fecha-venc').textContent = '—';
    document.getElementById('activo-dias').textContent = '—';
    document.getElementById('activo-empresa').textContent = '—';
    sinMsg.hidden = false;
    btnDescargar.disabled = true;
    btnDescargar.dataset.url = '';
  }
}

function formatearDias(dias) {
  if (dias === null || dias === undefined) return '—';
  if (dias < 0) return Math.abs(dias) + ' días vencido';
  if (dias === 0) return 'Vence hoy';
  return dias + ' días';
}

function descargarCertificadoVigente() {
  const url = document.getElementById('btn-descargar').dataset.url;
  if (!url) {
    mostrarToast('Este activo no posee un certificado vigente.', 'error');
    return;
  }
  window.open(url, '_blank');
}

// ============================================================
// MODAL DE CARGA
// ============================================================
function abrirModal() {
  if (!activoActual.tipo || !activoActual.nombre) return;
  document.getElementById('form-error').hidden = true;
  document.getElementById('form-cargar').reset();
  document.getElementById('input-activo-nombre').value =
    `${activoActual.nombre} (${TIPO_LABEL[activoActual.tipo] || activoActual.tipo})`;
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

  if (!activoActual.tipo || !activoActual.nombre) return mostrarErrorForm('Debe seleccionar un activo primero.');
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
      tipoActivo: activoActual.tipo,
      nombreActivo: activoActual.nombre,
      fechaCertificacion: fechaCert,
      fechaVencimiento: fechaVenc,
      empresaCertificadora: empresa,
      nroCertificado: nroCert,
      archivoBase64: base64,
      nombreArchivo: archivo.name,
      mimeType: archivo.type
    });

    cerrarModal();
    mostrarToast('Certificado cargado correctamente. El anterior fue reemplazado.', 'success');
    seleccionarActivo(activoActual.tipo, activoActual.nombre);
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
