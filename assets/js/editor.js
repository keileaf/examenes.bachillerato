/* Editor de exámenes + importación con IA (PDF o fotos → preguntas). */
(function () {
  'use strict';
  const { esc, formato, bloqueCodigo, renderMate, latex, leerNumero, leerConjunto, avisar, cargando } = window.Comun;
  const P = () => window.Panel;
  const $ = (id) => document.getElementById(id);

  const TIPOS = [
    ['opcion', 'Opción múltiple'], ['numerica', 'Respuesta numérica'], ['conjunto', 'Conjunto de números'],
    ['completar', 'Completar espacios'], ['relacionar', 'Relacionar columnas'], ['crucigrama', 'Crucigrama'],
    ['abierta', 'Abierta (la califica la IA)'], ['codigo', 'Código · programación (lo califica la IA)']
  ];
  const COMPUESTOS = ['completar', 'relacionar', 'crucigrama'];
  function configInicial(tipo) {
    if (tipo === 'completar') return { modo: 'banco', distractores: [] };
    if (tipo === 'relacionar') return { pares: [['', ''], ['', ''], ['', '']], extras: [] };
    if (tipo === 'crucigrama') return { palabras: [{ palabra: '', pista: '' }, { palabra: '', pista: '' }, { palabra: '', pista: '' }] };
    return null;
  }
  const FORMULAS = [
    ['a/b', '\\dfrac{a}{b}', 'Fracción'], ['xⁿ', 'x^{n}', 'Potencia'], ['xₙ', 'x_{n}', 'Subíndice'], ['√', '\\sqrt{x}', 'Raíz cuadrada'],
    ['ⁿ√', '\\sqrt[n]{x}', 'Raíz n-ésima'], ['π', '\\pi', 'Pi'], ['·', '\\cdot', 'Por'], ['×', '\\times', 'Por (cruz)'], ['÷', '\\div', 'Entre'],
    ['≤', '\\le', 'Menor o igual'], ['≥', '\\ge', 'Mayor o igual'], ['≠', '\\ne', 'Diferente'], ['±', '\\pm', 'Más menos'], ['°', '^{\\circ}', 'Grados'],
    ['|x|', '|x|', 'Valor absoluto'], ['{ }', '\\{1, 2\\}', 'Conjunto'], ['∈', '\\in', 'Pertenece'], ['∪', '\\cup', 'Unión'], ['∩', '\\cap', 'Intersección'],
    ['ℕ', '\\mathbb{N}', 'Naturales'], ['ℤ', '\\mathbb{Z}', 'Enteros'], ['ℝ', '\\mathbb{R}', 'Reales'], ['→', '\\rightarrow', 'Flecha'], ['α', '\\alpha', 'Alfa'], ['Δ', '\\Delta', 'Delta']
  ];

  const ED = { id: '', cfg: null, bloques: [], usado: false, sucio: false, propietario: '' };

  const TIPOS_EX = [['PERIODO_1', 'Primer periodo'], ['PERIODO_2', 'Segundo periodo'], ['PERIODO_3', 'Tercer periodo'], ['SEMESTRAL', 'Semestral'], ['ADMISION', 'Admisión'], ['OTRO', 'Otro']];
  /** El semestre del examen más reciente del docente, para no escribirlo cada vez. */
  function ultimoSemestre() {
    const ex = (P().A.datos && P().A.datos.examenes || []).filter((x) => x.semestre).sort((a, b) => (b.actualizado || 0) - (a.actualizado || 0))[0];
    return ex ? ex.semestre : '';
  }
  function cfgNueva() {
    const A = P().A;
    const carpeta = A.carpetaSel && A.carpetaSel !== '__sin' ? A.carpetaSel : '';
    return {
      tipo_examen: A.tipoSel || 'PERIODO_1', carpeta,
      docente: (A.ses && A.ses.rol !== 'admin' && A.ses.nombre) || '', semestre: ultimoSemestre(), fecha_aplicacion: '', valor_porcentaje: 35,
      titulo: '', materia: (P().A.ses && P().A.ses.materia) || '', nivel: '', duracion_min: 50, max_advertencias: 3, pin_aplicador: '', seguridad: 'COMPLETA',
      aleatorizar_opciones: true, aleatorizar_preguntas: false, instrucciones: 'Haz tus procedimientos en una hoja. No se permite el uso de celular.', activo: true
    };
  }
  const preguntaNueva = (tipo) => ({
    tipo: tipo || 'opcion', inciso: '', enunciado: '', imagen_url: '', opciones: tipo === 'opcion' || !tipo ? ['', '', '', ''] : [],
    respuesta: '', puntos: COMPUESTOS.indexOf(tipo) >= 0 ? 3 : 1, ayuda: '', avisos: [], config: configInicial(tipo)
  });

  // ───────────── Abrir ─────────────
  function nuevo() {
    ED.id = ''; ED.cfg = cfgNueva(); ED.usado = false; ED.sucio = false; ED.respaldo = null; ED.sugGenerales = [];
    ED.bloques = [{ seccion: 'I. ', grupo: '', preguntas: [preguntaNueva('opcion')] }];
    mostrar();
    setTimeout(() => { const t = $('ed-cuerpo').querySelector('[data-cfg="titulo"]'); if (t) t.focus(); }, 60);
  }

  async function abrir(id) {
    try {
      const d = await P().api('examenObtener', { examen_id: id });
      ED.id = id; ED.cfg = d.examen; ED.usado = d.usado; ED.sucio = false; ED.respaldo = null; ED.sugGenerales = [];
      ED.bloques = agrupar(d.preguntas.map((q) => Object.assign({ avisos: [] }, q)));
      if (!ED.bloques.length) ED.bloques = [{ seccion: '', grupo: '', preguntas: [preguntaNueva()] }];
      mostrar();
    } catch (err) { avisar(err.message, 'peligro', 5000); }
  }

  function desdeBorrador(b, extraCfg) {
    ED.id = ''; ED.usado = false; ED.sucio = true; ED.respaldo = null;
    ED.cfg = Object.assign(cfgNueva(), {
      titulo: b.titulo || '', materia: b.materia || cfgNueva().materia, nivel: b.nivel || '', instrucciones: b.instrucciones || cfgNueva().instrucciones
    }, quitarVacios({ docente: b.docente, semestre: b.semestre, fecha_aplicacion: b.fecha_aplicacion, tipo_examen: b.tipo_examen, valor_porcentaje: b.valor_porcentaje }), extraCfg || {});
    ED.bloques = agrupar(b.preguntas);
    ED.sugGenerales = (b.sugerencias || []).slice();
    mostrar();
    const revisar = b.preguntas.filter((q) => q.avisos && q.avisos.length).length;
    const sug = b.preguntas.filter((q) => q.sugerencia).length;
    avisar('Listo: ' + b.preguntas.length + ' preguntas.' + (sug ? ' La IA tiene ' + sug + ' sugerencia' + (sug === 1 ? '' : 's') + ': acéptalas o recházalas.' : '') +
      (revisar ? ' Revisa las marcadas en amarillo.' : ''), 'ok', 9000);
  }

  function quitarVacios(o) { const r = {}; Object.keys(o).forEach((k) => { if (o[k] !== '' && o[k] != null) r[k] = o[k]; }); return r; }

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
    $('ed-variar').hidden = ED.usado;
    $('ed-deshacer').hidden = !ED.respaldo;
  }
  function marcarSucio() { ED.sucio = true; pintarResumen(); }

  function pintar() {
    const y = window.scrollY;
    const c = ED.cfg;
    const bloqueado = ED.usado;
    let html = '';
    const pendientes = sugerenciasPendientes().length;
    if (!bloqueado && (pendientes || (ED.sugGenerales && ED.sugGenerales.length))) {
      html += '<div class="ed-sug-banda">' +
        (pendientes ? '<div class="ed-sug-banda-fila"><span>💡 La IA tiene <b>' + pendientes + ' sugerencia' + (pendientes === 1 ? '' : 's') + '</b> para mejorar tus preguntas. Revísalas abajo: puedes aceptarlas o quedarte con tu versión.</span>' +
          '<span class="ed-sug-banda-acc"><button class="btn secundario chico" data-acc="sug-ir">Ver la siguiente</button>' +
          '<button class="btn secundario chico" data-acc="sug-todas-rechazar">Rechazar todas</button>' +
          '<button class="btn ok chico" data-acc="sug-todas-aceptar">Aceptar todas</button></span></div>' : '') +
        (ED.sugGenerales && ED.sugGenerales.length ? '<div class="ed-sug-generales"><b>Observaciones de la IA sobre el examen:</b><ul>' +
          ED.sugGenerales.map((g) => '<li>' + esc(g) + '</li>').join('') + '</ul><button class="btn secundario chico" data-acc="sug-gen-ok">Entendido</button></div>' : '') +
        '</div>';
    }
    if (bloqueado) {
      html += '<div class="mensaje aviso">Este examen ya se aplicó, así que <b>sus preguntas no se pueden cambiar</b> (afectaría las calificaciones). Aquí solo puedes ajustar la configuración. Para cambiar preguntas, usa <b>Duplicar</b> desde «Mis exámenes».</div>';
    }
    html += '<div class="ed-tarjeta"><div class="ed-tarjeta-tit">Datos del examen</div>' +
      '<div class="fila-ed-titulo"><div class="campo"><label>Título del examen <span class="req">*</span></label><input class="entrada" data-cfg="titulo" maxlength="150" placeholder="Ej. Segundo periodo · Física II" value="' + esc(c.titulo) + '"></div>' +
      '<div class="campo"><label>Periodo / tipo <span class="req">*</span></label><select class="entrada" data-cfg="tipo_examen">' + TIPOS_EX.map((t) => '<option value="' + t[0] + '"' + (c.tipo_examen === t[0] ? ' selected' : '') + '>' + t[1] + '</option>').join('') + '</select>' +
      '<span class="ayuda">En admisión se pide escuela de procedencia y promedio.</span></div>' +
      '<div class="campo"><label>Carpeta</label><select class="entrada" data-cfg="carpeta"><option value="">(Sin carpeta)</option>' + carpetasPropias().map((k) => '<option value="' + esc(k.carpeta_id) + '"' + (c.carpeta === k.carpeta_id ? ' selected' : '') + '>' + esc(k.nombre) + '</option>').join('') + '</select></div></div>' +
      '<div class="ed-sub-tit">Datos que verán el alumno y el PDF de resultados</div>' +
      '<div class="fila-3">' +
      '<div class="campo"><label>Docente <span class="req">*</span></label><input class="entrada" data-cfg="docente" maxlength="100" placeholder="Ej. Mtra. Ana Laura Ruiz" value="' + esc(c.docente) + '"></div>' +
      '<div class="campo"><label>Materia <span class="req">*</span></label><input class="entrada" data-cfg="materia" maxlength="80" value="' + esc(c.materia) + '"></div>' +
      '<div class="campo"><label>Grado / grupo(s)</label><input class="entrada" data-cfg="nivel" maxlength="120" placeholder="Ej. 4° semestre" value="' + esc(c.nivel) + '"></div>' +
      '</div><div class="fila-4">' +
      '<div class="campo"><label>Semestre' + reqSiNoAdm(c) + '</label><input class="entrada mono" data-cfg="semestre" maxlength="6" placeholder="2026-1" value="' + esc(c.semestre) + '"><span class="ayuda">Año y 1 o 2, ej. 2026-1</span></div>' +
      '<div class="campo"><label>Fecha de aplicación' + reqSiNoAdm(c) + '</label><input class="entrada" type="date" data-cfg="fecha_aplicacion" value="' + esc(c.fecha_aplicacion) + '"></div>' +
      '<div class="campo"><label>Valor del examen (%)</label><input class="entrada" type="number" min="1" max="100" step="0.5" data-cfg="valor_porcentaje" placeholder="35" value="' + esc(c.valor_porcentaje) + '"><span class="ayuda">Cuánto vale en la calificación del ' + (c.tipo_examen === 'SEMESTRAL' ? 'semestre' : 'periodo') + '.</span></div>' +
      '<div class="campo"><label>Duración (minutos) <span class="req">*</span></label><input class="entrada" type="number" min="5" max="300" data-cfg="duracion_min" value="' + esc(c.duracion_min) + '"><span class="ayuda">Al terminar el tiempo se envía solo.</span></div>' +
      '</div>' +
      '<div class="ed-sub-tit">Aplicación</div>' +
      '<div class="campo"><label>Seguridad</label>' +
      '<label class="casilla compacta"><input type="radio" name="ed-seg" data-cfg="seguridad" value="COMPLETA"' + (c.seguridad !== 'LIBRE' ? ' checked' : '') + '> 🔒 <b>Con candados</b>: pantalla completa; salir del examen cuenta como advertencia</label>' +
      '<label class="casilla compacta"><input type="radio" name="ed-seg" data-cfg="seguridad" value="LIBRE"' + (c.seguridad === 'LIBRE' ? ' checked' : '') + '> 🔓 <b>Sin candados</b> (examen práctico): el alumno puede usar otros programas, como Visual Studio Code, y copiar y pegar</label>' +
      '<span class="ayuda">Si solo una parte es práctica, deja «con candados» y quítalos en vivo desde <b>Aplicación en vivo › 🔓 Quitar candados</b> cuando empiece esa parte.</span></div>' +
      '<div class="fila-3"' + (c.seguridad === 'LIBRE' ? ' style="opacity:.55"' : '') + '>' +
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
  const reqSiNoAdm = (c) => (c.tipo_examen === 'ADMISION' ? '' : ' <span class="req">*</span>');
  function carpetasPropias() {
    const A = P().A;
    const dueno = ED.cfg.propietario || (A.ses && A.ses.usuario);
    return (A.datos && A.datos.carpetas || []).filter((k) => A.ses.rol !== 'admin' || k.propietario === dueno);
  }

  let uidSig = 1;
  function htmlPregunta(q, bi, qi, n, bloq) {
    const id = 'b' + bi + 'q' + qi;
    if (!q._uid) q._uid = uidSig++;
    if (COMPUESTOS.indexOf(q.tipo) >= 0 && !q.config) q.config = configInicial(q.tipo);
    let h = '<div class="ed-preg' + (q.avisos && q.avisos.length ? ' con-avisos' : '') + '" data-b="' + bi + '" data-q="' + qi + '" id="ed-' + id + '">' +
      '<div class="ed-preg-cab"><span class="num">' + n + '</span>' +
      '<input class="entrada ed-inciso" data-q-campo="inciso" maxlength="12" placeholder="Inciso" value="' + esc(q.inciso) + '"' + dis(bloq) + '>' +
      '<select class="entrada ed-tipo" data-q-campo="tipo"' + dis(bloq) + '>' + TIPOS.map((t) => '<option value="' + t[0] + '"' + (q.tipo === t[0] ? ' selected' : '') + '>' + t[1] + '</option>').join('') + '</select>' +
      '<label class="ed-pts"><input class="entrada" type="number" min="0.5" max="100" step="0.5" data-q-campo="puntos" value="' + esc(q.puntos) + '"' + dis(bloq) + '> pts</label>' +
      (bloq ? '' : '<div class="ed-iconos"><button class="ico-btn" data-acc="q-subir" title="Subir">↑</button><button class="ico-btn" data-acc="q-bajar" title="Bajar">↓</button>' +
        '<button class="ico-btn" data-acc="q-variar" title="Variar esta pregunta con IA">✨</button>' +
        '<button class="ico-btn" data-acc="q-duplicar" title="Duplicar">⧉</button><button class="ico-btn rojo" data-acc="q-borrar" title="Eliminar">✕</button></div>') +
      '</div>';
    if (q.sugerencia && !bloq) h += htmlSugerencia(q);
    if (q.avisos && q.avisos.length) {
      h += '<div class="ed-avisos"><ul>' + q.avisos.map((a) => '<li>' + esc(a) + '</li>').join('') + '</ul>' +
        (bloq ? '' : '<button class="btn secundario chico" data-acc="q-revisado">✓ Ya lo revisé</button>') + '</div>';
    }
    const esComp = q.tipo === 'completar';
    const etqEnun = esComp ? 'Texto con espacios' : (q.tipo === 'relacionar' || q.tipo === 'crucigrama' ? 'Instrucción (opcional)' : 'Pregunta');
    const phEnun = esComp ? 'Ej. El sistema de vacunación [[nacional]] pertenece a la [[Secretaría de Salud|SSA]]…' : 'Escribe la pregunta. Las fórmulas van entre signos $, ej. $\\dfrac{3}{4}$';
    h += '<div class="campo"><div class="ed-lbl"><label>' + etqEnun + '</label>' + (bloq ? '' : (esComp ? '<button type="button" class="btn secundario chico" data-acc="hueco-hacer" title="Selecciona una palabra del texto y presiona aquí">[[ ]] Convertir lo seleccionado en espacio</button>' : '') + barraFormulas()) + '</div>' +
      (esComp ? '<div class="ayuda" style="margin-bottom:6px">Pon cada respuesta entre corchetes dobles: <code>[[respuesta]]</code>. Si hay varias respuestas válidas, sepáralas con <code>|</code>: <code>[[SSA|Secretaría de Salud]]</code>.</div>' : '') +
      '<textarea class="entrada" data-q-campo="enunciado" rows="' + (esComp ? 4 : 2) + '" maxlength="4000" placeholder="' + esc(phEnun) + '"' + dis(bloq) + '>' + esc(q.enunciado) + '</textarea>' +
      '<div class="ed-prev" data-prev="enunciado">' + previaEnunciado(q) + '</div></div>';
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
          '<div class="ed-prev-op" data-prev-op="' + oi + '">' + (o && /[$`]/.test(o) ? formato(o) : '') + '</div>' +
          (bloq || q.opciones.length <= 2 ? '' : '<button class="ico-btn rojo" data-acc="op-borrar" data-o="' + oi + '" title="Quitar opción">✕</button>') + '</div>';
      }).join('') + '</div>' + (bloq || q.opciones.length >= 8 ? '' : '<button class="btn secundario chico" data-acc="op-nueva">+ Opción</button>');
    } else if (q.tipo === 'numerica' || q.tipo === 'conjunto') {
      h += '<div class="campo ed-resp"><label>Respuesta correcta</label><div class="resp-corta"><input class="entrada mono" data-q-campo="respuesta" maxlength="200" placeholder="' +
        (q.tipo === 'numerica' ? 'Ej. -9/2   (varias válidas: 1/5 | 0.2)' : 'Ej. -4, -3   (vacío: ∅)') + '" value="' + esc(q.respuesta) + '"' + dis(bloq) + '>' +
        '<div class="vista" data-prev="respuesta">' + vistaRespuesta(q) + '</div></div></div>';
    } else if (q.tipo === 'completar') {
      h += htmlConfigCompletar(q, bloq);
    } else if (q.tipo === 'relacionar') {
      h += htmlConfigRelacionar(q, bloq);
    } else if (q.tipo === 'crucigrama') {
      h += htmlConfigCrucigrama(q, bloq);
    } else if (q.tipo === 'codigo') {
      h += '<div class="campo"><label>Solución modelo o qué debe hacer el programa · la IA la usa para calificar (el alumno no la ve)</label><textarea class="entrada mono" data-q-campo="respuesta" rows="5" maxlength="4000" spellcheck="false" wrap="off" placeholder="Ej. for i in range(1, 11):&#10;    print(i * 7)"' + dis(bloq) + '>' + esc(q.respuesta) + '</textarea>' +
        '<span class="ayuda">El alumno escribe su código en un recuadro con letra de programación (la tecla Tab pone sangría). Si el examen no tiene candados, puede probarlo en Visual Studio Code y pegarlo.</span></div>';
    } else {
      h += '<div class="campo"><label>Guía para calificar · la IA la usa para calificar al momento (el alumno no la ve)</label><textarea class="entrada" data-q-campo="respuesta" rows="2" maxlength="1000" placeholder="Ej. Debe mencionar las dos formas (extensión y comprensión) con un ejemplo de cada una. 2 puntos por cada forma."' + dis(bloq) + '>' + esc(q.respuesta) + '</textarea>' +
        '<span class="ayuda">Entre más clara la guía, más justa la calificación de la IA. Siempre puedes ajustarla después en Resultados.</span></div>';
    }
    h += '<div class="campo ed-ayuda"><input class="entrada" data-q-campo="ayuda" maxlength="300" placeholder="Ayuda para el alumno (opcional), ej. «Escribe solo el resultado»" value="' + esc(q.ayuda) + '"' + dis(bloq) + '></div>';
    return h + '</div>';
  }

  function sugerenciasPendientes() {
    const l = [];
    ED.bloques.forEach((b, bi) => b.preguntas.forEach((q, qi) => { if (q.sugerencia) l.push({ q, bi, qi }); }));
    return l;
  }

  function previaPregunta(x) {
    const tipo = (TIPOS.find((t) => t[0] === x.tipo) || ['', ''])[1];
    let h = '<div class="ed-sug-tipo">' + esc(tipo) + '</div><div class="ed-sug-enun">' + formato(x.enunciado) + '</div>';
    if (x.tipo === 'opcion') {
      h += '<ul class="ed-sug-ops">' + (x.opciones || []).map((o, i) => {
        const ok = String.fromCharCode(65 + i) === x.respuesta;
        return '<li class="' + (ok ? 'ok' : '') + '"><b class="ed-sug-l">' + String.fromCharCode(97 + i) + ')</b> ' + formato(o) + (ok ? ' <b>✓</b>' : '') + '</li>';
      }).join('') + '</ul>';
    } else if (x.tipo === 'abierta' || x.tipo === 'codigo') {
      h += x.respuesta ? '<div class="pequeno"><b>Respuesta modelo:</b> ' + (x.tipo === 'codigo' ? bloqueCodigo(x.respuesta) : esc(x.respuesta)) + '</div>' : '';
    } else {
      h += '<div class="pequeno"><b>Respuesta:</b> ' + (vistaRespuesta(x) || esc(x.respuesta)) + '</div>';
    }
    return h;
  }

  function htmlSugerencia(q) {
    const s = q.sugerencia;
    return '<div class="ed-sug"><div class="ed-sug-cab"><span>💡 <b>Sugerencia de la IA</b></span><span class="ed-sug-motivo">' + esc(s.motivo || '') + '</span></div>' +
      '<div class="ed-sug-cols"><div class="ed-sug-col"><div class="ed-sug-et">Tu versión (como está ahora)</div>' + previaPregunta(q) + '</div>' +
      '<div class="ed-sug-col propuesta"><div class="ed-sug-et">Versión sugerida</div>' + previaPregunta(s) + '</div></div>' +
      '<div class="ed-sug-acc"><button class="btn secundario chico" data-acc="sug-rechazar">✕ Mantener mi versión</button>' +
      '<button class="btn ok chico" data-acc="sug-aceptar">✓ Aceptar sugerencia</button></div></div>';
  }

  function aplicarSugerencia(q) {
    const s = q.sugerencia;
    if (!s) return;
    q.tipo = s.tipo;
    q.enunciado = s.enunciado;
    q.config = s.config || (COMPUESTOS.indexOf(s.tipo) >= 0 ? configInicial(s.tipo) : null);
    q.opciones = s.tipo === 'opcion' ? (s.opciones || []).slice() : [];
    q.respuesta = s.respuesta || '';
    if (Number(s.puntos) > 0) q.puntos = Number(s.puntos);
    // Al aceptar, el docente ya la revisó; solo se conservan los avisos de figuras faltantes
    q.avisos = (q.avisos || []).filter((a) => /figura|imagen/i.test(a));
    delete q.sugerencia;
  }

  // ───────────── Editores de completar, relacionar y crucigrama ─────────────
  function previaEnunciado(q) {
    if (!q.enunciado) return '<span class="suave">Vista previa</span>';
    if (q.tipo !== 'completar') return formato(q.enunciado);
    return formato(q.enunciado).replace(/\[\[([^\]]+)\]\]/g, (m, a) => '<span class="ed-hueco">' + a.split('|')[0] + '</span>');
  }

  function listaComas(v) { return String(v || '').split(',').map((x) => x.trim()).filter(Boolean); }

  function htmlConfigCompletar(q, bloq) {
    const c = q.config || (q.config = configInicial('completar'));
    const huecos = (String(q.enunciado).match(/\[\[[^\]]+\]\]/g) || []).map((x) => x.slice(2, -2).split('|')[0]);
    let h = '<div class="ed-config"><div class="ed-lbl"><label>¿Cómo contesta el alumno?</label></div>' +
      '<label class="casilla compacta"><input type="radio" name="modo-' + q._uid + '" data-c="modo" value="banco"' + (c.modo === 'banco' ? ' checked' : '') + dis(bloq) + '> Arrastra palabras de un banco</label>' +
      '<label class="casilla compacta"><input type="radio" name="modo-' + q._uid + '" data-c="modo" value="escribir"' + (c.modo !== 'banco' ? ' checked' : '') + dis(bloq) + '> Escribe la palabra (se acepta sin acentos ni mayúsculas)</label>';
    if (c.modo === 'banco') {
      h += '<div class="campo" style="margin-top:8px"><div class="ed-lbl"><label>Palabras distractoras del banco (separadas por comas)</label>' +
        (bloq ? '' : '<button type="button" class="btn secundario chico" data-acc="ia-distractores">✨ Sugerir con IA</button>') + '</div>' +
        '<input class="entrada" data-c="distractores" maxlength="600" placeholder="Ej. privada, opcional, estatal" value="' + esc((c.distractores || []).join(', ')) + '"' + dis(bloq) + '></div>' +
        '<div class="ed-banco-prev"><span class="suave pequeno">Banco que verá el alumno (revuelto):</span> ' +
        huecos.concat(c.distractores || []).map((w) => '<span class="ed-chip">' + esc(w) + '</span>').join('') + '</div>';
    }
    return h + '<div class="ayuda">' + huecos.length + ' espacio' + (huecos.length === 1 ? '' : 's') + ' · los puntos se reparten entre ellos.</div></div>';
  }

  function htmlConfigRelacionar(q, bloq) {
    const c = q.config || (q.config = configInicial('relacionar'));
    let h = '<div class="ed-config"><div class="ed-rel-cab"><span>Columna A</span><span>Columna B (su pareja correcta)</span><span></span></div>' +
      c.pares.map((p, i) => '<div class="ed-rel-fila"><input class="entrada" data-par="' + i + '" data-lado="0" maxlength="400" placeholder="Ej. Corazón" value="' + esc(p[0]) + '"' + dis(bloq) + '>' +
        '<input class="entrada" data-par="' + i + '" data-lado="1" maxlength="400" placeholder="Ej. Bombea la sangre" value="' + esc(p[1]) + '"' + dis(bloq) + '>' +
        (bloq || c.pares.length <= 2 ? '<span></span>' : '<button class="ico-btn rojo" data-acc="par-borrar" data-i="' + i + '" title="Quitar par">✕</button>') + '</div>').join('') +
      (bloq ? '' : '<button class="btn secundario chico" data-acc="par-nuevo">+ Par</button>') +
      '<div class="campo" style="margin-top:10px"><div class="ed-lbl"><label>Elementos de más en la columna B (distractores, separados por comas)</label>' +
      (bloq ? '' : '<button type="button" class="btn secundario chico" data-acc="ia-distractores">✨ Sugerir con IA</button>') + '</div>' +
      '<input class="entrada" data-c="extras" maxlength="800" placeholder="Opcional. Ej. Produce insulina" value="' + esc((c.extras || []).join(', ')) + '"' + dis(bloq) + '></div>' +
      '<div class="ayuda">El alumno verá la columna B revuelta. Cada par correcto vale ' + (c.pares.length ? (Math.round(q.puntos / c.pares.length * 100) / 100) : 0) + ' pts.</div></div>';
    return h;
  }

  function htmlConfigCrucigrama(q, bloq) {
    const c = q.config || (q.config = configInicial('crucigrama'));
    let h = '<div class="ed-config"><div class="ed-rel-cab"><span>Palabra (sin espacios)</span><span>Pista</span><span></span></div>' +
      c.palabras.map((w, i) => '<div class="ed-rel-fila ed-cruz-fila"><input class="entrada mono" data-pal="' + i + '" data-pk="palabra" maxlength="20" placeholder="Ej. CÉLULA" value="' + esc(w.palabra) + '"' + dis(bloq) + '>' +
        '<input class="entrada" data-pal="' + i + '" data-pk="pista" maxlength="300" placeholder="Ej. Unidad básica de la vida" value="' + esc(w.pista) + '"' + dis(bloq) + '>' +
        (bloq || c.palabras.length <= 2 ? '<span></span>' : '<button class="ico-btn rojo" data-acc="pal-borrar" data-i="' + i + '" title="Quitar palabra">✕</button>') + '</div>').join('') +
      (bloq ? '' : '<button class="btn secundario chico" data-acc="pal-nueva">+ Palabra</button>') +
      '<div class="ed-cruz-prev" data-cruz-prev>' + previaCrucigrama(c) + '</div></div>';
    return h;
  }

  function previaCrucigrama(c) {
    const pals = (c.palabras || []).map((w) => Comun.letrasCrucigrama(w.palabra)).filter((p) => p.length >= 2);
    if (pals.length < 2) return '<span class="suave pequeno">Escribe al menos 2 palabras para ver el crucigrama.</span>';
    const validas = (c.palabras || []).filter((w) => Comun.letrasCrucigrama(w.palabra).length >= 2);
    const L = Comun.generarCrucigrama(validas.map((w) => w.palabra));
    const letras = {}, nums = {};
    L.items.forEach((it, k) => {
      const p = Comun.letrasCrucigrama(validas[k].palabra);
      for (let j = 0; j < it.largo; j++) letras[(it.fila + (it.dir === 'V' ? j : 0)) + ',' + (it.col + (it.dir === 'H' ? j : 0))] = p[j];
      nums[it.fila + ',' + it.col] = it.num;
    });
    let t = '<div class="suave pequeno" style="margin:8px 0 4px">Así se acomodará (el alumno verá las casillas vacías):</div><table class="cruz mini"><tbody>';
    for (let f = 0; f < L.alto; f++) {
      t += '<tr>';
      for (let col = 0; col < L.ancho; col++) {
        const k = f + ',' + col;
        t += letras[k] ? '<td class="cz">' + (nums[k] ? '<span class="cz-n">' + nums[k] + '</span>' : '') + '<span class="cz-l">' + letras[k] + '</span></td>' : '<td class="cz-negra"></td>';
      }
      t += '</tr>';
    }
    return t + '</tbody></table>';
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
    return '<div class="formulas">' + FORMULAS.map((f, i) => '<button type="button" class="fbtn" data-formula="' + i + '" title="' + esc(f[2]) + '">' + esc(f[0]) + '</button>').join('') +
      '<span class="fsep"></span><button type="button" class="fbtn fcod" data-codigo="bloque" title="Bloque de código (se ve con números de línea y colores). Puedes escribir el lenguaje después de las comillas: ```python">&lt;/&gt; Código</button>' +
      '<button type="button" class="fbtn fcod" data-codigo="linea" title="Código dentro del texto, ej. `print()`">`x`</button></div>';
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
      if (k === 'seguridad') { marcarSucio(); pintar(); return; }
      if (k === 'semestre') ED.cfg[k] = t.value.replace(/\s/g, '');
      marcarSucio();
      if (k === 'tipo_examen') pintar();
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
        prevDiferida('e' + pq.id, () => {
          if (q.tipo === 'completar') { pv.innerHTML = previaEnunciado(q); renderMate(pv); const cfg = pq.querySelector('.ed-config'); if (cfg) { const tmp = document.createElement('div'); tmp.innerHTML = htmlConfigCompletar(q, false); cfg.replaceWith(tmp.firstChild); } }
          else { pv.innerHTML = t.value ? formato(t.value) : '<span class="suave">Vista previa</span>'; renderMate(pv); }
        });
      } else if (campo === 'respuesta' && (q.tipo === 'numerica' || q.tipo === 'conjunto')) {
        pq.querySelector('[data-prev="respuesta"]').innerHTML = vistaRespuesta(q);
      } else if (campo === 'imagen_url' && /^https:\/\/\S+$/.test(t.value.trim())) {
        prevDiferida('i' + pq.id, () => { q.imagen_url = t.value.trim(); pintar(); });
      }
      if (campo === 'puntos') pintarResumen();
      marcarSucio();
    } else if (t.dataset.c || t.dataset.par != null || t.dataset.pal != null) {
      q.config = q.config || configInicial(q.tipo);
      if (t.dataset.c === 'modo') { q.config.modo = t.value; marcarSucio(); pintar(); return; }
      if (t.dataset.c === 'distractores') q.config.distractores = listaComas(t.value);
      else if (t.dataset.c === 'extras') q.config.extras = listaComas(t.value);
      else if (t.dataset.par != null) q.config.pares[Number(t.dataset.par)][Number(t.dataset.lado)] = t.value;
      else if (t.dataset.pal != null) {
        q.config.palabras[Number(t.dataset.pal)][t.dataset.pk] = t.value;
        const pv = pq.querySelector('[data-cruz-prev]');
        prevDiferida('cz' + pq.id, () => { pv.innerHTML = previaCrucigrama(q.config); });
      }
      marcarSucio();
    } else if (t.dataset.qOp != null) {
      const oi = Number(t.dataset.qOp);
      q.opciones[oi] = t.value;
      const pv = pq.querySelector('[data-prev-op="' + oi + '"]');
      prevDiferida('o' + pq.id + oi, () => { pv.innerHTML = /[$`]/.test(t.value) ? formato(t.value) : ''; renderMate(pv); });
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
      if (COMPUESTOS.indexOf(q.tipo) >= 0 && (!q.config || antes !== q.tipo)) q.config = configInicial(q.tipo)
      if (COMPUESTOS.indexOf(q.tipo) >= 0 && COMPUESTOS.indexOf(antes) < 0 && Number(q.puntos) === 1) q.puntos = 3;
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
    const fc = e.target.closest('[data-codigo]');
    if (fc) {
      const pq = fc.closest('.ed-preg');
      const campo = ultimoCampo && pq.contains(ultimoCampo) ? ultimoCampo : pq.querySelector('textarea[data-q-campo="enunciado"]');
      insertarCodigo(campo, fc.dataset.codigo === 'bloque');
      return;
    }
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
      case 'par-nuevo': bloque.preguntas[qi].config.pares.push(['', '']); break;
      case 'par-borrar': bloque.preguntas[qi].config.pares.splice(Number(b.dataset.i), 1); break;
      case 'pal-nueva': bloque.preguntas[qi].config.palabras.push({ palabra: '', pista: '' }); break;
      case 'pal-borrar': bloque.preguntas[qi].config.palabras.splice(Number(b.dataset.i), 1); break;
      case 'hueco-hacer': {
        const ta = pq.querySelector('textarea[data-q-campo="enunciado"]');
        const i = ta.selectionStart, j = ta.selectionEnd;
        if (i === j) { avisar('Primero selecciona en el texto la palabra que será el espacio.', '', 4000); return; }
        const sel = ta.value.slice(i, j).trim();
        ta.value = ta.value.slice(0, i) + '[[' + sel + ']]' + ta.value.slice(j);
        bloque.preguntas[qi].enunciado = ta.value;
        break;
      }
      case 'ia-distractores': sugerirDistractores(bloque.preguntas[qi], b); return;
      case 'sug-aceptar': aplicarSugerencia(bloque.preguntas[qi]); break;
      case 'sug-rechazar': delete bloque.preguntas[qi].sugerencia; break;
      case 'sug-todas-aceptar': {
        const l = sugerenciasPendientes();
        P().confirmar('Aceptar todas las sugerencias', 'Se aplicarán las ' + l.length + ' sugerencias de la IA. Revisa que las respuestas sean correctas antes de guardar.', '', async () => {
          l.forEach((x) => aplicarSugerencia(x.q)); marcarSucio(); pintar();
        });
        return;
      }
      case 'sug-todas-rechazar': {
        const l = sugerenciasPendientes();
        P().confirmar('Rechazar todas las sugerencias', 'Se descartarán las ' + l.length + ' sugerencias y se conservarán tus versiones.', '', async () => {
          l.forEach((x) => { delete x.q.sugerencia; }); marcarSucio(); pintar();
        });
        return;
      }
      case 'sug-ir': {
        const x = sugerenciasPendientes()[0];
        const el = x && document.getElementById('ed-b' + x.bi + 'q' + x.qi);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      case 'sug-gen-ok': ED.sugGenerales = []; break;
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
      case 'q-variar':
        if (COMPUESTOS.indexOf(bloque.preguntas[qi].tipo) >= 0) { avisar('La variación con IA todavía no está disponible para completar, relacionar ni crucigrama. Puedes editarla a mano.', '', 6000); return; }
        variar([bloque.preguntas[qi]], b); return;
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

  function insertarCodigo(campo, bloque) {
    if (!campo || campo.disabled) return;
    const v = campo.value, i = campo.selectionStart ?? v.length, j = campo.selectionEnd ?? v.length;
    const sel = v.slice(i, j);
    let texto, pos;
    if (bloque && campo.tagName === 'TEXTAREA') {
      const antes = i > 0 && v[i - 1] !== '\n' ? '\n' : '';
      texto = antes + '```\n' + (sel || '') + '\n```' + (v[j] && v[j] !== '\n' ? '\n' : '');
      pos = i + antes.length + 4 + (sel ? sel.length : 0);
    } else {
      texto = '`' + (sel || '') + '`';
      pos = i + 1 + sel.length;
    }
    campo.value = v.slice(0, i) + texto + v.slice(j);
    campo.focus();
    campo.setSelectionRange(pos, pos);
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  }
  // Dentro de un bloque de código, la tecla Tab pone sangría (4 espacios) en vez de cambiar de campo
  $('ed-cuerpo').addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.key !== 'Tab' || e.ctrlKey || e.altKey || t.tagName !== 'TEXTAREA') return;
    const v = t.value, i = t.selectionStart;
    const enBloque = t.classList.contains('mono') || ((v.slice(0, i).match(/```/g) || []).length % 2 === 1);
    if (!enBloque || t.disabled) return;
    e.preventDefault();
    if (e.shiftKey) {
      const ini = v.lastIndexOf('\n', i - 1) + 1;
      const quitar = (v.slice(ini, ini + 4).match(/^ {1,4}/) || [''])[0].length;
      if (!quitar) return;
      t.value = v.slice(0, ini) + v.slice(ini + quitar);
      t.selectionStart = t.selectionEnd = Math.max(ini, i - quitar);
    } else {
      t.value = v.slice(0, i) + '    ' + v.slice(t.selectionEnd);
      t.selectionStart = t.selectionEnd = i + 4;
    }
    t.dispatchEvent(new Event('input', { bubbles: true }));
  });

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
    const c = ED.cfg;
    if (String(c.titulo || '').trim().length < 3) return { msg: 'Escribe el título del examen.', sel: '[data-cfg="titulo"]' };
    if (String(c.docente || '').trim().length < 3) return { msg: 'Escribe el nombre del docente.', sel: '[data-cfg="docente"]' };
    if (String(c.materia || '').trim().length < 2) return { msg: 'Escribe la materia.', sel: '[data-cfg="materia"]' };
    const sem = String(c.semestre || '').replace(/\s/g, '');
    if (sem && !/^\d{4}-[12]$/.test(sem)) return { msg: 'El semestre se escribe como 2026-1 o 2026-2.', sel: '[data-cfg="semestre"]' };
    if (c.tipo_examen !== 'ADMISION') {
      if (!sem) return { msg: 'Escribe el semestre (ej. 2026-1).', sel: '[data-cfg="semestre"]' };
      if (!c.fecha_aplicacion) return { msg: 'Indica la fecha de aplicación.', sel: '[data-cfg="fecha_aplicacion"]' };
    }
    if (c.valor_porcentaje !== '' && c.valor_porcentaje != null && !(Number(c.valor_porcentaje) > 0 && Number(c.valor_porcentaje) <= 100)) return { msg: 'El valor del examen debe estar entre 1 y 100%.', sel: '[data-cfg="valor_porcentaje"]' };
    if (ED.usado) return null;
    let n = 0;
    for (let bi = 0; bi < ED.bloques.length; bi++) {
      for (let qi = 0; qi < ED.bloques[bi].preguntas.length; qi++) {
        n++;
        const q = ED.bloques[bi].preguntas[qi];
        const sel = '#ed-b' + bi + 'q' + qi;
        const err = (m) => ({ msg: 'Pregunta ' + n + ': ' + m, sel });
        if (!String(q.enunciado).trim() && !q.imagen_url && q.tipo !== 'relacionar' && q.tipo !== 'crucigrama') return err('escribe la pregunta.');
        if (!(Number(q.puntos) > 0)) return err('los puntos deben ser mayores a 0.');
        if (q.tipo === 'opcion') {
          if (q.opciones.length < 2 || q.opciones.some((o) => !String(o).trim())) return err('llena todas las opciones (mínimo 2).');
          if (!q.respuesta) return err('marca cuál opción es la correcta.');
        } else if (q.tipo === 'numerica') {
          const alts = String(q.respuesta).split('|').map((s) => s.trim()).filter(Boolean);
          if (!alts.length || alts.some((a) => !leerNumero(a, true))) return err('escribe la respuesta correcta como número, fracción o decimal.');
        } else if (q.tipo === 'conjunto') {
          if (!leerConjunto(q.respuesta)) return err('escribe la respuesta como números separados por comas.');
        } else if (q.tipo === 'completar') {
          if (!/\[\[[^\]]+\]\]/.test(q.enunciado)) return err('marca al menos un espacio con [[respuesta]].');
        } else if (q.tipo === 'relacionar') {
          const pares = (q.config.pares || []).filter((p) => p[0].trim() || p[1].trim());
          if (pares.length < 2 || pares.some((p) => !p[0].trim() || !p[1].trim())) return err('llena al menos 2 pares, con ambas columnas.');
        } else if (q.tipo === 'crucigrama') {
          const pals = (q.config.palabras || []).filter((w) => w.palabra.trim() || w.pista.trim());
          if (pals.length < 2) return err('agrega al menos 2 palabras.');
          if (pals.some((w) => Comun.letrasCrucigrama(w.palabra).length < 2 || !w.pista.trim())) return err('cada palabra necesita al menos 2 letras y su pista.');
        }
      }
    }
    return n ? null : { msg: 'Agrega al menos una pregunta.' };
  }

  $('ed-guardar').addEventListener('click', guardar);
  $('ed-probar').addEventListener('click', () => {
    if (!ED.id || ED.sucio) { avisar('Primero guarda el examen para poder probarlo.', 'peligro', 5000); return; }
    P().probarComoAlumno(ED.id);
  });
  async function guardar() {
    const v = validar();
    if (v) {
      avisar(v.msg, 'peligro', 6000);
      const el = v.sel && $('ed-cuerpo').querySelector(v.sel);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('error-flash'); setTimeout(() => el.classList.remove('error-flash'), 2000); }
      return;
    }
    const pendientes = sugerenciasPendientes().length;
    if (pendientes && !ED.usado) {
      P().confirmar('Sugerencias sin decidir', 'Hay ' + pendientes + ' sugerencia(s) de la IA sin aceptar ni rechazar. Si guardas ahora, se guardará tu versión de esas preguntas y las sugerencias se descartarán. ¿Guardar así?', '', async () => {
        sugerenciasPendientes().forEach((x) => { delete x.q.sugerencia; });
        pintar();
        await enviarGuardado();
      });
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
          opciones: q.tipo === 'opcion' ? q.opciones : [], respuesta: q.respuesta, puntos: q.puntos, ayuda: q.ayuda,
          config: COMPUESTOS.indexOf(q.tipo) >= 0 ? q.config : undefined
        })));
      }
      const r = await P().api('examenGuardar', datos);
      ED.id = r.examen_id;
      ED.sucio = false;
      ED.respaldo = null;
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
            return '<div class="opcion ' + (l === q.respuesta ? 'correcta-prev' : '') + '"><span class="letra">' + l.toLowerCase() + '</span><span>' + formato(o) + '</span></div>';
          }).join('') + '</div>';
        } else if (q.tipo === 'abierta' || q.tipo === 'codigo') {
          resp = '<div class="resp" style="grid-template-columns:1fr"><div><b>' + (q.tipo === 'codigo' ? 'Código · solución modelo para la IA' : 'Abierta · guía para la IA') + '</b>' + (q.tipo === 'codigo' && q.respuesta ? bloqueCodigo(q.respuesta) : esc(q.respuesta || '—')) + '</div></div>';
        } else if (q.tipo === 'completar') {
          resp = '<div class="resp" style="grid-template-columns:1fr"><div><b>' + (q.config && q.config.modo === 'banco' ? 'Con banco de palabras' : 'El alumno escribe') + '</b>' +
            (q.config && q.config.modo === 'banco' && q.config.distractores.length ? 'Distractores: ' + esc(q.config.distractores.join(', ')) : '') + '</div></div>';
        } else if (q.tipo === 'relacionar') {
          resp = '<div class="resp" style="grid-template-columns:1fr"><div><b>Pares correctos</b>' + q.config.pares.map((pp) => esc(pp[0]) + ' → ' + esc(pp[1])).join('<br>') +
            (q.config.extras && q.config.extras.length ? '<br><span class="suave">De más: ' + esc(q.config.extras.join(', ')) + '</span>' : '') + '</div></div>';
        } else if (q.tipo === 'crucigrama') {
          resp = previaCrucigrama(q.config);
        } else {
          resp = '<div class="resp" style="grid-template-columns:1fr"><div><b>Respuesta correcta</b>' + vistaRespuesta(q) + '</div></div>';
        }
        html += '<div class="item-rev"><div class="top"><div class="enun"><b>' + n + '. ' + esc(q.inciso) + '</b> ' + previaEnunciado(q) + '</div><div class="pequeno suave">' + q.puntos + ' pts</div></div>' +
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

  /** Recorta de la página la figura que señaló la IA, la sube a Drive y la pone en la pregunta. */
  async function ponerFigura(q, pag) {
    try {
      const recorte = await recortarFigura(pag, q.figura);
      if (!recorte) throw new Error('vacía');
      const r = await P().api('subirImagen', { archivo: { nombre: 'figura-importada.jpg', mime: recorte.mime, datos: recorte.datos } }, { espera: 60000, reintentos: 1 });
      q.imagen_url = r.url;
      q.avisos = (q.avisos || []).concat('La figura se recortó del documento: revisa que esté completa (puedes cambiarla con «Agregar imagen»).');
    } catch (err) {
      q.avisos = (q.avisos || []).concat('El documento tiene una figura en esta pregunta y no se pudo recortar' + (err && err.codigo ? ' (' + err.message + ')' : '') + ': súbela con «Agregar imagen».');
    }
  }

  function cargarImagen(src) {
    return new Promise((ok, mal) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => mal(new Error('imagen')); im.src = src; });
  }

  /** Recorta un rectángulo [x0,y0,x1,y1] (fracciones de la página) con un pequeño margen y quita el blanco sobrante. */
  async function recortarFigura(pag, caja) {
    const im = await cargarImagen('data:' + pag.mime + ';base64,' + pag.datos);
    const W = im.naturalWidth, H = im.naturalHeight;
    const pad = 0.012;
    const x0 = Math.max(0, Math.floor((caja[0] - pad) * W)), y0 = Math.max(0, Math.floor((caja[1] - pad) * H));
    const x1 = Math.min(W, Math.ceil((caja[2] + pad) * W)), y1 = Math.min(H, Math.ceil((caja[3] + pad) * H));
    let w = x1 - x0, h = y1 - y0;
    if (w < 20 || h < 20) return null;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(im, x0, y0, w, h, 0, 0, w, h);
    // Quitar el margen blanco alrededor de la figura
    const px = ctx.getImageData(0, 0, w, h).data;
    const tinta = (x, y) => { const k = (y * w + x) * 4; return px[k] < 235 || px[k + 1] < 235 || px[k + 2] < 235; };
    let top = 0, bot = h - 1, izq = 0, der = w - 1;
    const filaVacia = (y) => { for (let x = 0; x < w; x += 2) if (tinta(x, y)) return false; return true; };
    const colVacia = (x) => { for (let y = top; y <= bot; y += 2) if (tinta(x, y)) return false; return true; };
    while (top < bot && filaVacia(top)) top++;
    while (bot > top && filaVacia(bot)) bot--;
    while (izq < der && colVacia(izq)) izq++;
    while (der > izq && colVacia(der)) der--;
    if (bot - top < 12 || der - izq < 12) return null;
    const m = 10;
    const cx = Math.max(0, izq - m), cy = Math.max(0, top - m);
    w = Math.min(c.width, der + m + 1) - cx; h = Math.min(c.height, bot + m + 1) - cy;
    const escala = Math.min(1, 1600 / w);
    const f = document.createElement('canvas');
    f.width = Math.round(w * escala); f.height = Math.round(h * escala);
    const fx = f.getContext('2d');
    fx.fillStyle = '#fff'; fx.fillRect(0, 0, f.width, f.height);
    fx.drawImage(c, cx, cy, w, h, 0, 0, f.width, f.height);
    return { mime: 'image/jpeg', datos: f.toDataURL('image/jpeg', 0.92).split(',')[1] };
  }

  $('ia-ok').addEventListener('click', async () => {
    if (IA.resultadoParcial) { const b = IA.resultadoParcial; IA.resultadoParcial = null; $('m-importar').hidden = true; desdeBorrador(b); return; }
    const total = Math.min(10, IA.paginas);
    if (!total) return;
    IA.trabajando = true; IA.cancelado = false;
    const btn = $('ia-ok');
    cargando(btn, true, 'Convirtiendo…');
    $('ia-progreso').hidden = false; $('msg-ia').innerHTML = '';
    const borrador = { titulo: '', materia: '', nivel: '', instrucciones: '', preguntas: [], sugerencias: [] };
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
        const conFigura = b.preguntas.filter((q) => q.figura);
        for (let k = 0; k < conFigura.length; k++) {
          if (IA.cancelado || $('m-importar').hidden) throw new Error('Se canceló la conversión.');
          progreso(i + 0.8, 'Recortando figura ' + (k + 1) + ' de ' + conFigura.length + ' de la página ' + (i + 1) + '…');
          await ponerFigura(conFigura[k], pag);
        }
        b.preguntas.forEach((q) => { delete q.figura; });
        if (i === 0) Object.assign(borrador, { titulo: b.titulo, materia: b.materia, nivel: b.nivel, instrucciones: b.instrucciones,
          docente: b.docente, semestre: b.semestre, fecha_aplicacion: b.fecha_aplicacion, tipo_examen: b.tipo_examen, valor_porcentaje: b.valor_porcentaje });
        borrador.preguntas = borrador.preguntas.concat(b.preguntas);
        borrador.sugerencias = borrador.sugerencias.concat(b.sugerencias || []).slice(0, 5);
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

  // ───────────── Variar preguntas con IA ─────────────
  const LOTE_IA = 6; // preguntas por llamada (cada llamada debe terminar en menos de ~60 s)

  /** Pide a la IA variaciones de las preguntas dadas y las aplica en su lugar (q se modifica). */
  async function variarLista(lista, progreso) {
    for (let i = 0; i < lista.length; i += LOTE_IA) {
      const lote = lista.slice(i, i + LOTE_IA);
      if (progreso) progreso(i, lista.length);
      const r = await P().api('examenVariarIA', {
        preguntas: lote.map((q) => ({ tipo: q.tipo, enunciado: q.enunciado, opciones: q.opciones, respuesta: q.respuesta }))
      }, { espera: 120000, reintentos: 1 });
      // La variación no se aplica sola: queda como sugerencia para que el docente la acepte o no
      r.preguntas.forEach((v, k) => {
        const q = lote[k];
        const cambios = ((v.avisos || [])[0] || '').match(/\((.*)\)/);
        q.sugerencia = {
          tipo: q.tipo, enunciado: v.enunciado, opciones: q.tipo === 'opcion' ? v.opciones : [], respuesta: v.respuesta,
          motivo: 'Variación para que no sea idéntica' + (cambios ? ': ' + cambios[1] : '') + '. Verifica la respuesta.' +
            (q.imagen_url ? ' Ojo: la pregunta tiene imagen; revisa que siga correspondiendo.' : '') +
            ((v.avisos || []).slice(1).length ? ' ' + v.avisos.slice(1).join(' ') : '')
        };
      });
    }
    if (progreso) progreso(lista.length, lista.length);
  }

  async function variar(lista, boton) {
    if (P().A.datos && P().A.datos.sesion && !P().A.datos.sesion.ia) {
      avisar('La IA no está configurada. Pide al administrador que ponga la clave de IA en la hoja Config.', 'peligro', 7000); return;
    }
    if (boton) cargando(boton, true, lista.length > 1 ? 'Variando…' : '');
    try {
      await variarLista(lista, (i, n) => { if (n > 1) avisar('La IA está variando las preguntas… ' + Math.min(n, i + LOTE_IA) + ' de ' + n, '', 120000); });
      marcarSucio(); pintar();
      avisar(lista.length > 1 ? 'Listo: cada pregunta tiene su variación sugerida. Acéptala o quédate con la original.' : 'Variación lista: acéptala o quédate con la original.', 'ok', 8000);
      if (lista.length === 1) {
        const x = sugerenciasPendientes().find((y) => y.q === lista[0]);
        const el = x && document.getElementById('ed-b' + x.bi + 'q' + x.qi);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (err) {
      avisar(err.message, 'peligro', 7000);
    } finally { if (boton) cargando(boton, false); }
  }

  $('ed-variar').addEventListener('click', () => {
    const todas = [];
    ED.bloques.forEach((b) => b.preguntas.forEach((q) => { if (COMPUESTOS.indexOf(q.tipo) < 0) todas.push(q); }));
    P().confirmar('Variar todas las preguntas con IA', 'La IA propondrá una variación de cada una de las ' + todas.length + ' preguntas (otros valores y datos, con su respuesta recalculada). No se cambia nada hasta que aceptes cada sugerencia. Tarda unos segundos por cada ' + LOTE_IA + ' preguntas.', '', async () => {
      P().cerrarModal('m-confirmar');
      await variar(todas, $('ed-variar'));
    });
  });
  $('ed-deshacer').addEventListener('click', () => {
    if (!ED.respaldo) return;
    ED.bloques = ED.respaldo; ED.respaldo = null;
    marcarSucio(); pintar();
    avisar('Se restauraron las preguntas originales.', 'ok');
  });

  // ───────────── Crear semestral a partir de los periodos ─────────────
  const ORDEN_TIPO = { PERIODO_1: 1, PERIODO_2: 2, PERIODO_3: 3 };
  function semestral() {
    const A = P().A;
    const exs = A.datos.examenes.filter((x) => x.tipo_examen !== 'ADMISION' && x.tipo_examen !== 'SEMESTRAL' && x.total_preguntas > 0)
      .sort((a, b) => (ORDEN_TIPO[a.tipo_examen] || 9) - (ORDEN_TIPO[b.tipo_examen] || 9) || a.titulo.localeCompare(b.titulo, 'es'));
    if (!exs.length) { avisar('Primero crea tus exámenes de periodo.', 'peligro', 5000); return; }
    const nombres = { PERIODO_1: 'Primer periodo', PERIODO_2: 'Segundo periodo', PERIODO_3: 'Tercer periodo', OTRO: 'Otro' };
    $('sem-lista').innerHTML = exs.map((x) => '<label class="sem-item"><input type="checkbox" data-sem="' + esc(x.examen_id) + '"' + (ORDEN_TIPO[x.tipo_examen] ? ' checked' : '') + '>' +
      '<div><b>' + esc(x.titulo) + '</b><div class="pequeno suave">' + esc([nombres[x.tipo_examen], x.materia, x.total_preguntas + ' preguntas · ' + x.puntos_max + ' pts'].filter(Boolean).join(' · ')) + '</div></div></label>').join('');
    const materia = (exs[0] && exs[0].materia) || '';
    $('sem-titulo').value = 'Examen semestral' + (materia ? ' · ' + materia : '');
    $('sem-ia').checked = false;
    $('sem-ia-caja').hidden = !(A.datos.sesion && A.datos.sesion.ia);
    $('msg-sem').innerHTML = ''; $('sem-progreso').hidden = true;
    $('m-semestral').hidden = false;
  }

  function revolver(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  $('sem-ok').addEventListener('click', async () => {
    const ids = Array.from($('sem-lista').querySelectorAll('[data-sem]:checked')).map((x) => x.dataset.sem);
    if (!ids.length) { $('msg-sem').innerHTML = '<div class="mensaje error">Elige al menos un examen.</div>'; return; }
    const btn = $('sem-ok');
    cargando(btn, true, 'Creando…');
    $('msg-sem').innerHTML = '';
    try {
      const preguntas = [];
      let materia = '', nivel = '';
      for (const id of ids) {
        const d = await P().api('examenObtener', { examen_id: id });
        materia = materia || d.examen.materia; nivel = nivel || d.examen.nivel;
        let bloques = agrupar(d.preguntas.map((q) => Object.assign({}, q)));
        bloques.forEach((b) => {
          let qs = b.preguntas;
          if ($('sem-orden').checked) qs = revolver(qs);
          qs.forEach((q) => {
            if ($('sem-opciones').checked && q.tipo === 'opcion' && q.opciones.length > 1) {
              const correcta = q.opciones[q.respuesta.charCodeAt(0) - 65];
              const nuevas = revolver(q.opciones);
              q.opciones = nuevas;
              q.respuesta = String.fromCharCode(65 + nuevas.indexOf(correcta));
            }
            q.seccion = d.examen.titulo + (b.seccion ? ' — ' + b.seccion : '');
            q.grupo = b.grupo;
            q.inciso = '';
            q.avisos = [];
            preguntas.push(q);
          });
        });
      }
      if ($('sem-ia').checked) {
        $('sem-progreso').hidden = false;
        await variarLista(preguntas, (i, n) => {
          $('sem-barra').style.width = Math.round((i / n) * 100) + '%';
          $('sem-texto').textContent = 'La IA está variando las preguntas: ' + Math.min(n, i + LOTE_IA) + ' de ' + n + '…';
        });
      }
      $('m-semestral').hidden = true;
      desdeBorrador({ titulo: $('sem-titulo').value, materia, nivel, instrucciones: cfgNueva().instrucciones, preguntas },
        { tipo_examen: 'SEMESTRAL', duracion_min: 90 });
      if (!$('sem-ia').checked) avisar('Semestral armado con ' + preguntas.length + ' preguntas. Puedes quitar preguntas, editarlas o usar «✨ Variar con IA».', 'ok', 8000);
    } catch (err) {
      $('msg-sem').innerHTML = '<div class="mensaje error">' + esc(err.message) + '</div>';
    } finally { cargando(btn, false); }
  });

  async function sugerirDistractores(q, boton) {
    if (P().A.datos && P().A.datos.sesion && !P().A.datos.sesion.ia) { avisar('La IA no está configurada en la hoja Config.', 'peligro', 6000); return; }
    const correctas = q.tipo === 'relacionar' ? q.config.pares.map((p) => p[1]).filter(Boolean)
      : (String(q.enunciado).match(/\[\[[^\]]+\]\]/g) || []).map((x) => x.slice(2, -2).split('|')[0]);
    if (!correctas.length) { avisar(q.tipo === 'relacionar' ? 'Primero llena los pares.' : 'Primero marca los espacios con [[ ]].', '', 4000); return; }
    const contexto = q.tipo === 'relacionar' ? q.config.pares.map((p) => p[0] + ' → ' + p[1]).join('\n') : q.enunciado;
    cargando(boton, true, 'Pensando…');
    try {
      const r = await P().api('iaDistractores', { tipo: q.tipo, contexto, correctas }, { espera: 90000 });
      if (!r.distractores.length) { avisar('La IA no propuso distractores; escríbelos a mano.', '', 5000); return; }
      const actuales = q.tipo === 'relacionar' ? q.config.extras || [] : q.config.distractores || [];
      const nuevos = actuales.concat(r.distractores.filter((d) => actuales.indexOf(d) < 0));
      if (q.tipo === 'relacionar') q.config.extras = nuevos.slice(0, 10); else q.config.distractores = nuevos.slice(0, 30);
      marcarSucio(); pintar();
      avisar('Se agregaron ' + r.distractores.length + ' sugerencias. Bórralas o edítalas si no te convencen.', 'ok', 6000);
    } catch (err) { avisar(err.message, 'peligro', 6000); } finally { cargando(boton, false); }
  }

  window.Editor = { nuevo, abrir, importar, desdeBorrador, semestral };
})();
