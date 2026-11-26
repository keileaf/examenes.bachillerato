/* Utilidades compartidas: llamadas al servidor, matemáticas y pequeñas ayudas de interfaz. */
(function () {
  'use strict';

  class ErrorApi extends Error {
    constructor(mensaje, codigo, red) { super(mensaje); this.codigo = codigo || 'ERROR'; this.red = !!red; }
  }

  /** Llama al backend de Apps Script. Usa text/plain para evitar el "preflight" CORS. */
  async function llamar(action, datos, opciones) {
    const url = (window.CONFIG && window.CONFIG.API_URL) || '';
    if (!/^https?:\/\//.test(url)) throw new ErrorApi('Falta configurar la URL del servidor en assets/js/config.js', 'SIN_CONFIG');
    const op = Object.assign({ reintentos: 1, espera: 25000 }, opciones || {});
    let ultimoError;
    for (let intento = 0; intento <= op.reintentos; intento++) {
      const control = new AbortController();
      const temporizador = setTimeout(() => control.abort(), op.espera);
      try {
        const r = await fetch(url, {
          method: 'POST', redirect: 'follow', signal: control.signal,
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(Object.assign({ action: action }, datos || {}))
        });
        const j = await r.json();
        if (typeof j.serverNow === 'number') Reloj.sincronizar(j.serverNow);
        if (!j.ok) throw new ErrorApi(j.error || 'Error del servidor', j.codigo);
        return j;
      } catch (e) {
        if (e instanceof ErrorApi) throw e;
        ultimoError = new ErrorApi('No hay conexión con el servidor. Revisa el internet.', 'RED', true);
        if (intento < op.reintentos) await dormir(1200 * (intento + 1));
      } finally { clearTimeout(temporizador); }
    }
    throw ultimoError;
  }

  /** Diferencia entre el reloj del servidor y el del equipo. */
  const Reloj = {
    desfase: 0,
    sincronizar(serverNow) { this.desfase = serverNow - Date.now(); },
    ahora() { return Date.now() + this.desfase; }
  };

  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function renderMate(el) {
    if (!el || !window.renderMathInElement) return;
    try {
      window.renderMathInElement(el, {
        delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }],
        throwOnError: false, ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'input']
      });
    } catch (e) { /* si KaTeX falla se muestra el texto tal cual */ }
  }

  function latex(tex) {
    try { return window.katex ? window.katex.renderToString(tex, { throwOnError: false }) : esc(tex); } catch (e) { return esc(tex); }
  }

  // ── Lectura de respuestas (misma lógica que el servidor) ──
  function normalizar(t) {
    return String(t == null ? '' : t).trim().replace(/[−–—]/g, '-').replace(/⁄|÷/g, '/').replace(/\s+/g, ' ');
  }
  /** Devuelve {valor, tex} o null. */
  function leerNumero(txt, comaDecimal) {
    let t = normalizar(txt);
    while (/^\(.*\)$/.test(t)) t = t.slice(1, -1).trim();
    if (comaDecimal) t = t.replace(/(\d),(\d)/g, '$1.$2');
    let m = t.match(/^([+-]?)\s*(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
    if (m) {
      if (Number(m[4]) === 0) return null;
      const v = Number(m[2]) + Number(m[3]) / Number(m[4]);
      return { valor: m[1] === '-' ? -v : v, tex: (m[1] === '-' ? '-' : '') + m[2] + '\\tfrac{' + m[3] + '}{' + m[4] + '}' };
    }
    m = t.match(/^([+-]?)\s*(\d*\.?\d+)\s*\/\s*\(?\s*([+-]?)\s*(\d*\.?\d+)\s*\)?$/);
    if (m) {
      if (Number(m[4]) === 0) return null;
      const neg = (m[1] === '-') !== (m[3] === '-');
      return { valor: (neg ? -1 : 1) * Number(m[2]) / Number(m[4]), tex: (neg ? '-' : '') + '\\dfrac{' + m[2] + '}{' + m[4] + '}' };
    }
    m = t.match(/^([+-]?)\s*(\d+\.?\d*|\.\d+)$/);
    if (m) return { valor: Number(m[1] + m[2]), tex: (m[1] === '-' ? '-' : '') + m[2] };
    return null;
  }
  function leerConjunto(txt) {
    let t = normalizar(txt);
    if (/^(∅|Ø|ø|\{\s*\}|vac[ií]o|conjunto vac[ií]o)$/i.test(t)) return { valores: [], tex: '\\varnothing' };
    t = t.replace(/^[A-Za-z]\s*=\s*/, '').replace(/^\{/, '').replace(/\}$/, '').trim();
    if (!t) return null;
    const partes = t.split(/[,;]/).map((s) => s.trim()).filter((s) => s !== '');
    const elems = [];
    for (const p of partes) {
      const n = leerNumero(p, false);
      if (!n) return null;
      if (!elems.some((e) => Math.abs(e.valor - n.valor) < 1e-9)) elems.push(n);
    }
    elems.sort((a, b) => a.valor - b.valor);
    return { valores: elems.map((e) => e.valor), tex: '\\{' + elems.map((e) => e.tex).join(',\\ ') + '\\}' };
  }

  // ── Interfaz ──
  let temporizadorAviso;
  function avisar(texto, tipo, ms) {
    let el = document.getElementById('aviso-flotante');
    if (!el) { el = document.createElement('div'); el.id = 'aviso-flotante'; document.body.appendChild(el); }
    el.className = 'aviso-flotante ' + (tipo || '');
    el.textContent = texto;
    el.hidden = false;
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => { el.hidden = true; }, ms || 3500);
  }

  function cargando(boton, activo, texto) {
    if (!boton) return;
    if (activo) {
      boton.dataset.texto = boton.innerHTML;
      boton.disabled = true;
      boton.innerHTML = '<span class="girando"></span>' + (texto ? ' ' + esc(texto) : '');
    } else {
      boton.disabled = false;
      if (boton.dataset.texto) boton.innerHTML = boton.dataset.texto;
    }
  }

  function formatoTiempo(ms) {
    ms = Math.max(0, ms);
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    const dd = (n) => String(n).padStart(2, '0');
    return (h ? h + ':' + dd(m) : dd(m)) + ':' + dd(ss);
  }

  function fechaHora(ms) {
    if (!ms) return '—';
    const d = new Date(ms);
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  }
  function hora(ms) { return ms ? new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'; }
  function haceCuanto(ms) {
    if (!ms) return '—';
    const s = Math.max(0, Math.round((Reloj.ahora() - ms) / 1000));
    if (s < 60) return 'hace ' + s + ' s';
    const m = Math.round(s / 60);
    if (m < 60) return 'hace ' + m + ' min';
    return fechaHora(ms);
  }

  window.Comun = { llamar, ErrorApi, Reloj, dormir, esc, renderMate, latex, leerNumero, leerConjunto, avisar, cargando, formatoTiempo, fechaHora, hora, haceCuanto };
})();
