// ============================================================
// ESTADO EN MEMORIA
// ============================================================
let centroActual = null;

const ESTADO_META = {
  VIGENTE:          { texto: '🟢 Vigente',           badge: 'badge-vigente' },
  PROXIMO_A_VENCER: { texto: '🟡 Próximo a vencer',  badge: 'badge-proximo' },
  VENCIDO:          { texto: '🔴 Vencido',           badge: 'badge-vencido' },
  SIN_CERTIFICADO:  { texto: '⚪ Sin certificado',   badge: 'badge-sin' }
};

// ============================================================
// LLAMADAS A LA API
// ============================================================

/** GET a la API de Apps Script. Las peticiones GET no disparan preflight CORS. */
async function apiGet(action, params) {
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));

  const resp = await fetch(url.toString());
  const json = await resp.json();
  if (!json.ok) throw new Error(json.error || 'Error desconocido en la API.');
  return json.data;
}

/**
 * POST a la API de Apps Script.
 * OJO: se envía con Content-Type: text/plain a propósito. Apps Script no
 * responde peticiones OPTIONS (preflight), así que si mandáramos
 * "application/json" el navegador bloquearía la petición antes de enviarla.
 * Con "text/plain" el navegador la trata como "petición simple" y no hace
 * preflight; el servidor de todas formas parsea el cuerpo con JSON.parse().
 */
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
  document.getElementById('selector-centro').addEventListener('change', onSeleccionarCentro);
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
    renderSelectorCentros(centros);
  } catch (err) {
    mostrarToast('No se pudo cargar la lista de centros. Recargue la página.', 'error');
  }
}

function renderSelectorCentros(centros) {
  const select = document.getElementById('selector-centro');
  centros.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.nombre;
    opt.textContent = c.nombre;
    select.appendChild(opt);
  });
}

async function cargarDashboard() {
  try {
    const stats = await apiGet('dashboard');
    renderDashboard(stats);
  } catch (err) {
    // El dashboard es informativo; si falla, no interrumpimos el resto de la app.
  }
}

function renderDashboard(stats) {
  document.getElementById('stat-total').textContent = stats.totalCentros;
  document.getElementById('stat-vigentes').textContent = stats.vigentes;
  document.getElementById('stat-proximos').textContent = stats.proximosAVencer;
  document.getElementById('stat-vencidos').textContent = stats.vencidos;
  document.getElementById('stat-sin').textContent = stats.sinCertificado;
}

// ============================================================
// SELECCIÓN DE CENTRO
// ============================================================
async function onSeleccionarCentro(e) {
  centroActual = e.target.value;
  if (!centroActual) return;

  document.getElementById('empty-state').hidden = true;
  document.getElementById('centro-panel').hidden = false;
  document.getElementById('centro-nombre').textContent = centroActual;

  mostrarCargando('Consultando certificado…');
  try {
    const info = await apiGet('infoCentro', { centro: centroActual });
    renderInfoCentro(info);
  } catch (err) {
    mostrarToast('Error al consultar el centro: ' + err.message, 'error');
  } finally {
    ocultarCargando();
  }
}

function renderInfoCentro(info) {
  const meta = ESTADO_META[info.estado] || ESTADO_META.SIN_CERTIFICADO;
  const badge = document.getElementById('centro-badge');
  badge.textContent = meta.texto;
  badge.className = 'badge ' + meta.badge;

  const cert = info.certificadoVigente;
  const sinMsg = document.getElementById('sin-certificado-msg');
  const btnDescargar = document.getElementById('btn-descargar');

  if (cert && info.estado !== 'SIN_CERTIFICADO') {
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

  renderHistorial(info.historial || []);
}

function formatearDias(dias) {
  if (dias === null || dias === undefined) return '—';
  if (dias < 0) return Math.abs(dias) + ' días vencido';
  if (dias === 0) return 'Vence hoy';
  return dias + ' días';
}

function renderHistorial(historial) {
  const cont = document.getElementById('historial-lista');
  cont.innerHTML = '';

  if (historial.length === 0) {
    cont.innerHTML = '<p class="historial-vacio">Sin certificados registrados para este centro.</p>';
    return;
  }

  historial.forEach(c => {
    const meta = ESTADO_META[c.estado] || ESTADO_META.SIN_CERTIFICADO;
    const item = document.createElement('div');
    item.className = 'historial-item';
    item.innerHTML = `
      <div>
        <span class="campo-label">Certificación</span>
        <span class="campo-valor">${escapeHtml(c.fechaCertificacion || '—')}</span>
      </div>
      <div>
        <span class="campo-label">Vencimiento</span>
        <span class="campo-valor">${escapeHtml(c.fechaVencimiento || '—')}</span>
      </div>
      <div>
        <span class="campo-label">Empresa certificadora</span>
        <span class="campo-valor">${escapeHtml(c.empresaCertificadora || '—')}</span>
      </div>
      <div>
        <span class="campo-label">Estado</span>
        <span class="badge ${meta.badge}">${meta.texto}</span>
      </div>
      <button type="button" class="btn-ver" data-url="${escapeHtml(c.urlArchivo || '')}">Ver / Descargar</button>
    `;
    item.querySelector('.btn-ver').addEventListener('click', (e) => {
      const url = e.target.dataset.url;
      if (url) window.open(url, '_blank');
    });
    cont.appendChild(item);
  });
}

function descargarCertificadoVigente() {
  const url = document.getElementById('btn-descargar').dataset.url;
  if (!url) {
    mostrarToast('Este centro de trabajo no posee un certificado vigente.', 'error');
    return;
  }
  window.open(url, '_blank');
}

// ============================================================
// MODAL DE CARGA
// ============================================================
function abrirModal() {
  if (!centroActual) return;
  document.getElementById('form-error').hidden = true;
  document.getElementById('form-cargar').reset();
  document.getElementById('input-centro').value = centroActual;
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

  if (!centroActual) return mostrarErrorForm('Debe seleccionar un centro de trabajo.');
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
      fechaCertificacion: fechaCert,
      fechaVencimiento: fechaVenc,
      empresaCertificadora: empresa,
      nroCertificado: nroCert,
      archivoBase64: base64,
      nombreArchivo: archivo.name,
      mimeType: archivo.type
    });

    cerrarModal();
    mostrarToast('Certificado cargado correctamente.', 'success');
    onSeleccionarCentro({ target: { value: centroActual } });
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
