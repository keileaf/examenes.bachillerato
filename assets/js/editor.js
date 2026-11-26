/* Editor de exámenes + importación con IA (PDF o fotos → preguntas). */
(function () {
  'use strict';
  const { esc, renderMate, latex, leerNumero, leerConjunto, avisar, cargando } = window.Comun;
  const P = () => window.Panel;
  const $ = (id) => document.getElementById(id);

  const TIPOS = [
    ['opcion', 'Opción múltiple'], ['numerica', 'Respuesta numérica'], ['conjunto', 'Conjunto de números'], ['abierta', 'Abierta (se califica a mano)']
  ];
  const FORMULAS = [
    ['a/b', '\\dfrac{a}{b}', 'Fracción'], ['xⁿ', 'x^{n}', 'Potencia'], ['xₙ', 'x_{n}', 'Subíndice'], ['√', '\\sqrt{x}', 'Raíz cuadrada'],
    ['ⁿ√', '\\sqrt[n]{x}', 'Raíz n-ésima'], ['π', '\\pi', 'Pi'], ['·', '\\cdot', 'Por'], ['×', '\\times', 'Por (cruz)'], ['÷', '\\div', 'Entre'],
    ['≤', '\\le', 'Menor o igual'], ['≥', '\\ge', 'Mayor o igual'], ['≠', '\\ne', 'Diferente'], ['±', '\\pm', 'Más menos'], ['°', '^{\\circ}', 'Grados'],
    ['|x|', '|x|', 'Valor absoluto'], ['{ }', '\\{1, 2\\}', 'Conjunto'], ['∈', '\\in', 'Pertenece'], ['∪', '\\cup', 'Unión'], ['∩', '\\cap', 'Intersección'],
    ['ℕ', '\\mathbb{N}', 'Naturales'], ['ℤ', '\\mathbb{Z}', 'Enteros'], ['ℝ', '\\mathbb{R}', 'Reales'], ['→', '\\rightarrow', 'Flecha'], ['α', '\\alpha', 'Alfa'], ['Δ', '\\Delta', 'Delta']
  ];

  const ED = { id: '', cfg: null, bloques: [], usado: false, sucio: false, propietario: '' };

  function cfgNueva() {
    return {
      titulo: '', materia: (P().A.ses && P().A.ses.materia) || '', nivel: '', duracion_min: 50, max_advertencias: 3, pin_aplicador: '',
      aleatorizar_opciones: true, aleatorizar_preguntas: false, instrucciones: 'Haz tus procedimientos en una hoja. No se permite el uso de celular.', activo: true
    };
  }
  const preguntaNueva = (tipo) => ({
    tipo: tipo || 'opcion', inciso: '', enunciado: '', imagen_url: '', opciones: tipo === 'opcion' || !tipo ? ['', '', '', ''] : [],
    respuesta: '', puntos: 1, ayuda: '', avisos: []
  });

  // ───────────── Abrir ─────────────
  function nuevo() {
    ED.id = ''; ED.cfg = cfgNueva(); ED.usado = false; ED.sucio = false;
    ED.bloques = [{ seccion: 'I. ', grupo: '', preguntas: [preguntaNueva('opcion')] }];
    mostrar();
    setTimeout(() => { const t = $('ed-cuerpo').querySelector('[data-cfg="titulo"]'); if (t) t.focus(); }, 60);
  }

  async function abrir(id) {
    try {
      const d = await P().api('examenObtener', { examen_id: id });
      ED.id = id; ED.cfg = d.examen; ED.usado = d.usado; ED.sucio = false;
      ED.bloques = agrupar(d.preguntas.map((q) => Object.assign({ avisos: [] }, q)));
      if (!ED.bloques.length) ED.bloques = [{ seccion: '', grupo: '', preguntas: [preguntaNueva()] }];
      mostrar();
    } catch (err) { avisar(err.message, 'peligro', 5000); }
  }

  function desdeBorrador(b) {
    ED.id = ''; ED.usado = false; ED.sucio = true;
    ED.cfg = Object.assign(cfgNueva(), {
      titulo: b.titulo || '', materia: b.materia || cfgNueva().materia, nivel: b.nivel || '', instrucciones: b.instrucciones || cfgNueva().instrucciones
    });
    ED.bloques = agrupar(b.preguntas);
    mostrar();
    const revisar = b.preguntas.filter((q) => q.avisos && q.avisos.length).length;
    avisar('Listo: ' + b.preguntas.length + ' preguntas.' + (revisar ? ' Revisa las ' + revisar + ' marcadas en amarillo antes de guardar.' : ' Revísalas y guarda.'), 'ok', 8000);
  }

  function agrupar(preguntas) {
    const bloques = [];
    let actual = null;
    preguntas.forEach((q) => {
      if (!actual || actual.seccion !== (q.seccion || '') || actual.grupo !== (q.grupo || '')) {
        actual = { seccion: q.seccion || '', grupo: q.grupo || '', preguntas: [] };
        bloques.push(actual);
      }
      const limpio = Object.assign({}, q);
      delete limpio.seccion; delete limpio.grupo; delete limpio.pregunta_id;
      if (!Array.isArray(limpio.opciones)) limpio.opciones = [];
      limpio.avisos = limpio.avisos || [];
      actual.preguntas.push(limpio);
    });
    return bloques;
  }

  function mostrar() {
    P().mostrarEditor();
    pintar();
  }

  $('ed-volver').addEventListener('click', () => {
    if (ED.sucio) {
      P().confirmar('Salir sin guardar', 'Tienes cambios sin guardar. Si sales, se perderán.', 'peligro', async () => { ED.sucio = false; salir(); });
    } else salir();
  });
  function salir() { P().mostrarPanel(); P().refrescar(); }
  window.addEventListener('beforeunload', (e) => { if (ED.sucio && !$('v-editor').hidden) { e.preventDefault(); e.returnValue = ''; } });

  // ───────────── Pintar ─────────────
  function totales() {
    let n = 0, pts = 0;
    ED.bloques.forEach((b) => b.preguntas.forEach((q) => { n++; pts += Number(q.puntos) || 0; }));
    return { n, pts: Math.round(pts * 100) / 100 };
  }
  function pintarResumen() {
    const t = totales();
    $('ed-titulo').textContent = ED.cfg.titulo || (ED.id ? 'Examen sin título' : 'Nuevo examen');
    $('ed-resumen').textContent = t.n + ' pregunta' + (t.n === 1 ? '' : 's') + ' · ' + t.pts + ' puntos';
    $('ed-estado').textContent = ED.sucio ? '● Sin guardar' : (ED.id ? '✓ Guardado' : '');
    $('ed-estado').className = 'pequeno ' + (ED.sucio ? 'texto-aviso' : 'texto-ok');
  }
  function marcarSucio() { ED.sucio = true; pintarResumen(); }

  function pintar() {
    const y = window.scrollY;
    const c = ED.cfg;
    const bloqueado = ED.usado;
    let html = '';
    if (bloqueado) {
      html += '<div class="mensaje aviso">Este examen ya se aplicó, así que <b>sus preguntas no se pueden cambiar</b> (afectaría las calificaciones). Aquí solo puedes ajustar la configuración. Para cambiar preguntas, usa <b>Duplicar</b> desde «Mis exámenes».</div>';
    }
    html += '<div class="ed-tarjeta"><div class="ed-tarjeta-tit">Datos del examen</div>' +
      '<div class="campo"><label>Título del examen <span class="req">*</span></label><input class="entrada" data-cfg="titulo" maxlength="150" placeholder="Ej. Segundo parcial · Física II" value="' + esc(c.titulo) + '"></div>' +
      '<div class="fila-3">' +
      '<div class="campo"><label>Materia</label><input class="entrada" data-cfg="materia" maxlength="80" value="' + esc(c.materia) + '"></div>' +
      '<div class="campo"><label>Grado / grupo</label><input class="entrada" data-cfg="nivel" maxlength="120" placeholder="Ej. 4° semestre · Grupo B" value="' + esc(c.nivel) + '"></div>' +
      '<div class="campo"><label>Duración (minutos)</label><input class="entrada" type="number" min="5" max="300" data-cfg="duracion_min" value="' + esc(c.duracion_min) + '"></div>' +
      '</div><div class="fila-3">' +
      '<div class="campo"><label>Advertencias antes de enviarse solo</label><input class="entrada" type="number" min="1" max="10" data-cfg="max_advertencias" value="' + esc(c.max_advertencias) + '"></div>' +
      '<div class="campo"><label>PIN del aplicador (opcional)</label><input class="entrada" data-cfg="pin_aplicador" maxlength="12" placeholder="Ej. 4821" value="' + esc(c.pin_aplicador) + '"><span class="ayuda">Con PIN, el examen se bloquea en cada salida hasta que lo escribas.</span></div>' +
      '<div class="campo"><label>Opciones</label>' +
      '<label class="casilla compacta"><input type="checkbox" data-cfg="aleatorizar_opciones"' + (c.aleatorizar_opciones ? ' checked' : '') + '> Revolver opciones</label>' +
      '<label class="casilla compacta"><input type="checkbox" data-cfg="aleatorizar_preguntas"' + (c.aleatorizar_preguntas ? ' checked' : '') + '> Revolver preguntas de cada bloque</label>' +
      '<label class="casilla compacta"><input type="checkbox" data-cfg="activo"' + (c.activo ? ' checked' : '') + '> Activo (se puede presentar)</label></div>' +
      '</div>' +
      '<div class="campo"><label>Instrucciones para el alumno</label><textarea class="entrada" data-cfg="instrucciones" maxlength="1500" style="min-height:70px">' + esc(c.instrucciones) + '</textarea></div></div>';

    let n = 0;
    ED.bloques.forEach((b, bi) => {
      html += '<div class="ed-bloque" data-b="' + bi + '"><div class="ed-bloque-cab">' +
        '<span class="ed-etq">Bloque ' + (bi + 1) + '</span>' +
        '<div class="ed-bloque-campos"><input class="entrada" data-bc="seccion" placeholder="Sección (ej. I. Opción múltiple)" maxlength="200" value="' + esc(b.seccion) + '"' + dis(bloqueado) + '>' +
        '<textarea class="entrada" data-bc="grupo" rows="1" maxlength="1000" placeholder="Instrucción del bloque (ej. 1. Simplifica cada expresión)"' + dis(bloqueado) + '>' + esc(b.grupo) + '</textarea>' +
        '<div class="ed-prev-mini" data-prev-bloque>' + esc(b.grupo) + '</div></div>' +
        (bloqueado ? '' : '<div class="ed-iconos"><button class="ico-btn" data-acc="b-subir" title="Subir bloque">↑</button><button class="ico-btn" data-acc="b-bajar" title="Bajar bloque">↓</button><button class="ico-btn rojo" data-acc="b-borrar" title="Eliminar bloque">✕</button></div>') +
        '</div>';
      b.preguntas.forEach((q, qi) => { n++; html += htmlPregunta(q, bi, qi, n, bloqueado); });
      if (!bloqueado) {
        html += '<div class="ed-agregar"><span class="suave pequeno">Agregar pregunta:</span>' +
          TIPOS.map((t) => '<button class="btn secundario chico" data-acc="q-nueva" data-tipo="' + t[0] + '">+ ' + t[1].split(' (')[0] + '</button>').join('') + '</div>';
      }
      html += '</div>';
    });
    if (!bloqueado) html += '<button class="btn secundario bloque ed-nuevo-bloque" data-acc="b-nuevo">+ Nuevo bloque (sección o instrucción distinta)</button>';
    html += ayudaFormulas();
    $('ed-cuerpo').innerHTML = html;
    renderMate($('ed-cuerpo'));
    $('ed-cuerpo').querySelectorAll('textarea[data-bc="grupo"], textarea[data-q-campo="enunciado"]').forEach(autoAlto);
    pintarResumen();
    window.scrollTo(0, y);
  }
  const dis = (b) => (b ? ' disabled' : '');

  function htmlPregunta(q, bi, qi, n, bloq) {
    const id = 'b' + bi + 'q' + qi;
    let h = '<div class="ed-preg' + (q.avisos && q.avisos.length ? ' con-avisos' : '') + '" data-b="' + bi + '" data-q="' + qi + '" id="ed-' + id + '">' +
      '<div class="ed-preg-cab"><span class="num">' + n + '</span>' +
      '<input class="entrada ed-inciso" data-q-campo="inciso" maxlength="12" placeholder="Inciso" value="' + esc(q.inciso) + '"' + dis(bloq) + '>' +
      '<select class="entrada ed-tipo" data-q-campo="tipo"' + dis(bloq) + '>' + TIPOS.map((t) => '<option value="' + t[0] + '"' + (q.tipo === t[0] ? ' selected' : '') + '>' + t[1] + '</option>').join('') + '</select>' +
      '<label class="ed-pts"><input class="entrada" type="number" min="0.5" max="100" step="0.5" data-q-campo="puntos" value="' + esc(q.puntos) + '"' + dis(bloq) + '> pts</label>' +
      (bloq ? '' : '<div class="ed-iconos"><button class="ico-btn" data-acc="q-subir" title="Subir">↑</button><button class="ico-btn" data-acc="q-bajar" title="Bajar">↓</button>' +
        '<button class="ico-btn" data-acc="q-duplicar" title="Duplicar">⧉</button><button class="ico-btn rojo" data-acc="q-borrar" title="Eliminar">✕</button></div>') +
      '</div>';
    if (q.avisos && q.avisos.length) {
      h += '<div class="ed-avisos"><ul>' + q.avisos.map((a) => '<li>' + esc(a) + '</li>').join('') + '</ul>' +
        (bloq ? '' : '<button class="btn secundario chico" data-acc="q-revisado">✓ Ya lo revisé</button>') + '</div>';
    }
    h += '<div class="campo"><div class="ed-lbl"><label>Pregunta</label>' + (bloq ? '' : barraFormulas()) + '</div>' +
      '<textarea class="entrada" data-q-campo="enunciado" rows="2" maxlength="4000" placeholder="Escribe la pregunta. Las fórmulas van entre signos $, ej. $\\dfrac{3}{4}$"' + dis(bloq) + '>' + esc(q.enunciado) + '</textarea>' +
      '<div class="ed-prev" data-prev="enunciado">' + (q.enunciado ? esc(q.enunciado) : '<span class="suave">Vista previa</span>') + '</div></div>';
    // Imagen
    h += '<div class="ed-imagen">' + (q.imagen_url
      ? '<img src="' + esc(q.imagen_url) + '" alt="Figura"><div>' + (bloq ? '' : '<button class="btn secundario chico" data-acc="img-quitar">Quitar imagen</button>') + '</div>'
      : (bloq ? '' : '<button class="btn secundario chico" data-acc="img-subir">🖼 Agregar imagen</button><input class="entrada ed-img-url" data-q-campo="imagen_url" placeholder="o pega el enlace de una imagen (https://…)">')) + '</div>';
    // Respuesta según tipo
    if (q.tipo === 'opcion') {
      h += '<div class="ed-lbl"><label>Opciones · marca la correcta</label></div><div class="ed-opciones">' + q.opciones.map((o, oi) => {
        const letra = String.fromCharCode(65 + oi);
        return '<div class="ed-opcion' + (q.respuesta === letra ? ' correcta' : '') + '"><label class="ed-radio" title="Marcar como correcta"><input type="radio" name="cor-' + id + '" data-acc-cambio="correcta" value="' + letra + '"' + (q.respuesta === letra ? ' checked' : '') + dis(bloq) + '><span>' + letra.toLowerCase() + '</span></label>' +
          '<input class="entrada" data-q-op="' + oi + '" maxlength="800" placeholder="Opción ' + letra.toLowerCase() + '" value="' + esc(o) + '"' + dis(bloq) + '>' +
          '<div class="ed-prev-op" data-prev-op="' + oi + '">' + (o && o.indexOf('$') >= 0 ? esc(o) : '') + '</div>' +
          (bloq || q.opciones.length <= 2 ? '' : '<button class="ico-btn rojo" data-acc="op-borrar" data-o="' + oi + '" title="Quitar opción">✕</button>') + '</div>';
      }).join('') + '</div>' + (bloq || q.opciones.length >= 8 ? '' : '<button class="btn secundario chico" data-acc="op-nueva">+ Opción</button>');
    } else if (q.tipo === 'numerica' || q.tipo === 'conjunto') {
      h += '<div class="campo ed-resp"><label>Respuesta correcta</label><div class="resp-corta"><input class="entrada mono" data-q-campo="respuesta" maxlength="200" placeholder="' +
        (q.tipo === 'numerica' ? 'Ej. -9/2   (varias válidas: 1/5 | 0.2)' : 'Ej. -4, -3   (vacío: ∅)') + '" value="' + esc(q.respuesta) + '"' + dis(bloq) + '>' +
        '<div class="vista" data-prev="respuesta">' + vistaRespuesta(q) + '</div></div></div>';
    } else {
      h += '<div class="campo"><label>Guía para calificar (opcional, el alumno no la ve)</label><textarea class="entrada" data-q-campo="respuesta" rows="2" maxlength="1000"' + dis(bloq) + '>' + esc(q.respuesta) + '</textarea></div>';
    }
    h += '<div class="campo ed-ayuda"><input class="entrada" data-q-campo="ayuda" maxlength="300" placeholder="Ayuda para el alumno (opcional), ej. «Escribe solo el resultado»" value="' + esc(q.ayuda) + '"' + dis(bloq) + '></div>';
    return h + '</div>';
  }

  function vistaRespuesta(q) {
    const t = String(q.respuesta || '').trim();
    if (!t) return '';
    if (q.tipo === 'numerica') {
      const alts = t.split('|').map((s) => s.trim()).filter(Boolean).map((s) => leerNumero(s, true));
      if (alts.some((x) => !x)) return '<span class="texto-peligro">No se entiende. Usa números, fracciones (3/4) o decimales.</span>';
      return 'Se acepta: ' + alts.map((x) => latex(x.tex)).join(' &nbsp;o&nbsp; ');
    }
    const c = leerConjunto(t);
    return c ? 'Se acepta: ' + latex(c.tex) : '<span class="texto-peligro">No se entiende. Escribe números separados por comas.</span>';
  }

  function barraFormulas() {
    return '<div class="formulas">' + FORMULAS.map((f, i) => '<button type="button" class="fbtn" data-formula="' + i + '" title="' + esc(f[2]) + '">' + esc(f[0]) + '</button>').join('') + '</div>';
  }
  function ayudaFormulas() {
    return '<details class="ed-ayuda-form"><summary>¿Cómo escribo fórmulas?</summary><div class="pequeno">' +
      '<p>Escribe las fórmulas entre signos de pesos <code>$ … $</code>, o usa los botones arriba de cada pregunta. Ejemplos:</p><table class="tabla"><tbody>' +
      [['$\\dfrac{3}{4}$', '\\dfrac{3}{4}'], ['$x^{2}+3x-5$', 'x^{2}+3x-5'], ['$\\sqrt{18}$ y $\\sqrt[3]{54}$', '\\sqrt{18}'], ['$\\{x\\in\\mathbb{N}\\mid x<5\\}$', '\\{x\\in\\mathbb{N}\\mid x<5\\}'], ['$|-3|^{2}$', '|-3|^{2}'], ['$45^{\\circ}$', '45^{\\circ}']]
        .map((e) => '<tr><td><code>' + esc(e[0]) + '</code></td><td>' + latex(e[1]) + '</td></tr>').join('') +
      '</tbody></table></div></details>';
  }

  function autoAlto(t) { t.style.height = 'auto'; t.style.height = Math.min(400, t.scrollHeight + 2) + 'px'; }

  // ───────────── Edición ─────────────
  const prevTimers = {};
  function prevDiferida(clave, fn) { clearTimeout(prevTimers[clave]); prevTimers[clave] = setTimeout(fn, 250); }

  $('ed-cuerpo').addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.cfg) {
      const k = t.dataset.cfg;
      ED.cfg[k] = t.type === 'checkbox' ? t.checked : t.value;
      marcarSucio();
      return;
    }
    const caja = t.closest('[data-b]');
    if (!caja) return;
    const b = ED.bloques[Number(caja.dataset.b)];
    if (t.dataset.bc) {
      b[t.dataset.bc] = t.value;
      if (t.tagName === 'TEXTAREA') autoAlto(t);
      if (t.dataset.bc === 'grupo') {
        const pv = caja.querySelector('[data-prev-bloque]');
        prevDiferida('g' + caja.dataset.b, () => { pv.textContent = t.value; renderMate(pv); });
      }
      marcarSucio();
      return;
    }
    const pq = t.closest('.ed-preg');
    if (!pq) return;
    const q = b.preguntas[Number(pq.dataset.q)];
    if (t.dataset.qCampo) {
      const campo = t.dataset.qCampo;
      if (campo === 'tipo') return; // se maneja en "change"
      q[campo] = campo === 'puntos' ? Number(t.value) : t.value;
      if (campo === 'enunciado') {
        autoAlto(t);
        const pv = pq.querySelector('[data-prev="enunciado"]');
        prevDiferida('e' + pq.id, () => { pv.textContent = t.value; renderMate(pv); });
      } else if (campo === 'respuesta' && (q.tipo === 'numerica' || q.tipo === 'conjunto')) {
        pq.querySelector('[data-prev="respuesta"]').innerHTML = vistaRespuesta(q);
      } else if (campo === 'imagen_url' && /^https:\/\/\S+$/.test(t.value.trim())) {
        prevDiferida('i' + pq.id, () => { q.imagen_url = t.value.trim(); pintar(); });
      }
      if (campo === 'puntos') pintarResumen();
      marcarSucio();
    } else if (t.dataset.qOp != null) {
      const oi = Number(t.dataset.qOp);
      q.opciones[oi] = t.value;
      const pv = pq.querySelector('[data-prev-op="' + oi + '"]');
      prevDiferida('o' + pq.id + oi, () => { pv.textContent = t.value.indexOf('$') >= 0 ? t.value : ''; renderMate(pv); });
      marcarSucio();
    }
  });

  $('ed-cuerpo').addEventListener('change', (e) => {
    const t = e.target;
    const pq = t.closest('.ed-preg');
    if (!pq) return;
    const q = ED.bloques[Number(pq.dataset.b)].preguntas[Number(pq.dataset.q)];
    if (t.dataset.qCampo === 'tipo') {
      const antes = q.tipo;
      q.tipo = t.value;
      if (q.tipo === 'opcion' && q.opciones.length < 2) q.opciones = ['', '', '', ''];
      if (antes !== q.tipo) q.respuesta = '';
      marcarSucio(); pintar();
    } else if (t.dataset.accCambio === 'correcta') {
      q.respuesta = t.value;
      pq.querySelectorAll('.ed-opcion').forEach((o, i) => o.classList.toggle('correcta', String.fromCharCode(65 + i) === t.value));
      marcarSucio();
    }
  });

  // Botones de fórmulas: insertan en el último campo de texto usado de esa pregunta
  let ultimoCampo = null;
  $('ed-cuerpo').addEventListener('focusin', (e) => {
    if (e.target.matches('textarea[data-q-campo="enunciado"], input[data-q-op], textarea[data-bc="grupo"], textarea[data-q-campo="respuesta"]')) ultimoCampo = e.target;
  });
  $('ed-cuerpo').addEventListener('mousedown', (e) => { if (e.target.closest('.fbtn')) e.preventDefault(); });

  $('ed-cuerpo').addEventListener('click', (e) => {
    const f = e.target.closest('[data-formula]');
    if (f) {
      const pq = f.closest('.ed-preg');
      let campo = ultimoCampo && pq.contains(ultimoCampo) ? ultimoCampo : pq.querySelector('textarea[data-q-campo="enunciado"]');
      insertarFormula(campo, FORMULAS[Number(f.dataset.formula)][1]);
      return;
    }
    const b = e.target.closest('[data-acc]');
    if (!b) return;
    const acc = b.dataset.acc;
    const cajaB = b.closest('.ed-bloque');
    const bi = cajaB ? Number(cajaB.dataset.b) : -1;
    const pq = b.closest('.ed-preg');
    const qi = pq ? Number(pq.dataset.q) : -1;
    const bloque = ED.bloques[bi];
    const mover = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return false; [arr[i], arr[j]] = [arr[j], arr[i]]; return true; };
    switch (acc) {
      case 'b-nuevo': {
        const prev = ED.bloques[ED.bloques.length - 1];
        ED.bloques.push({ seccion: prev ? prev.seccion : '', grupo: '', preguntas: [preguntaNueva(prev && prev.preguntas.length ? prev.preguntas[prev.preguntas.length - 1].tipo : 'opcion')] });
        break;
      }
      case 'b-subir': if (!mover(ED.bloques, bi, -1)) return; break;
      case 'b-bajar': if (!mover(ED.bloques, bi, 1)) return; break;
      case 'b-borrar':
        if (ED.bloques.length === 1) { avisar('El examen necesita al menos un bloque.', 'peligro'); return; }
        P().confirmar('Eliminar bloque', 'Se eliminará el bloque ' + (bi + 1) + ' con sus ' + bloque.preguntas.length + ' preguntas.', 'peligro', async () => { ED.bloques.splice(bi, 1); marcarSucio(); pintar(); });
        return;
      case 'q-nueva': {
        const q = preguntaNueva(b.dataset.tipo);
        const ult = bloque.preguntas[bloque.preguntas.length - 1];
        if (ult) { q.puntos = ult.puntos; q.ayuda = ult.tipo === q.tipo ? ult.ayuda : ''; q.inciso = siguienteInciso(ult.inciso); }
        bloque.preguntas.push(q);
        marcarSucio(); pintar();
        const nuevo = document.getElementById('ed-b' + bi + 'q' + (bloque.preguntas.length - 1));
        if (nuevo) { nuevo.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => nuevo.querySelector('textarea[data-q-campo="enunciado"]').focus(), 250); }
        return;
      }
      case 'q-subir': if (!mover(bloque.preguntas, qi, -1)) return; break;
      case 'q-bajar': if (!mover(bloque.preguntas, qi, 1)) return; break;
      case 'q-duplicar': bloque.preguntas.splice(qi + 1, 0, JSON.parse(JSON.stringify(bloque.preguntas[qi]))); break;
      case 'q-borrar':
        if (bloque.preguntas.length === 1) {
          if (ED.bloques.length === 1) { avisar('El examen necesita al menos una pregunta.', 'peligro'); return; }
          ED.bloques.splice(bi, 1);
        } else bloque.preguntas.splice(qi, 1);
        break;
      case 'q-revisado': bloque.preguntas[qi].avisos = []; break;
      case 'op-nueva': bloque.preguntas[qi].opciones.push(''); break;
      case 'op-borrar': {
        const q = bloque.preguntas[qi];
        const oi = Number(b.dataset.o);
        const letraCorrecta = q.respuesta ? q.respuesta.charCodeAt(0) - 65 : -1;
        q.opciones.splice(oi, 1);
        if (letraCorrecta === oi) q.respuesta = '';
        else if (letraCorrecta > oi) q.respuesta = String.fromCharCode(64 + letraCorrecta);
        break;
      }
      case 'img-quitar': bloque.preguntas[qi].imagen_url = ''; break;
      case 'img-subir': elegirImagen(bloque.preguntas[qi]); return;
      default: return;
    }
    marcarSucio();
    pintar();
  });

  function siguienteInciso(inc) {
    const m = String(inc || '').match(/^(\(?)([a-z]|\d+)(\)?\.?)$/i);
    if (!m) return '';
    const sig = /\d/.test(m[2]) ? String(Number(m[2]) + 1) : String.fromCharCode(m[2].charCodeAt(0) + 1);
    return m[1] + sig + m[3];
  }

  function insertarFormula(campo, tex) {
    if (!campo || campo.disabled) return;
    const v = campo.value, i = campo.selectionStart ?? v.length, j = campo.selectionEnd ?? v.length;
    const dentro = (v.slice(0, i).match(/\$/g) || []).length % 2 === 1;
    const texto = dentro ? tex : '$' + tex + '$';
    campo.value = v.slice(0, i) + texto + v.slice(j);
    const pos = i + texto.length - (dentro ? 0 : 1);
    campo.focus();
    campo.setSelectionRange(pos, pos);
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // ───────────── Imágenes ─────────────
  function elegirImagen(q) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp,image/gif';
    inp.onchange = async () => {
      const f = inp.files[0];
      if (!f) return;
      avisar('Subiendo imagen…', '', 20000);
      try {
        const img = await reducirImagen(f, 1600, f.type === 'image/png' && f.size < 600000);
        const r = await P().api('subirImagen', { archivo: { nombre: f.name, mime: img.mime, datos: img.datos } }, { espera: 60000 });
        q.imagen_url = r.url;
        marcarSucio(); pintar();
        avisar('Imagen agregada', 'ok');
      } catch (err) { avisar(err.message, 'peligro', 6000); }
    };
    inp.click();
  }

  function reducirImagen(file, maxPx, conservarPng) {
    return new Promise((ok, mal) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, maxPx / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        const mime = conservarPng ? 'image/png' : 'image/jpeg';
        ok({ mime, datos: c.toDataURL(mime, 0.85).split(',')[1] });
      };
      img.onerror = () => mal(new Error('No se pudo leer la imagen.'));
      img.src = URL.createObjectURL(file);
    });
  }

  // ───────────── Guardar ─────────────
  function validar() {
    if (String(ED.cfg.titulo || '').trim().length < 3) return { msg: 'Escribe el título del examen.', sel: '[data-cfg="titulo"]' };
    if (ED.usado) return null;
    let n = 0;
    for (let bi = 0; bi < ED.bloques.length; bi++) {
      for (let qi = 0; qi < ED.bloques[bi].preguntas.length; qi++) {
        n++;
        const q = ED.bloques[bi].preguntas[qi];
        const sel = '#ed-b' + bi + 'q' + qi;
        const err = (m) => ({ msg: 'Pregunta ' + n + ': ' + m, sel });
        if (!String(q.enunciado).trim() && !q.imagen_url) return err('escribe la pregunta.');
        if (!(Number(q.puntos) > 0)) return err('los puntos deben ser mayores a 0.');
        if (q.tipo === 'opcion') {
          if (q.opciones.length < 2 || q.opciones.some((o) => !String(o).trim())) return err('llena todas las opciones (mínimo 2).');
          if (!q.respuesta) return err('marca cuál opción es la correcta.');
        } else if (q.tipo === 'numerica') {
          const alts = String(q.respuesta).split('|').map((s) => s.trim()).filter(Boolean);
          if (!alts.length || alts.some((a) => !leerNumero(a, true))) return err('escribe la respuesta correcta como número, fracción o decimal.');
        } else if (q.tipo === 'conjunto') {
          if (!leerConjunto(q.respuesta)) return err('escribe la respuesta como números separados por comas.');
        }
      }
    }
    return n ? null : { msg: 'Agrega al menos una pregunta.' };
  }

  $('ed-guardar').addEventListener('click', guardar);
  async function guardar() {
    const v = validar();
    if (v) {
      avisar(v.msg, 'peligro', 6000);
      const el = v.sel && $('ed-cuerpo').querySelector(v.sel);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('error-flash'); setTimeout(() => el.classList.remove('error-flash'), 2000); }
      return;
    }
    const conAvisos = ED.bloques.reduce((s, b) => s + b.preguntas.filter((q) => q.avisos && q.avisos.length).length, 0);
    if (conAvisos && !ED.usado) {
      P().confirmar('Hay preguntas sin revisar', conAvisos + ' pregunta(s) siguen marcadas en amarillo (respuestas propuestas por la IA o figuras faltantes). ¿Guardar de todos modos?', '', async () => { await enviarGuardado(); });
      return;
    }
    await enviarGuardado();
  }
  async function enviarGuardado() {
    const btn = $('ed-guardar');
    cargando(btn, true, 'Guardando…');
    try {
      const datos = { examen: Object.assign({}, ED.cfg, { examen_id: ED.id || undefined }) };
      if (!ED.usado) {
        datos.preguntas = [];
        ED.bloques.forEach((b) => b.preguntas.forEach((q) => datos.preguntas.push({
          seccion: b.seccion, grupo: b.grupo, inciso: q.inciso, tipo: q.tipo, enunciado: q.enunciado, imagen_url: q.imagen_url,
          opciones: q.tipo === 'opcion' ? q.opciones : [], respuesta: q.respuesta, puntos: q.puntos, ayuda: q.ayuda
        })));
      }
      const r = await P().api('examenGuardar', datos);
      ED.id = r.examen_id;
      ED.sucio = false;
      pintarResumen();
      avisar('Examen guardado ✓', 'ok');
      P().refrescar();
    } catch (err) {
      avisar(err.message, 'peligro', 7000);
    } finally { cargando(btn, false); }
  }
  document.addEventListener('keydown', (e) => {
    if (!$('v-editor').hidden && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); guardar(); }
  });

  // ───────────── Vista previa local (como la verá el alumno) ─────────────
  $('ed-prev').addEventListener('click', () => {
    P().abrirCajon(ED.cfg.titulo || 'Vista previa', 'Así lo verá el alumno. La respuesta correcta se marca en verde (el alumno no la ve).');
    let html = '', n = 0;
    ED.bloques.forEach((b) => {
      const pts = b.preguntas.reduce((s, q) => s + (Number(q.puntos) || 0), 0);
      html += '<div class="titulo-grupo">' + esc(b.seccion) + '</div><div class="item-rev"><b>' + esc(b.grupo) + '</b> <span class="suave pequeno">(' + pts + ' pts)</span></div>';
      b.preguntas.forEach((q) => {
        n++;
        let resp = '';
        if (q.tipo === 'opcion') {
          resp = '<div class="opciones" style="margin-top:8px">' + q.opciones.map((o, i) => {
            const l = String.fromCharCode(65 + i);
            return '<div class="opcion ' + (l === q.respuesta ? 'correcta-prev' : '') + '"><span class="letra">' + l.toLowerCase() + '</span><span>' + esc(o) + '</span></div>';
          }).join('') + '</div>';
        } else if (q.tipo === 'abierta') {
          resp = '<div class="resp" style="grid-template-columns:1fr"><div><b>Respuesta abierta · guía</b>' + esc(q.respuesta || '—') + '</div></div>';
        } else {
          resp = '<div class="resp" style="grid-template-columns:1fr"><div><b>Respuesta correcta</b>' + vistaRespuesta(q) + '</div></div>';
        }
        html += '<div class="item-rev"><div class="top"><div class="enun"><b>' + n + '. ' + esc(q.inciso) + '</b> ' + esc(q.enunciado) + '</div><div class="pequeno suave">' + q.puntos + ' pts</div></div>' +
          (q.imagen_url ? '<img src="' + esc(q.imagen_url) + '" style="max-width:100%;margin-top:8px;border-radius:6px">' : '') + resp + '</div>';
      });
    });
    $('caj-cuerpo').innerHTML = html;
    // Solo se procesan las fórmulas de enunciados y opciones (lo de vistaRespuesta ya viene renderizado)
    $('caj-cuerpo').querySelectorAll('.enun, .opcion span:last-child, .item-rev > b, .titulo-grupo').forEach(renderMate);
    const t = totales();
    $('caj-pie').innerHTML = '<span class="suave">' + t.n + ' preguntas · ' + t.pts + ' puntos · ' + ED.cfg.duracion_min + ' minutos</span>';
  });

  // ───────────── Importar con IA ─────────────
  const IA = { archivos: [], pdf: null, paginas: 0, trabajando: false, cancelado: false };

  function importar() {
    if (P().A.datos && P().A.datos.sesion && !P().A.datos.sesion.ia) {
      avisar('La importación con IA aún no está configurada. Pide al administrador que ponga la clave de IA en la hoja Config.', 'peligro', 8000);
    }
    IA.archivos = []; IA.pdf = null; IA.paginas = 0; IA.cancelado = false;
    $('ia-lista').innerHTML = ''; $('msg-ia').innerHTML = ''; $('ia-progreso').hidden = true;
    $('ia-ok').disabled = true; $('ia-ok').textContent = '✨ Convertir';
    $('m-importar').hidden = false;
  }

  const drop = $('ia-drop');
  drop.addEventListener('click', () => { if (!IA.trabajando) $('ia-archivos').click(); });
  $('ia-archivos').addEventListener('change', (e) => { agregarArchivos(e.target.files); e.target.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => { if (!IA.trabajando) agregarArchivos(e.dataTransfer.files); });

  async function agregarArchivos(lista) {
    $('msg-ia').innerHTML = '';
    const archivos = Array.from(lista);
    const pdfs = archivos.filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    const imgs = archivos.filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    if (!pdfs.length && !imgs.length) { mensajeIA('Solo se aceptan PDF, JPG o PNG. Si tu examen está en Word, guárdalo como PDF.'); return; }
    if (pdfs.length) {
      if (pdfs.length > 1 || imgs.length || IA.archivos.length) { mensajeIA('Sube un solo PDF, o solo fotos.'); }
      IA.archivos = [pdfs[0]];
      try {
        const pdfjs = await cargarPdfJs();
        IA.pdf = await pdfjs.getDocument({ data: await pdfs[0].arrayBuffer() }).promise;
        IA.paginas = IA.pdf.numPages;
        if (IA.paginas > 10) mensajeIA('El PDF tiene ' + IA.paginas + ' páginas; se convertirán las primeras 10.', 'aviso');
      } catch (err) {
        IA.archivos = []; IA.pdf = null;
        mensajeIA('No se pudo abrir el PDF. ¿Está protegido con contraseña?');
      }
    } else {
      if (IA.pdf) { IA.archivos = []; IA.pdf = null; }
      IA.archivos = IA.archivos.concat(imgs).slice(0, 10);
      IA.paginas = IA.archivos.length;
    }
    pintarListaIA();
  }

  function pintarListaIA() {
    $('ia-lista').innerHTML = IA.archivos.map((f, i) => '<div class="ia-archivo"><span>' + (IA.pdf ? '📄' : '🖼') + ' ' + esc(f.name) +
      (IA.pdf ? ' · ' + IA.paginas + ' página' + (IA.paginas === 1 ? '' : 's') : ' · página ' + (i + 1)) + '</span>' +
      '<button class="ico-btn rojo" data-ia-quitar="' + i + '" title="Quitar">✕</button></div>').join('');
    $('ia-ok').disabled = !IA.archivos.length;
  }
  $('ia-lista').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ia-quitar]');
    if (!b || IA.trabajando) return;
    IA.archivos.splice(Number(b.dataset.iaQuitar), 1);
    if (IA.pdf) IA.pdf = null;
    IA.paginas = IA.archivos.length;
    pintarListaIA();
  });
  function mensajeIA(t, tipo) { $('msg-ia').innerHTML = '<div class="mensaje ' + (tipo || 'error') + '">' + esc(t) + '</div>'; }

  let pdfJsPromesa = null;
  function cargarPdfJs() {
    if (!pdfJsPromesa) {
      pdfJsPromesa = import(new URL('vendor/pdfjs/pdf.min.mjs', location.href).href).then((m) => {
        m.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.mjs', location.href).href;
        return m;
      });
    }
    return pdfJsPromesa;
  }

  async function paginaComoImagen(i) {
    if (IA.pdf) {
      const pag = await IA.pdf.getPage(i + 1);
      const v0 = pag.getViewport({ scale: 1 });
      const vp = pag.getViewport({ scale: Math.min(3, 1700 / v0.width) });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await pag.render({ canvasContext: ctx, viewport: vp, canvas: c }).promise;
      return { mime: 'image/jpeg', datos: c.toDataURL('image/jpeg', 0.85).split(',')[1] };
    }
    return reducirImagen(IA.archivos[i], 2000, false);
  }

  $('ia-ok').addEventListener('click', async () => {
    if (IA.resultadoParcial) { const b = IA.resultadoParcial; IA.resultadoParcial = null; $('m-importar').hidden = true; desdeBorrador(b); return; }
    const total = Math.min(10, IA.paginas);
    if (!total) return;
    IA.trabajando = true; IA.cancelado = false;
    const btn = $('ia-ok');
    cargando(btn, true, 'Convirtiendo…');
    $('ia-progreso').hidden = false; $('msg-ia').innerHTML = '';
    const borrador = { titulo: '', materia: '', nivel: '', instrucciones: '', preguntas: [] };
    let seccion = '', grupo = '';
    const progreso = (i, txt) => { $('ia-barra').style.width = Math.round((i / total) * 100) + '%'; $('ia-texto').textContent = txt; };
    try {
      for (let i = 0; i < total; i++) {
        if (IA.cancelado || $('m-importar').hidden) throw new Error('Se canceló la conversión.');
        progreso(i, 'Preparando página ' + (i + 1) + ' de ' + total + '…');
        const pag = await paginaComoImagen(i);
        progreso(i + 0.15, 'La IA está leyendo la página ' + (i + 1) + ' de ' + total + '… (unos 20 a 40 segundos por página)');
        const r = await P().api('examenImportarIA', {
          archivos: [pag], contexto: total > 1 ? { pagina: i + 1, total, seccion, grupo } : undefined
        }, { espera: 180000, reintentos: 1 });
        if (IA.cancelado || $('m-importar').hidden) throw new Error('Se canceló la conversión.');
        const b = r.borrador;
        if (i === 0) Object.assign(borrador, { titulo: b.titulo, materia: b.materia, nivel: b.nivel, instrucciones: b.instrucciones });
        borrador.preguntas = borrador.preguntas.concat(b.preguntas);
        const ult = b.preguntas[b.preguntas.length - 1];
        if (ult) { seccion = ult.seccion; grupo = ult.grupo; }
      }
      progreso(total, 'Listo.');
      if (!borrador.preguntas.length) throw new Error('La IA no encontró preguntas en el archivo.');
      $('m-importar').hidden = true;
      desdeBorrador(borrador);
    } catch (err) {
      mensajeIA(err.message + (borrador.preguntas.length ? ' Se convirtieron ' + borrador.preguntas.length + ' preguntas antes del error; puedes abrirlas y completar lo demás a mano.' : ''));
      if (borrador.preguntas.length) { IA.resultadoParcial = borrador; }
    } finally {
      IA.trabajando = false;
      cargando(btn, false);
      if (IA.resultadoParcial) btn.textContent = 'Abrir lo convertido';
    }
  });
  $('ia-cancelar').addEventListener('click', () => { IA.cancelado = true; IA.resultadoParcial = null; });

  window.Editor = { nuevo, abrir, importar, desdeBorrador };
})();
