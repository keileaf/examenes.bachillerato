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

  // ── Crucigrama (misma lógica que apps-script/Tipos.gs, para la vista previa del editor) ──
  function letrasCrucigrama(s) {
    return String(s == null ? '' : s).toUpperCase()
      .replace(/Ñ/g, '\u0001').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\u0001/g, 'Ñ')
      .replace(/[^A-ZÑ]/g, '');
  }

  function generarCrucigrama(palabras) {
    const lista = palabras.map(function (p, k) { return { k: k, p: letrasCrucigrama(p) }; }).filter(function (x) { return x.p.length; });
    const orden = lista.slice().sort(function (a, b) { return b.p.length - a.p.length || a.k - b.k; });
    const celdas = {};
    const colocadas = [];
    const get = function (f, c) { return celdas[f + ',' + c]; };
    function cabe(p, f, c, dir) {
      let cruces = 0;
      const df = dir === 'V' ? 1 : 0, dc = dir === 'H' ? 1 : 0;
      if (get(f - df, c - dc) || get(f + df * p.length, c + dc * p.length)) return -1;
      for (let j = 0; j < p.length; j++) {
        const ff = f + df * j, cc = c + dc * j;
        const actual = get(ff, cc);
        if (actual) {
          if (actual.l !== p[j] || actual[dir]) return -1;
          cruces++;
        } else if (get(ff + dc, cc + df) || get(ff - dc, cc - df)) {
          return -1; // tocaría a otra palabra de lado
        }
      }
      return cruces;
    }
    function poner(x, f, c, dir) {
      const df = dir === 'V' ? 1 : 0, dc = dir === 'H' ? 1 : 0;
      for (let j = 0; j < x.p.length; j++) {
        const key = (f + df * j) + ',' + (c + dc * j);
        celdas[key] = celdas[key] || { l: x.p[j] };
        celdas[key][dir] = true;
      }
      colocadas.push({ k: x.k, fila: f, col: c, dir: dir, largo: x.p.length });
    }
    function caja() {
      let f0 = Infinity, f1 = -Infinity, c0 = Infinity, c1 = -Infinity;
      Object.keys(celdas).forEach(function (key) {
        const pr = key.split(',').map(Number);
        f0 = Math.min(f0, pr[0]); f1 = Math.max(f1, pr[0]); c0 = Math.min(c0, pr[1]); c1 = Math.max(c1, pr[1]);
      });
      return { f0: f0, f1: f1, c0: c0, c1: c1 };
    }
    orden.forEach(function (x, idx) {
      if (idx === 0) { poner(x, 0, 0, 'H'); return; }
      let mejor = null;
      Object.keys(celdas).forEach(function (key) {
        const pr = key.split(',').map(Number);
        const cel = celdas[key];
        for (let j = 0; j < x.p.length; j++) {
          if (x.p[j] !== cel.l) continue;
          ['H', 'V'].forEach(function (dir) {
            if (cel[dir]) return;
            const f = pr[0] - (dir === 'V' ? j : 0), c = pr[1] - (dir === 'H' ? j : 0);
            const cr = cabe(x.p, f, c, dir);
            if (cr < 1) return;
            const b = caja();
            const area = (Math.max(b.f1, f + (dir === 'V' ? x.p.length - 1 : 0)) - Math.min(b.f0, f) + 1) *
              (Math.max(b.c1, c + (dir === 'H' ? x.p.length - 1 : 0)) - Math.min(b.c0, c) + 1);
            const puntaje = cr * 1000 - area;
            if (!mejor || puntaje > mejor.puntaje) mejor = { f: f, c: c, dir: dir, puntaje: puntaje };
          });
        }
      });
      if (mejor) { poner(x, mejor.f, mejor.c, mejor.dir); return; }
      // No cruza con ninguna: se pone aparte, debajo de lo que ya hay
      const b = caja();
      poner(x, b.f1 + 2, b.c0, 'H');
    });
    const b = caja();
    colocadas.forEach(function (it) { it.fila -= b.f0; it.col -= b.c0; });
    // Numeración: de arriba hacia abajo y de izquierda a derecha
    const inicios = {};
    colocadas.forEach(function (it) { inicios[it.fila + ',' + it.col] = true; });
    const claves = Object.keys(inicios).map(function (key) { return key.split(',').map(Number); })
      .sort(function (a, c) { return a[0] - c[0] || a[1] - c[1]; });
    const numero = {};
    claves.forEach(function (pr, i) { numero[pr[0] + ',' + pr[1]] = i + 1; });
    const items = [];
    colocadas.forEach(function (it) { items[it.k] = { fila: it.fila, col: it.col, dir: it.dir, largo: it.largo, num: numero[it.fila + ',' + it.col] }; });
    return { ancho: b.c1 - b.c0 + 1, alto: b.f1 - b.f0 + 1, items: items };
  }

  // ───────────── Código de programación en enunciados ─────────────
  // ```python … ``` = bloque de código (con números de línea y colores); `x` = código dentro del texto.
  const PALABRAS_CLAVE = new Set(('if else elif for while do return def class function var let const new import from as in is not and or ' +
    'True False None true false null undefined this self try except catch finally raise throw with lambda yield pass break continue ' +
    'switch case default public private protected static void int float double char bool boolean string String long short byte ' +
    'struct enum interface extends implements package namespace using include print println printf input range len ' +
    'setup draw size background fill stroke noStroke noFill ellipse rect line point triangle width height mouseX mouseY keyPressed mousePressed frameRate random map color PImage PVector ArrayList ' +
    'document window console addEventListener querySelector getElementById async await of typeof ' +
    'SELECT FROM WHERE INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE JOIN ON ORDER BY GROUP AND OR NOT echo foreach elseif end then begin').split(' '));

  /** Si el docente no puso el lenguaje, se adivina (HTML, CSS, JavaScript/Processing o Python). */
  function adivinarLenguaje(c) {
    const t = String(c || '').trim();
    if (/^<(!doctype|html|head|body|div|p|h\d|ul|ol|li|a|img|table|form|section|header|nav|main|footer|span|link|meta|script|style)\b/i.test(t)) return 'html';
    if (/^[^{}()=;]*\{[\s\S]*?[\w-]+\s*:\s*[^;{}]+;[\s\S]*\}/.test(t) && !/\b(function|void|var|let|const|if|for)\b/.test(t)) return 'css';
    if (/\b(def |elif |print\()/.test(t) && !/[{};]\s*$/m.test(t)) return 'python';
    if (/\b(void|setup|draw|size)\s*\(|\b(int|float|boolean|color)\s+\w+\s*[=;]/.test(t)) return 'processing';
    return 'javascript';
  }

  function resaltarCodigo(codigo, lenguaje) {
    let lang = String(lenguaje || '').toLowerCase();
    if (!lang) lang = adivinarLenguaje(codigo);
    if (lang === 'pde' || lang === 'p5' || lang === 'p5js') lang = 'processing';
    if (lang === 'css' || lang === 'scss') return resaltarCss(codigo);
    const estiloHash = /^(py|python|sh|bash|r|ruby|rb|ps|powershell|yaml|yml)$/.test(lang);
    const esHtml = /^(html|xml|svg|vue)$/.test(lang);
    const NADA = /(?!)/y;
    const reglas = esHtml
      ? [['cm', /<!--[\s\S]*?-->/y], ['tg', /<\/?[A-Za-z][\w:-]*/y], ['tg', /\/?>/y], ['at', /[A-Za-z_:][\w:.-]*(?==)/y], ['st', /"[^"]*"|'[^']*'/y]]
      : [['cm', /\/\/[^\n]*|\/\*[\s\S]*?\*\//y], ['cm', estiloHash ? /#[^\n]*/y : NADA], ['cm', lang === 'sql' ? /--[^\n]*/y : NADA],
        ['st', /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/y],
        ['nu', /\b\d+(?:\.\d+)?\b/y], ['pc', /[A-Za-z_]\w*/y]];
    let i = 0, out = '';
    while (i < codigo.length) {
      let hecho = false;
      for (const [cls, re] of reglas) {
        re.lastIndex = i;
        const m = re.exec(codigo);
        if (m && m[0].length) {
          const t = m[0];
          if (cls === 'pc') out += PALABRAS_CLAVE.has(t) ? '<span class="tk-kw">' + esc(t) + '</span>' : (codigo[i + t.length] === '(' ? '<span class="tk-fn">' + esc(t) + '</span>' : esc(t));
          else out += '<span class="tk-' + cls + '">' + esc(t) + '</span>';
          i += t.length; hecho = true; break;
        }
      }
      if (!hecho) { out += esc(codigo[i]); i++; }
    }
    return numerarLineas(out);
  }

  /** Cada línea en su propio span para numerarlas (los colores que cruzan de línea se cierran y reabren). */
  function numerarLineas(out) {
    const lineas = [];
    let abiertos = [];
    out.split('\n').forEach((l) => {
      const pila = abiertos.slice();
      const re = /<span class="[^"]+">|<\/span>/g; let m;
      while ((m = re.exec(l))) { if (m[0] === '</span>') pila.pop(); else pila.push(m[0]); }
      lineas.push('<span class="ln">' + abiertos.join('') + (l || (abiertos.length ? '' : ' ')) + '</span>'.repeat(pila.length) + '</span>');
      abiertos = pila;
    });
    return lineas.join('');
  }

  /** CSS: selectores, propiedades, valores y comentarios. */
  function resaltarCss(codigo) {
    const re = /(\/\*[\s\S]*?\*\/)|("[^"\n]*"|'[^'\n]*')|([\w-]+)(\s*:)(?=[^{};]*[;}])|(#[0-9a-fA-F]{3,8}\b|-?\d*\.?\d+(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\b)|([^{};\n]+)(?=\{)/g;
    let out = '', i = 0, m;
    while ((m = re.exec(codigo))) {
      out += esc(codigo.slice(i, m.index));
      if (m[1]) out += '<span class="tk-cm">' + esc(m[1]) + '</span>';
      else if (m[2]) out += '<span class="tk-st">' + esc(m[2]) + '</span>';
      else if (m[3]) out += '<span class="tk-at">' + esc(m[3]) + '</span>' + esc(m[4]);
      else if (m[5]) out += '<span class="tk-nu">' + esc(m[5]) + '</span>';
      else if (m[6]) out += '<span class="tk-tg">' + esc(m[6]) + '</span>';
      i = re.lastIndex;
    }
    return numerarLineas(out + esc(codigo.slice(i)));
  }

  /** Bloque de código para mostrar un fragmento o la respuesta de un alumno. */
  function bloqueCodigo(codigo, lenguaje) {
    const c = String(codigo || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/\n+$/, '');
    return '<pre class="codigo" translate="no"' + (lenguaje ? ' data-lang="' + esc(lenguaje) + '"' : '') + '><code>' + resaltarCodigo(c, lenguaje) + '</code></pre>';
  }

  /** Texto de una pregunta u opción: escapa el HTML, respeta los saltos de línea y da formato al código. */
  function formato(texto) {
    const s = String(texto == null ? '' : texto).replace(/\r\n?/g, '\n');
    if (s.indexOf('`') < 0) return esc(s).replace(/\n/g, '<br>');
    const enLinea = (t) => esc(t).replace(/`([^`\n]+)`/g, '<code class="cod-in" translate="no">$1</code>').replace(/\n/g, '<br>');
    const re = /```[ \t]*([\w+#.-]*)[ \t]*\n?([\s\S]*?)```/g;
    let html = '', ultimo = 0, m;
    while ((m = re.exec(s))) {
      html += enLinea(s.slice(ultimo, m.index).replace(/\n$/, ''));
      html += bloqueCodigo(m[2], m[1]);
      ultimo = re.lastIndex;
      if (s[ultimo] === '\n') ultimo++;
    }
    return html + enLinea(s.slice(ultimo));
  }

  window.Comun = { formato, bloqueCodigo, resaltarCodigo, letrasCrucigrama, generarCrucigrama, llamar, ErrorApi, Reloj, dormir, esc, renderMate, latex, leerNumero, leerConjunto, avisar, cargando, formatoTiempo, fechaHora, hora, haceCuanto };
})();
