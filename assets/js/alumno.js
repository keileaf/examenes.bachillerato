/* Página del alumno: acceso con código, datos, reglas y examen con candados de seguridad. */
(function () {
  'use strict';
  const { llamar, Reloj, esc, formato, bloqueCodigo, renderMate, latex, leerNumero, leerConjunto, avisar, cargando, formatoTiempo } = window.Comun;
  const $ = (id) => document.getElementById(id);
  const CLAVE_SESION = 'examenSeguro.sesion';
  const CLAVE_RESP = 'examenSeguro.respuestas.';

  const E = {
    codigo: '', token: '', info: null, datos: null, situacion: '',
    examen: null, grupos: [], items: [], respuestas: {}, limite: 0,
    advertencias: 0, max: 3, requierePin: false, bloqueado: false,
    grupoActual: 0, activo: false, terminado: false, enviando: false,
    sucio: false, guardando: false, enInfraccion: false, ultimaInfraccion: 0, ultimasLeves: {}
  };

  // ───────────── Navegación entre pantallas ─────────────
  function mostrar(id) {
    ['p-codigo', 'p-datos', 'p-reglas', 'p-examen', 'p-fin', 'p-prueba'].forEach((p) => { $(p).hidden = p !== id; });
    document.body.classList.toggle('en-examen', id === 'p-examen');
    window.scrollTo(0, 0);
  }
  function mensaje(id, texto, tipo) { $(id).innerHTML = texto ? '<div class="mensaje ' + (tipo || 'error') + '">' + esc(texto) + '</div>' : ''; }

  function leerSesion() { try { return JSON.parse(localStorage.getItem(CLAVE_SESION) || 'null'); } catch (e) { return null; } }
  function guardarSesion() { try { localStorage.setItem(CLAVE_SESION, JSON.stringify({ codigo: E.codigo, token: E.token })); } catch (e) { /* */ } }
  function respaldoLocal() { try { localStorage.setItem(CLAVE_RESP + E.codigo, JSON.stringify(E.respuestas)); } catch (e) { /* */ } }
  function leerRespaldo(codigo) { try { return JSON.parse(localStorage.getItem(CLAVE_RESP + codigo) || '{}') || {}; } catch (e) { return {}; } }
  function borrarSesion() { try { localStorage.removeItem(CLAVE_SESION); localStorage.removeItem(CLAVE_RESP + E.codigo); } catch (e) { /* */ } }

  // ───────────── 1. Código ─────────────
  $('in-codigo').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });
  $('form-codigo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const codigo = $('in-codigo').value.trim().toUpperCase();
    if (codigo.length < 4) { mensaje('msg-codigo', 'Escribe tu código completo.'); return; }
    const btn = $('btn-codigo');
    cargando(btn, true, 'Verificando…');
    mensaje('msg-codigo', '');
    try {
      const ses = leerSesion();
      const token = ses && ses.codigo === codigo ? ses.token : '';
      const r = await llamar('validarCodigo', { codigo, token });
      E.codigo = codigo; E.token = token; E.info = r.examen; E.situacion = r.situacion;
      if (r.situacion === 'NUEVO') {
        $('datos-examen-titulo').textContent = [r.examen.titulo, r.examen.nivel, r.examen.grupo ? 'Grupo ' + r.examen.grupo : ''].filter(Boolean).join(' · ');
        $('datos-admision').hidden = !r.examen.esAdmision;
        mostrar('p-datos');
        setTimeout(() => $('in-nombre').focus(), 50);
      } else {
        prepararReglas(r.alumno);
        mostrar('p-reglas');
      }
    } catch (err) {
      mensaje('msg-codigo', err.message);
    } finally { cargando(btn, false); }
  });

  // ───────────── 2. Datos ─────────────
  $('btn-datos-atras').addEventListener('click', () => mostrar('p-codigo'));
  $('in-promedio').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/[^0-9.,]/g, ''); });
  $('form-datos').addEventListener('submit', (e) => {
    e.preventDefault();
    const campos = { nombre: $('in-nombre'), apellidos: $('in-apellidos'), escuela: $('in-escuela'), promedio: $('in-promedio') };
    Object.values(campos).forEach((c) => c.classList.remove('error'));
    const d = {};
    for (const k in campos) d[k] = campos[k].value.replace(/\s+/g, ' ').trim();
    const faltan = [];
    if (d.nombre.length < 2) faltan.push('nombre');
    if (d.apellidos.length < 2) faltan.push('apellidos');
    if (E.info.esAdmision) {
      if (d.escuela.length < 2) faltan.push('escuela');
      const prom = Number(d.promedio.replace(',', '.'));
      if (!d.promedio || !isFinite(prom) || prom < 5 || prom > 10) faltan.push('promedio');
    } else { delete d.escuela; delete d.promedio; }
    if (faltan.length) {
      faltan.forEach((k) => campos[k].classList.add('error'));
      campos[faltan[0]].focus();
      mensaje('msg-datos', faltan.includes('promedio') && faltan.length === 1 ? 'Escribe tu promedio aproximado entre 5.0 y 10.0.' : 'Todos los campos son obligatorios.');
      return;
    }
    mensaje('msg-datos', '');
    E.datos = d;
    prepararReglas({ nombre: d.nombre });
    mostrar('p-reglas');
  });

  // ───────────── 3. Reglas ─────────────
  function prepararReglas(alumno) {
    const ex = E.info;
    const reanudar = E.situacion === 'REANUDAR';
    $('reglas-titulo').textContent = reanudar ? 'Continuar examen' : 'Antes de empezar';
    $('reglas-sub').textContent = (alumno && alumno.nombre ? alumno.nombre + ', ' : '') +
      (reanudar ? 'tu examen sigue en curso y tus respuestas están guardadas. El reloj no se detuvo.' : 'lee con atención las reglas del examen.');
    $('reglas-ficha').innerHTML = fichaExamen(ex);
    $('reglas-pastillas').innerHTML = [
      '📘 ' + esc(ex.titulo), '📝 ' + ex.totalPreguntas + ' preguntas', '⚠ ' + ex.maxAdvertencias + ' advertencias máximo'
    ].map((t) => '<span class="pastilla">' + t + '</span>').join('');
    const libre = ex.seguridad === 'LIBRE';
    const reglas = libre ? [
      ['💻', 'En este examen <b>sí puedes usar otros programas</b> de la computadora (por ejemplo, <b>Visual Studio Code</b>) y copiar y pegar tu código.', true],
      ['🚫', 'No uses internet, chats ni inteligencia artificial, salvo que tu profesor lo indique.', false],
      ['⏱', 'Tienes <b>' + ex.duracionMin + ' minutos</b>. Al terminar el tiempo, el examen se envía automáticamente con lo que hayas contestado.', false],
      ['✓', 'Tus respuestas se guardan solas mientras contestas. Regresa a esta pestaña para seguir contestando.', false]
    ] : [
      ['⛶', 'El examen se presenta en <b>pantalla completa</b>. No salgas de ella.', false],
      ['⇆', 'No cambies de pestaña ni de ventana, ni abras otros programas. Cada salida se registra con la hora y el aplicador la ve en ese momento.', true],
      ['!', 'Cada salida es una <b>advertencia</b>' + (ex.requierePin ? ' y el examen se bloquea hasta que el aplicador lo desbloquee' : '') + '. Al llegar a <b>' + ex.maxAdvertencias + '</b>, tu examen se envía solo.', true],
      ['⏱', 'Tienes <b>' + ex.duracionMin + ' minutos</b>. Al terminar el tiempo, el examen se envía automáticamente con lo que hayas contestado.', false],
      ['✎', 'Haz tus procedimientos en la hoja que te dieron. No se permite calculadora ni celular.', false],
      ['✓', 'Tus respuestas se guardan solas mientras contestas.', false]
    ];
    $('lista-reglas').innerHTML = reglas.map((r) => '<li class="' + (r[2] ? 'fuerte' : '') + '"><span class="ico">' + r[0] + '</span><span>' + r[1] + '</span></li>').join('');
    $('reglas-instrucciones').innerHTML = ex.instrucciones ? '<div class="mensaje info">' + esc(ex.instrucciones) + '</div>' : '';
    $('chk-reglas').checked = false;
    $('btn-comenzar').disabled = true;
    $('btn-comenzar').textContent = libre ? (reanudar ? 'Continuar examen' : 'Comenzar examen') : (reanudar ? 'Continuar en pantalla completa' : 'Comenzar en pantalla completa');
    $('reglas-pastillas').innerHTML += libre ? '<span class="pastilla">🔓 Sin candados: puedes usar otros programas</span>' : '';
    mensaje('msg-reglas', '');
  }
  function fechaLarga(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return iso || '';
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(a, m - 1, d).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  /** Ficha con los datos del examen que capturó el docente. */
  function fichaExamen(ex) {
    const d = ex.datos || {};
    const filas = [
      ['Materia', d.materia], ['Docente', d.docente], ['Periodo', d.periodo], ['Semestre', d.semestre],
      ['Fecha de aplicación', fechaLarga(d.fecha_aplicacion)], ['Grupo', ex.grupo],
      ['Valor del examen', d.valor_porcentaje !== '' && d.valor_porcentaje != null ? d.valor_porcentaje + '% de la calificación' : ''],
      ['Duración', d.duracion_min ? d.duracion_min + ' minutos' : '']
    ].filter((f) => f[1]);
    return filas.length ? '<dl class="ficha-examen">' + filas.map((f) => '<div><dt>' + f[0] + '</dt><dd>' + esc(f[1]) + '</dd></div>').join('') + '</dl>' : '';
  }

  $('chk-reglas').addEventListener('change', (e) => { $('btn-comenzar').disabled = !e.target.checked; });

  $('btn-comenzar').addEventListener('click', async () => {
    const btn = $('btn-comenzar');
    if (!E.info || E.info.seguridad !== 'LIBRE') await entrarPantallaCompleta(); // debe ocurrir dentro del clic
    cargando(btn, true, 'Preparando tu examen…');
    try {
      const datos = Object.assign({ codigo: E.codigo, token: E.token, navegador: navigator.userAgent }, E.datos || {});
      const r = await llamar('iniciar', datos, { reintentos: 2 });
      if (r.enviado) { terminar('ADVERTENCIAS'); return; }
      E.token = r.token;
      guardarSesion();
      arrancarExamen(r);
    } catch (err) {
      salirPantallaCompleta();
      mensaje('msg-reglas', err.message);
      cargando(btn, false);
    }
  });

  // ───────────── 4. Examen ─────────────
  function arrancarExamen(r) {
    E.examen = r.examen; E.grupos = r.grupos; E.limite = r.limite;
    E.advertencias = r.advertencias; E.max = r.examen.maxAdvertencias; E.requierePin = r.examen.requierePin;
    // Respuestas: lo del servidor + respaldo local (por si se perdió conexión)
    E.respuestas = Object.assign({}, r.respuestas || {}, leerRespaldo(E.codigo));
    E.items = [];
    E.grupos.forEach((g, gi) => g.items.forEach((it) => { it.n = E.items.length + 1; it.g = gi; E.items.push(it); }));
    $('ex-titulo').textContent = E.examen.titulo;
    const dx = E.examen.datos || {};
    const totalPts = E.items.reduce((s, it) => s + Number(it.puntos || 0), 0);
    $('ex-datos').textContent = [dx.materia, dx.periodo, dx.semestre ? 'Semestre ' + dx.semestre : '', dx.docente,
      dx.valor_porcentaje !== '' && dx.valor_porcentaje != null ? 'Vale ' + dx.valor_porcentaje + '%' : '', totalPts + ' puntos'].filter(Boolean).join(' · ');
    $('ex-alumno').textContent = r.alumno.nombre + ' ' + r.alumno.apellidos + ' · Código ' + E.codigo;
    marcaDeAgua(r.alumno.nombre + ' ' + r.alumno.apellidos + ' · ' + E.codigo);
    construirNavegador();
    irAGrupo(0);
    pintarAdvertencias();
    mostrar('p-examen');
    E.activo = true;
    E.seguridad = r.seguridad === 'LIBRE' ? 'LIBRE' : 'COMPLETA';
    pintarAdvertencias();
    if (E.seguridad === 'COMPLETA') activarGuardias();
    iniciarReloj();
    iniciarAutoguardado();
    if (E.seguridad === 'COMPLETA') {
      if (window.screen && window.screen.isExtended) leve('PANTALLA_EXTENDIDA', 'El equipo tiene más de una pantalla conectada.');
      if (r.bloqueado) { E.enInfraccion = true; mostrarBloqueo('Tu examen está bloqueado.'); }
      else if (!enPantallaCompleta() && soportaPantallaCompleta()) { E.enInfraccion = true; mostrarBloqueo('Activa la pantalla completa para continuar.', true); }
    }
    E.sucio = Object.keys(r.respuestas || {}).length !== Object.keys(E.respuestas).length;
    if (E.situacion === 'REANUDAR' && !r.bloqueado && r.advertencias > 0) {
      avisar('Recargar o cerrar la página cuenta como advertencia (' + r.advertencias + ' de ' + E.max + ').', 'peligro', 7000);
    }
  }

  function marcaDeAgua(texto) {
    const t = esc(texto);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="220"><text x="20" y="130" transform="rotate(-20 210 110)" font-family="Arial" font-size="18" font-weight="700" fill="#1f2a44">' + t + '</text></svg>';
    $('marca-agua').style.backgroundImage = 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '")';
  }

  function construirNavegador() {
    let html = '';
    let seccion = null;
    E.grupos.forEach((g) => {
      if (g.seccion !== seccion) {
        if (seccion !== null) html += '</div>';
        seccion = g.seccion;
        html += '<h3>' + esc(g.seccion.split('.')[0] ? 'Sección ' + g.seccion.split('.')[0] : g.seccion) + '</h3><div class="chips">';
      }
      g.items.forEach((it) => { html += '<button class="chip" data-n="' + it.n + '" title="Pregunta ' + it.n + '">' + it.n + '</button>'; });
    });
    html += '</div><div class="progreso"><span id="nav-prog"></span><div class="barra-prog"><i id="nav-barra"></i></div></div>';
    html += '<button class="btn ok bloque" style="margin-top:14px" id="btn-nav-enviar">Revisar y enviar</button>';
    $('ex-nav').innerHTML = html;
    $('ex-nav').querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => {
      const it = E.items[Number(b.dataset.n) - 1];
      irAGrupo(it.g, it.id);
    }));
    $('btn-nav-enviar').addEventListener('click', abrirEnviar);
    actualizarProgreso();
  }

  function contestada(id) { return !esVacia(E.respuestas[id]); }
  /** Las respuestas de completar, relacionar y crucigrama son JSON: cuentan si tienen algo escrito. */
  function esVacia(v) {
    const t = String(v == null ? '' : v).trim();
    if (!t) return true;
    if (t.charAt(0) === '[' || t.charAt(0) === '{') {
      try { const o = JSON.parse(t); return !Object.keys(o).some((k) => String(o[k] || '').trim()); } catch (e) { return false; }
    }
    return false;
  }
  function leerValor(id, porDefecto) {
    try { const o = JSON.parse(E.respuestas[id]); return o && typeof o === 'object' ? o : porDefecto; } catch (e) { return porDefecto; }
  }

  function actualizarProgreso() {
    const total = E.items.length;
    const hechas = E.items.filter((it) => contestada(it.id)).length;
    const prog = $('nav-prog');
    if (prog) prog.textContent = hechas + ' de ' + total + ' contestadas';
    const barra = $('nav-barra');
    if (barra) barra.style.width = (total ? (hechas / total) * 100 : 0) + '%';
    $('ex-nav').querySelectorAll('.chip').forEach((b) => {
      const it = E.items[Number(b.dataset.n) - 1];
      b.classList.toggle('contestada', contestada(it.id));
      b.classList.toggle('actual', it.g === E.grupoActual);
    });
  }

  function irAGrupo(gi, idPregunta) {
    E.grupoActual = Math.max(0, Math.min(E.grupos.length - 1, gi));
    const g = E.grupos[E.grupoActual];
    let html = '<div class="seccion">' + esc(g.seccion) + '</div>' +
      '<div class="grupo">' + esc(g.grupo) + '</div>' +
      '<div class="valor">Valor: ' + g.puntos + ' punto' + (g.puntos === 1 ? '' : 's') + '</div>';
    g.items.forEach((it) => { html += htmlPregunta(it); });
    const hoja = $('ex-hoja');
    hoja.innerHTML = html;
    renderMate(hoja);
    conectarPregunta(hoja);
    $('btn-anterior').disabled = E.grupoActual === 0;
    const ultimo = E.grupoActual === E.grupos.length - 1;
    $('btn-siguiente').textContent = ultimo ? 'Revisar y enviar' : 'Siguiente →';
    $('btn-siguiente').classList.toggle('ok', ultimo);
    $('ex-donde').textContent = 'Parte ' + (E.grupoActual + 1) + ' de ' + E.grupos.length;
    actualizarProgreso();
    if (idPregunta) {
      const el = hoja.querySelector('[data-id="' + CSS.escape(idPregunta) + '"]');
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
    } else window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $('btn-anterior').addEventListener('click', () => irAGrupo(E.grupoActual - 1));
  $('btn-siguiente').addEventListener('click', () => {
    if (E.grupoActual === E.grupos.length - 1) abrirEnviar(); else irAGrupo(E.grupoActual + 1);
  });

  function htmlPregunta(it) {
    const valor = E.respuestas[it.id] == null ? '' : String(E.respuestas[it.id]);
    let cuerpo = '';
    const etiqueta = it.inciso ? esc(it.inciso) + ' ' : '';
    if (it.tipo === 'opcion') {
      cuerpo = '<div class="opciones" role="radiogroup">' + it.opciones.map((o, i) => {
        const sel = valor === o.id;
        return '<label class="opcion' + (sel ? ' sel' : '') + '"><input type="radio" name="op-' + esc(it.id) + '" value="' + esc(o.id) + '"' + (sel ? ' checked' : '') + '>' +
          '<span class="letra">' + String.fromCharCode(97 + i) + '</span><span>' + formato(o.texto) + '</span></label>';
      }).join('') + '</div>';
    } else if (it.tipo === 'completar') {
      cuerpo = htmlCompletar(it);
    } else if (it.tipo === 'relacionar') {
      cuerpo = htmlRelacionar(it);
    } else if (it.tipo === 'crucigrama') {
      cuerpo = htmlCrucigrama(it);
    } else if (it.tipo === 'codigo') {
      cuerpo = '<textarea class="entrada codigo-resp" data-resp maxlength="4000" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" wrap="off" placeholder="Escribe aquí tu código… (la tecla Tab pone sangría)">' + esc(valor) + '</textarea>';
    } else if (it.tipo === 'abierta') {
      cuerpo = '<textarea class="entrada" data-resp maxlength="2000" spellcheck="false" autocomplete="off" placeholder="Escribe tu respuesta…">' + esc(valor) + '</textarea>';
    } else {
      const ph = it.tipo === 'conjunto' ? 'Ej. -2, 0, 5' : 'Tu resultado';
      cuerpo = '<div class="resp-corta"><input class="entrada" data-resp maxlength="120" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" placeholder="' + ph + '" value="' + esc(valor) + '">' +
        '<div class="vista" data-vista></div></div>';
    }
    const ayudaTipo = { completar: it.modo === 'banco' ? 'Arrastra cada palabra a su espacio (o tócala para ponerla en el siguiente espacio vacío). Toca una palabra colocada para regresarla.' : 'Escribe la palabra que falta en cada espacio.',
      relacionar: 'Elige, para cada elemento de la izquierda, la letra que le corresponde de la derecha.', crucigrama: 'Escribe una letra por casilla. Toca una pista para ir a su palabra.' }[it.tipo];
    return '<div class="pregunta' + (!esVacia(valor) ? ' contestada' : '') + '" data-id="' + esc(it.id) + '" data-tipo="' + esc(it.tipo) + '">' +
      '<div class="enc"><span class="num">' + it.n + '</span><div class="texto">' + etiqueta + (it.enunciado ? formato(it.enunciado) : '') + '</div>' +
      '<span class="pts">' + it.puntos + ' pt' + (it.puntos === 1 ? '' : 's') + '</span></div>' +
      (it.imagen ? '<img class="figura" src="' + esc(it.imagen) + '" alt="Figura de la pregunta ' + it.n + '" draggable="false">' : '') +
      cuerpo + (it.ayuda ? '<div class="ayuda">' + esc(it.ayuda) + '</div>' : (ayudaTipo ? '<div class="ayuda">' + ayudaTipo + '</div>' : '')) + '</div>';
  }

  // ───────────── Completar espacios ─────────────
  function htmlCompletar(it) {
    const dadas = leerValor(it.id, []);
    const banco = it.modo === 'banco';
    let h = '<div class="completar">' + it.partes.map((p) => {
      if (p.t != null) return '<span class="cp-texto">' + esc(p.t) + '</span>';
      const v = dadas[p.h] || '';
      if (!banco) return '<input class="hueco" data-h="' + p.h + '" value="' + esc(v) + '" maxlength="80" autocomplete="off" spellcheck="false" aria-label="Espacio ' + (p.h + 1) + '" style="width:' + Math.max(7, Math.min(22, v.length + 3)) + 'ch">';
      return '<span class="hueco-drop' + (v ? ' lleno' : '') + '" data-h="' + p.h + '" tabindex="0" role="button" aria-label="Espacio ' + (p.h + 1) + '">' + (v ? esc(v) : '&nbsp;') + '</span>';
    }).join('') + '</div>';
    if (banco) {
      const usadas = {};
      Object.values(dadas).forEach((w) => { if (w) usadas[w] = (usadas[w] || 0) + 1; });
      h += '<div class="banco" aria-label="Banco de palabras">' + it.banco.map((w, i) => {
        const usada = usadas[w] > 0;
        if (usada) usadas[w]--;
        return '<button type="button" class="palabra' + (usada ? ' usada' : '') + '" draggable="true" data-w="' + i + '"' + (usada ? ' disabled' : '') + '>' + esc(w) + '</button>';
      }).join('') + '</div>';
    }
    return h;
  }

  function conectarCompletar(caja, it) {
    const id = it.id;
    const total = it.huecos;
    const leer = () => { const a = leerValor(id, []); while (a.length < total) a.push(''); return a; };
    const guardarYPintar = (a) => {
      responder(id, a.some((x) => x) ? JSON.stringify(a) : '', caja);
      if (it.modo === 'banco') {
        const nueva = document.createElement('div');
        nueva.innerHTML = htmlCompletar(it);
        caja.querySelector('.completar').replaceWith(nueva.querySelector('.completar'));
        caja.querySelector('.banco').replaceWith(nueva.querySelector('.banco'));
        renderMate(caja.querySelector('.completar'));
        conectarCompletar(caja, it);
      }
    };
    if (it.modo !== 'banco') {
      caja.querySelectorAll('input.hueco').forEach((inp) => inp.addEventListener('input', () => {
        const a = leer();
        a[Number(inp.dataset.h)] = inp.value;
        inp.style.width = Math.max(7, Math.min(22, inp.value.length + 3)) + 'ch';
        responder(id, a.some((x) => x.trim()) ? JSON.stringify(a) : '', caja);
      }));
      return;
    }
    let activo = caja.dataset.activo != null ? Number(caja.dataset.activo) : -1;
    const colocar = (palabra, h) => {
      const a = leer();
      if (h < 0) h = a.findIndex((x) => !x);
      if (h < 0) { avisar('Todos los espacios están llenos. Toca uno para vaciarlo.', '', 3000); return; }
      a[h] = palabra;
      delete caja.dataset.activo;
      guardarYPintar(a);
    };
    caja.querySelectorAll('.palabra').forEach((b) => {
      b.addEventListener('click', () => colocar(it.banco[Number(b.dataset.w)], activo));
      b.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', b.dataset.w); e.dataTransfer.effectAllowed = 'move'; });
    });
    caja.querySelectorAll('.hueco-drop').forEach((hz) => {
      const h = Number(hz.dataset.h);
      hz.addEventListener('click', () => {
        const a = leer();
        if (a[h]) { a[h] = ''; caja.dataset.activo = h; guardarYPintar(a); return; }
        caja.dataset.activo = h; activo = h;
        caja.querySelectorAll('.hueco-drop').forEach((x) => x.classList.toggle('activo', x === hz));
      });
      hz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hz.click(); } });
      hz.addEventListener('dragover', (e) => { e.preventDefault(); hz.classList.add('sobre'); });
      hz.addEventListener('dragleave', () => hz.classList.remove('sobre'));
      hz.addEventListener('drop', (e) => {
        e.preventDefault();
        const w = Number(e.dataTransfer.getData('text/plain'));
        if (!isNaN(w) && it.banco[w] != null) colocar(it.banco[w], h);
      });
    });
    if (activo >= 0) { const x = caja.querySelector('.hueco-drop[data-h="' + activo + '"]'); if (x) x.classList.add('activo'); }
  }

  // ───────────── Relacionar columnas ─────────────
  function htmlRelacionar(it) {
    const dadas = leerValor(it.id, {});
    const letras = it.derecha.map((d) => d.id);
    return '<div class="relacionar"><div class="rel-col"><div class="rel-tit">Columna A</div>' + it.izquierda.map((x) =>
      '<div class="rel-item"><select class="entrada rel-sel" data-rel="' + x.i + '" aria-label="Letra para ' + esc(x.texto) + '"><option value="">—</option>' +
      letras.map((l) => '<option value="' + l + '"' + (dadas[x.i] === l ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' +
      '<span class="rel-num">' + (x.i + 1) + '.</span><span class="rel-texto">' + esc(x.texto) + '</span></div>').join('') + '</div>' +
      '<div class="rel-col"><div class="rel-tit">Columna B</div>' + it.derecha.map((d) =>
        '<div class="rel-item der"><span class="rel-letra">' + d.id + '</span><span class="rel-texto">' + esc(d.texto) + '</span></div>').join('') + '</div></div>';
  }
  function conectarRelacionar(caja, it) {
    caja.querySelectorAll('.rel-sel').forEach((sel) => sel.addEventListener('change', () => {
      const a = leerValor(it.id, {});
      if (sel.value) a[sel.dataset.rel] = sel.value; else delete a[sel.dataset.rel];
      responder(it.id, Object.keys(a).length ? JSON.stringify(a) : '', caja);
    }));
  }

  // ───────────── Crucigrama ─────────────
  function htmlCrucigrama(it) {
    const dadas = leerValor(it.id, {});
    const blancas = new Set(it.casillas);
    let t = '<div class="cruz-env"><table class="cruz" aria-label="Crucigrama"><tbody>';
    for (let f = 0; f < it.alto; f++) {
      t += '<tr>';
      for (let c = 0; c < it.ancho; c++) {
        const k = f + ',' + c;
        if (!blancas.has(k)) { t += '<td class="cz-negra"></td>'; continue; }
        const num = it.numeros[k];
        t += '<td class="cz">' + (num ? '<span class="cz-n">' + num + '</span>' : '') +
          '<input maxlength="1" data-k="' + k + '" value="' + esc(dadas[k] || '') + '" autocomplete="off" spellcheck="false" autocapitalize="characters" aria-label="Casilla ' + (f + 1) + ',' + (c + 1) + '"></td>';
      }
      t += '</tr>';
    }
    t += '</tbody></table></div><div class="cruz-pistas">';
    [['horizontales', 'Horizontales →'], ['verticales', 'Verticales ↓']].forEach(([k, tit]) => {
      if (!it.pistas[k].length) return;
      t += '<div><div class="rel-tit">' + tit + '</div><ol>' + it.pistas[k].map((p) =>
        '<li data-f="' + p.fila + '" data-c="' + p.col + '" data-dir="' + p.dir + '"><b>' + p.num + '.</b> ' + esc(p.pista) + ' <span class="suave">(' + p.largo + ')</span></li>').join('') + '</ol></div>';
    });
    return t + '</div>';
  }
  function conectarCrucigrama(caja, it) {
    let dir = 'H';
    const celda = (f, c) => caja.querySelector('input[data-k="' + f + ',' + c + '"]');
    const guardarCruz = () => {
      const a = {};
      caja.querySelectorAll('.cruz input').forEach((i) => { if (i.value) a[i.dataset.k] = i.value; });
      responder(it.id, Object.keys(a).length ? JSON.stringify(a) : '', caja);
    };
    caja.querySelectorAll('.cruz input').forEach((inp) => {
      const [f, c] = inp.dataset.k.split(',').map(Number);
      inp.addEventListener('focus', () => {
        // Si la casilla solo pertenece a una palabra vertical, se escribe hacia abajo
        if (!celda(f, c - 1) && !celda(f, c + 1)) dir = 'V';
        else if (!celda(f - 1, c) && !celda(f + 1, c)) dir = 'H';
        inp.select();
      });
      inp.addEventListener('input', () => {
        inp.value = inp.value.toUpperCase().replace(/[^A-ZÑÁÉÍÓÚÜ]/g, '').slice(-1);
        guardarCruz();
        if (inp.value) { const sig = dir === 'H' ? celda(f, c + 1) : celda(f + 1, c); if (sig) sig.focus(); }
      });
      inp.addEventListener('keydown', (e) => {
        const mover = { ArrowRight: [0, 1, 'H'], ArrowLeft: [0, -1, 'H'], ArrowDown: [1, 0, 'V'], ArrowUp: [-1, 0, 'V'] }[e.key];
        if (mover) { e.preventDefault(); dir = mover[2]; const x = celda(f + mover[0], c + mover[1]); if (x) x.focus(); return; }
        if (e.key === 'Backspace' && !inp.value) { const x = dir === 'H' ? celda(f, c - 1) : celda(f - 1, c); if (x) { x.focus(); x.value = ''; guardarCruz(); e.preventDefault(); } }
      });
    });
    caja.querySelectorAll('.cruz-pistas li').forEach((li) => li.addEventListener('click', () => {
      dir = li.dataset.dir;
      const x = celda(Number(li.dataset.f), Number(li.dataset.c));
      if (x) x.focus();
    }));
  }

  function conectarPregunta(hoja) {
    hoja.querySelectorAll('.pregunta').forEach((caja) => {
      const id = caja.dataset.id, tipo = caja.dataset.tipo;
      const it = E.items.find((x) => x.id === id);
      if (tipo === 'completar') { conectarCompletar(caja, it); return; }
      if (tipo === 'relacionar') { conectarRelacionar(caja, it); return; }
      if (tipo === 'crucigrama') { conectarCrucigrama(caja, it); return; }
      if (tipo === 'opcion') {
        caja.querySelectorAll('input[type=radio]').forEach((r) => r.addEventListener('change', () => {
          caja.querySelectorAll('.opcion').forEach((o) => o.classList.toggle('sel', o.querySelector('input').checked));
          responder(id, r.value, caja);
        }));
      } else {
        const campo = caja.querySelector('[data-resp]');
        const vista = caja.querySelector('[data-vista]');
        const pintarVista = () => { if (vista) vistaPrevia(tipo, campo.value, vista); };
        campo.addEventListener('input', () => { responder(id, campo.value, caja); pintarVista(); });
        if (tipo === 'codigo') campo.addEventListener('keydown', (e) => {
          if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey) return;
          e.preventDefault();
          const i = campo.selectionStart, j = campo.selectionEnd, v = campo.value;
          if (e.shiftKey) {
            const ini = v.lastIndexOf('\n', i - 1) + 1;
            const quitar = (v.slice(ini, ini + 4).match(/^ {1,4}/) || [''])[0].length;
            if (!quitar) return;
            campo.value = v.slice(0, ini) + v.slice(ini + quitar);
            campo.selectionStart = campo.selectionEnd = Math.max(ini, i - quitar);
          } else {
            campo.value = v.slice(0, i) + '    ' + v.slice(j);
            campo.selectionStart = campo.selectionEnd = i + 4;
          }
          responder(id, campo.value, caja);
        });
        pintarVista();
      }
    });
  }

  function vistaPrevia(tipo, texto, el) {
    el.classList.remove('mal');
    if (!texto.trim()) { el.innerHTML = ''; return; }
    const r = tipo === 'conjunto' ? leerConjunto(texto) : leerNumero(texto, true);
    if (!r) {
      el.classList.add('mal');
      el.textContent = tipo === 'conjunto' ? 'No se entiende. Escribe números separados por comas.' : 'No se entiende. Usa números, fracciones como 3/4 o decimales.';
      return;
    }
    el.innerHTML = 'Se leerá como: ' + latex(tipo === 'conjunto' ? r.tex : r.tex);
  }

  function responder(id, valor, caja) {
    E.respuestas[id] = valor;
    if (caja) caja.classList.toggle('contestada', !esVacia(valor));
    if (E.prueba) { actualizarProgreso(); return; }
    respaldoLocal();
    E.sucio = true;
    actualizarProgreso();
    $('ex-guardado').textContent = 'Cambios sin guardar…';
    $('ex-guardado').classList.remove('error');
    clearTimeout(E.tGuardar);
    E.tGuardar = setTimeout(guardar, 2500);
  }

  // ───────────── Guardado ─────────────
  async function guardar(forzar) {
    if (!E.activo || E.terminado || E.guardando) return;
    if (!E.sucio && !forzar) return;
    E.guardando = true;
    const enviarResp = E.sucio;
    E.sucio = false;
    try {
      const r = await llamar('guardar', { codigo: E.codigo, token: E.token, respuestas: enviarResp ? E.respuestas : undefined }, { reintentos: 0, espera: 20000 });
      if (r.enviado) { terminar('SERVIDOR'); return; }
      if (enviarResp) {
        $('ex-guardado').textContent = '✓ Guardado ' + new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        $('ex-guardado').classList.remove('error');
      }
      $('sin-red').hidden = true;
      if (r.limite) E.limite = r.limite;
      if (typeof r.advertencias === 'number') { E.advertencias = r.advertencias; pintarAdvertencias(); }
      if (r.seguridad && r.seguridad !== E.seguridad) { cambiarSeguridad(r.seguridad); return; }
      if (E.seguridad === 'LIBRE') return;
      // El aplicador pudo desbloquear desde el panel
      if (E.enInfraccion && E.requierePin && r.bloqueado === false) permitirVolver();
      if (!E.enInfraccion && r.bloqueado) { E.enInfraccion = true; mostrarBloqueo('El aplicador bloqueó tu examen.'); }
    } catch (err) {
      if (enviarResp) E.sucio = true;
      if (err.red) {
        $('sin-red').hidden = false;
        $('ex-guardado').textContent = 'Sin conexión';
        $('ex-guardado').classList.add('error');
      } else if (err.codigo === 'SESION_INVALIDA' || err.codigo === 'CODIGO_ANULADO') {
        sesionPerdida(err.message);
      }
    } finally { E.guardando = false; }
  }

  function iniciarAutoguardado() {
    clearInterval(E.tAuto);
    // Cada 15 s guarda si hay cambios; cada 30 s consulta al servidor (tiempo extra, desbloqueo, envío forzado)
    let vuelta = 0;
    E.tAuto = setInterval(() => {
      vuelta++;
      const rapido = E.enInfraccion && E.requierePin; // mientras está bloqueado consulta más seguido
      if (E.sucio || rapido || vuelta % 2 === 0) guardar(true);
    }, 15000);
    window.addEventListener('online', () => { $('sin-red').hidden = true; guardar(true); });
    window.addEventListener('offline', () => { $('sin-red').hidden = false; leve('SIN_CONEXION', 'El equipo perdió la conexión.'); });
  }

  // ───────────── Reloj ─────────────
  function iniciarReloj() {
    clearInterval(E.tReloj);
    let avisado10 = false, avisado5 = false;
    const tic = () => {
      if (E.terminado) return;
      const resta = E.limite - Reloj.ahora();
      const reloj = $('ex-reloj');
      reloj.textContent = formatoTiempo(resta);
      reloj.classList.toggle('poco', resta <= 10 * 60000 && resta > 3 * 60000);
      reloj.classList.toggle('critico', resta <= 3 * 60000);
      if (!avisado10 && resta <= 10 * 60000 && resta > 9 * 60000) { avisado10 = true; avisar('Quedan 10 minutos.', '', 5000); }
      if (!avisado5 && resta <= 5 * 60000 && resta > 4 * 60000) { avisado5 = true; avisar('Quedan 5 minutos. Revisa tus respuestas.', 'peligro', 6000); }
      if (resta <= 0) enviarExamen('TIEMPO');
    };
    tic();
    E.tReloj = setInterval(tic, 1000);
  }

  // ───────────── Enviar ─────────────
  function abrirEnviar() {
    const faltan = E.items.filter((it) => !contestada(it.id));
    $('env-texto').textContent = faltan.length
      ? 'Tienes ' + faltan.length + ' pregunta' + (faltan.length === 1 ? '' : 's') + ' sin contestar.'
      : 'Contestaste todas las preguntas.';
    $('env-chips').innerHTML = E.items.map((it) => '<span class="' + (contestada(it.id) ? 'si' : '') + '">' + it.n + '</span>').join('');
    $('modal-enviar').hidden = false;
  }
  $('btn-env-cancelar').addEventListener('click', () => { $('modal-enviar').hidden = true; });
  $('btn-env-ok').addEventListener('click', () => enviarExamen('ALUMNO'));

  async function enviarExamen(motivo) {
    if (E.prueba) { calificarPrueba(); return; }
    if (E.enviando || E.terminado) return;
    E.enviando = true;
    const btn = $('btn-env-ok');
    cargando(btn, true, 'Enviando…');
    if (motivo === 'TIEMPO') avisar('Se terminó el tiempo. Enviando tu examen…', 'peligro', 8000);
    for (let intento = 0; intento < 6; intento++) {
      try {
        await llamar('enviar', { codigo: E.codigo, token: E.token, respuestas: E.respuestas, motivo }, { reintentos: 1 });
        terminar(motivo);
        return;
      } catch (err) {
        if (!err.red) {
          if (err.codigo === 'SESION_INVALIDA') { sesionPerdida(err.message); return; }
          avisar(err.message, 'peligro', 6000);
          break;
        }
        avisar('Sin conexión. Reintentando el envío…', 'peligro', 4000);
        await new Promise((r) => setTimeout(r, 3000 * (intento + 1)));
      }
    }
    E.enviando = false;
    cargando(btn, false);
    if (motivo === 'TIEMPO') setTimeout(() => enviarExamen('TIEMPO'), 10000);
  }

  function terminar(motivo) {
    E.terminado = true; E.activo = false;
    clearInterval(E.tReloj); clearInterval(E.tAuto); clearTimeout(E.tGuardar);
    desactivarGuardias();
    $('modal-enviar').hidden = true;
    $('capa-bloqueo').hidden = true;
    $('sin-red').hidden = true;
    borrarSesion();
    const nombre = (E.datos && E.datos.nombre) || ($('ex-alumno').textContent.split(' ')[0]) || '';
    const textos = {
      ALUMNO: 'Gracias' + (nombre ? ', ' + nombre : '') + '. Tu examen se guardó correctamente.',
      TIEMPO: 'Se terminó el tiempo. Tu examen se envió con las respuestas que alcanzaste a contestar.',
      ADVERTENCIAS: 'Tu examen se envió automáticamente porque llegaste al límite de advertencias.',
      SERVIDOR: 'Tu examen fue cerrado por el aplicador o por el tiempo, y ya quedó guardado.'
    };
    $('fin-texto').textContent = textos[motivo] || textos.SERVIDOR;
    mostrar('p-fin');
    salirPantallaCompleta();
  }

  function sesionPerdida(texto) {
    E.activo = false;
    desactivarGuardias();
    clearInterval(E.tReloj); clearInterval(E.tAuto);
    $('capa-bloqueo').hidden = false;
    $('bloq-titulo').textContent = 'Sesión cerrada en este equipo';
    $('bloq-texto').textContent = texto + ' Tus respuestas están guardadas.';
    $('bloq-cuenta').innerHTML = '';
    $('bloq-pin').hidden = true; $('bloq-volver').hidden = true;
  }

  // ───────────── Pantalla completa ─────────────
  function soportaPantallaCompleta() { return !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen); }
  function enPantallaCompleta() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  async function entrarPantallaCompleta() {
    const el = document.documentElement;
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      // En Chrome/Edge: la tecla Esc y la tecla Windows quedan capturadas (hay que mantener Esc para salir)
      if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(['Escape', 'MetaLeft', 'MetaRight', 'F11']).catch(() => {});
    } catch (e) { /* el navegador lo rechazó */ }
  }
  function salirPantallaCompleta() {
    try {
      if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock();
      if (document.exitFullscreen && document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else if (document.webkitExitFullscreen && document.webkitFullscreenElement) document.webkitExitFullscreen();
    } catch (e) { /* */ }
  }

  // ───────────── Guardias de seguridad ─────────────
  const TECLAS_BLOQUEADAS = [
    { ctrl: true, k: ['c', 'v', 'x', 'a', 'p', 's', 'u', 'f', 'g', 'h', 'j', 'o', 'n', 't', 'w', 'r', 'l', 'd', 'k', 'e'] },
    { k: ['F1', 'F3', 'F5', 'F6', 'F7', 'F10', 'F11', 'F12', 'ContextMenu'] }
  ];

  const manejadores = {
    fullscreenchange() {
      if (!E.activo) return;
      if (!enPantallaCompleta()) infraccion('SALIO_PANTALLA_COMPLETA', 'Salió de la pantalla completa.');
    },
    visibilitychange() {
      if (!E.activo) return;
      if (document.visibilityState === 'hidden') infraccion('CAMBIO_PESTANA', 'La página quedó oculta (cambió de pestaña, minimizó o abrió otra app).');
    },
    blur() {
      if (!E.activo) return;
      // Pequeña espera: si fue por cambiar de pestaña lo registra visibilitychange
      setTimeout(() => { if (E.activo && !document.hasFocus()) infraccion('PERDIO_FOCO', 'La ventana del examen perdió el foco (otra ventana o programa).'); }, 250);
    },
    contextmenu(e) { e.preventDefault(); leve('CLIC_DERECHO', 'Intentó abrir el menú del clic derecho.'); },
    copy(e) { e.preventDefault(); leve('INTENTO_COPIAR', 'Intentó copiar.'); },
    cut(e) { e.preventDefault(); leve('INTENTO_COPIAR', 'Intentó cortar.'); },
    paste(e) { e.preventDefault(); leve('INTENTO_PEGAR', 'Intentó pegar texto.'); avisar('No se permite pegar texto.', 'peligro'); },
    dragstart(e) { if (!e.target.closest || !e.target.closest('.palabra')) e.preventDefault(); },
    drop(e) { if (!e.target.closest || !e.target.closest('.hueco-drop')) e.preventDefault(); },
    selectstart(e) { if (!e.target.closest || !e.target.closest('input, textarea')) e.preventDefault(); },
    keydown(e) {
      const k = e.key || '';
      const ctrl = e.ctrlKey || e.metaKey;
      if (k === 'PrintScreen') { capturaPantalla(); e.preventDefault(); return; }
      if (ctrl && e.shiftKey && /^[ijcks]$/i.test(k)) { bloquearTecla(e, 'Ctrl+Shift+' + k.toUpperCase(), 'HERRAMIENTAS_DESARROLLADOR'); return; }
      if (e.altKey && (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Home')) { bloquearTecla(e, 'Alt+' + k); return; }
      for (const regla of TECLAS_BLOQUEADAS) {
        if (regla.ctrl && !ctrl) continue;
        if (!regla.ctrl && ctrl) continue;
        if (regla.k.includes(regla.ctrl ? k.toLowerCase() : k)) {
          // Ctrl+A dentro de un campo sí se permite (seleccionar su texto)
          if (regla.ctrl && k.toLowerCase() === 'a' && e.target.closest && e.target.closest('input, textarea')) return;
          bloquearTecla(e, (regla.ctrl ? 'Ctrl+' : '') + (k.length === 1 ? k.toUpperCase() : k), k === 'F12' ? 'HERRAMIENTAS_DESARROLLADOR' : 'TECLA_BLOQUEADA');
          return;
        }
      }
      if (k === 'Escape' && enPantallaCompleta()) e.preventDefault();
    },
    keyup(e) { if (e.key === 'PrintScreen') capturaPantalla(); },
    beforeunload(e) {
      if (!E.activo) return;
      e.preventDefault(); e.returnValue = '';
      marcarDescarga();
    },
    // Al recargar/cerrar, el servidor ya cuenta la advertencia (RECARGO_PAGINA); no se duplica aquí
    pagehide() { if (E.activo) marcarDescarga(); },
    resize() {
      if (!E.activo || !enPantallaCompleta()) return;
      if (window.innerWidth < screen.width * 0.8 || window.innerHeight < screen.height * 0.7) leve('VENTANA_REDUCIDA', 'La ventana cambió de tamaño (' + window.innerWidth + '×' + window.innerHeight + ').');
    }
  };

  function marcarDescarga() {
    E.descargando = true;
    clearTimeout(E.tDescarga);
    // Si el alumno canceló el "¿Salir del sitio?", la página sigue viva: vuelve a vigilar
    E.tDescarga = setTimeout(() => {
      E.descargando = false;
      if (E.activo && soportaPantallaCompleta() && !enPantallaCompleta()) infraccion('SALIO_PANTALLA_COMPLETA', 'Intentó salir o recargar la página.');
    }, 2500);
  }

  function bloquearTecla(e, combo, tipo) {
    e.preventDefault(); e.stopPropagation();
    leve(tipo || 'TECLA_BLOQUEADA', 'Presionó ' + combo + '.');
  }
  function capturaPantalla() {
    leve('CAPTURA_PANTALLA', 'Presionó la tecla Imprimir pantalla.');
    try { navigator.clipboard && navigator.clipboard.writeText && navigator.clipboard.writeText('Captura no permitida durante el examen').catch(() => {}); } catch (e) { /* */ }
    avisar('Las capturas de pantalla no están permitidas. Quedó registrado.', 'peligro');
  }

  function activarGuardias() {
    document.addEventListener('fullscreenchange', manejadores.fullscreenchange);
    document.addEventListener('webkitfullscreenchange', manejadores.fullscreenchange);
    document.addEventListener('visibilitychange', manejadores.visibilitychange);
    window.addEventListener('blur', manejadores.blur);
    ['contextmenu', 'copy', 'cut', 'paste', 'dragstart', 'drop', 'selectstart'].forEach((ev) => document.addEventListener(ev, manejadores[ev], true));
    document.addEventListener('keydown', manejadores.keydown, true);
    document.addEventListener('keyup', manejadores.keyup, true);
    window.addEventListener('beforeunload', manejadores.beforeunload);
    window.addEventListener('pagehide', manejadores.pagehide);
    window.addEventListener('resize', manejadores.resize);
  }
  function desactivarGuardias() {
    document.removeEventListener('fullscreenchange', manejadores.fullscreenchange);
    document.removeEventListener('webkitfullscreenchange', manejadores.fullscreenchange);
    document.removeEventListener('visibilitychange', manejadores.visibilitychange);
    window.removeEventListener('blur', manejadores.blur);
    ['contextmenu', 'copy', 'cut', 'paste', 'dragstart', 'drop', 'selectstart'].forEach((ev) => document.removeEventListener(ev, manejadores[ev], true));
    document.removeEventListener('keydown', manejadores.keydown, true);
    document.removeEventListener('keyup', manejadores.keyup, true);
    window.removeEventListener('beforeunload', manejadores.beforeunload);
    window.removeEventListener('pagehide', manejadores.pagehide);
    window.removeEventListener('resize', manejadores.resize);
  }

  /** Evento grave: cuenta como advertencia. Una sola por cada "salida". */
  async function infraccion(tipo, detalle) {
    if (!E.activo || E.terminado || E.descargando || E.seguridad === 'LIBRE') return;
    if (E.enInfraccion) return;
    E.enInfraccion = true;
    E.ultimaInfraccion = Date.now();
    E.advertencias++;
    pintarAdvertencias();
    mostrarBloqueo(null);
    try {
      const r = await llamar('incidencia', { codigo: E.codigo, token: E.token, tipo, detalle, respuestas: E.respuestas }, { reintentos: 3 });
      if (r.enviado) { terminar('ADVERTENCIAS'); return; }
      if (r.seguridad === 'LIBRE') { cambiarSeguridad('LIBRE'); return; }
      if (typeof r.advertencias === 'number') { E.advertencias = r.advertencias; pintarAdvertencias(); mostrarBloqueo(null); }
      E.sucio = false;
    } catch (err) {
      if (err.codigo === 'SESION_INVALIDA') sesionPerdida(err.message);
    }
  }

  /** Evento menor: solo se registra (máximo uno por tipo cada 20 s). */
  function leve(tipo, detalle) {
    if (!E.activo || E.terminado) return;
    const ahora = Date.now();
    if (E.ultimasLeves[tipo] && ahora - E.ultimasLeves[tipo] < 20000) return;
    E.ultimasLeves[tipo] = ahora;
    llamar('incidencia', { codigo: E.codigo, token: E.token, tipo, detalle }, { reintentos: 1 }).catch(() => {});
  }

  /** El aplicador quitó o volvió a poner los candados desde el panel (parte práctica). */
  function cambiarSeguridad(modo) {
    if (E.terminado) return;
    E.seguridad = modo === 'LIBRE' ? 'LIBRE' : 'COMPLETA';
    if (E.seguridad === 'LIBRE') {
      desactivarGuardias();
      E.enInfraccion = false;
      $('capa-bloqueo').hidden = true;
      avisar('Tu profesor habilitó la parte práctica: ya puedes abrir otros programas (por ejemplo, Visual Studio Code) y copiar y pegar.', 'ok', 10000);
    } else {
      activarGuardias();
      avisar('Tu profesor volvió a activar los candados del examen.', 'peligro', 8000);
      if (soportaPantallaCompleta() && !enPantallaCompleta()) { E.enInfraccion = true; mostrarBloqueo('Tu profesor volvió a activar los candados. Regresa a pantalla completa para continuar.', true); }
    }
    pintarAdvertencias();
  }

  function pintarAdvertencias() {
    if (E.seguridad === 'LIBRE') { $('ex-advert').innerHTML = '<span class="barra-libre" title="Puedes usar otros programas">🔓 Sin candados</span>'; return; }
    let html = '<span>Advertencias</span>';
    for (let i = 0; i < E.max; i++) html += '<span class="punto' + (i < E.advertencias ? ' on' : '') + '"></span>';
    $('ex-advert').innerHTML = html;
  }

  function mostrarBloqueo(textoEspecial, soloPantalla) {
    const capa = $('capa-bloqueo');
    capa.hidden = false;
    $('bloq-err').textContent = '';
    if (textoEspecial) {
      $('bloq-titulo').textContent = soloPantalla ? 'Pantalla completa requerida' : 'Examen bloqueado';
      $('bloq-texto').textContent = textoEspecial;
    } else {
      const restan = E.max - E.advertencias;
      $('bloq-titulo').textContent = 'Saliste del examen';
      $('bloq-texto').textContent = 'Se registró una advertencia (' + E.advertencias + ' de ' + E.max + ') y el aplicador ya fue notificado. ' +
        (restan > 0 ? (restan === 1 ? 'Si sales una vez más, tu examen se enviará automáticamente.' : 'Al llegar a ' + E.max + ', tu examen se enviará automáticamente.') : '');
    }
    let puntos = '';
    for (let i = 0; i < E.max; i++) puntos += '<i class="' + (i < E.advertencias ? 'on' : '') + '"></i>';
    $('bloq-cuenta').innerHTML = puntos;
    const conPin = E.requierePin && !soloPantalla;
    $('bloq-pin').hidden = !conPin;
    $('bloq-volver').hidden = conPin;
    if (conPin) setTimeout(() => $('in-pin').focus(), 50);
  }

  function permitirVolver() {
    $('bloq-pin').hidden = true;
    $('bloq-volver').hidden = false;
    $('bloq-err').textContent = '';
    $('bloq-texto').textContent = 'El aplicador desbloqueó tu examen. Puedes continuar.';
  }

  $('btn-pin').addEventListener('click', async () => {
    const pin = $('in-pin').value.trim();
    if (!pin) return;
    const btn = $('btn-pin');
    cargando(btn, true);
    try {
      const r = await llamar('desbloquear', { codigo: E.codigo, token: E.token, pin });
      if (r.enviado) { terminar('SERVIDOR'); return; }
      $('in-pin').value = '';
      await volverAlExamen();
    } catch (err) {
      $('bloq-err').textContent = err.message;
    } finally { cargando(btn, false); }
  });
  $('in-pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-pin').click(); });

  $('btn-volver').addEventListener('click', volverAlExamen);
  async function volverAlExamen() {
    if (soportaPantallaCompleta() && !enPantallaCompleta()) await entrarPantallaCompleta();
    if (soportaPantallaCompleta() && !enPantallaCompleta()) {
      $('bloq-err').textContent = 'No se pudo activar la pantalla completa. Vuelve a intentarlo.';
      return;
    }
    $('capa-bloqueo').hidden = true;
    // Espera a que el navegador se acomode antes de volver a vigilar
    setTimeout(() => { E.enInfraccion = false; }, 600);
    guardar(true);
  }

  // ───────────── Modo prueba (el docente prueba su examen como si fuera alumno) ─────────────
  async function iniciarPrueba(examenId) {
    const token = (() => { try { return localStorage.getItem('examenSeguro.admin.prueba') || ''; } catch (e) { return ''; } })();
    mostrar('p-examen');
    $('ex-hoja').innerHTML = '<p class="suave">Cargando el examen…</p>';
    try {
      const r = await llamar('examenVistaAlumno', { tokenAdmin: token, examen_id: examenId });
      E.prueba = true; E.codigo = 'PRUEBA'; E.examen = r.examen; E.grupos = r.grupos;
      E.max = r.examen.maxAdvertencias; E.advertencias = 0; E.respuestas = {};
      E.limite = Reloj.ahora() + (r.examen.duracionMin || 60) * 60000;
      E.items = [];
      E.grupos.forEach((g, gi) => g.items.forEach((it) => { it.n = E.items.length + 1; it.g = gi; E.items.push(it); }));
      $('ex-titulo').textContent = r.examen.titulo;
      const dx = r.examen.datos || {};
      $('ex-datos').textContent = [dx.materia, dx.periodo, dx.semestre ? 'Semestre ' + dx.semestre : '', dx.docente].filter(Boolean).join(' · ');
      $('ex-alumno').textContent = 'MODO PRUEBA · no se guarda nada y no hay candados';
      $('ex-guardado').textContent = 'Modo prueba';
      document.body.classList.add('modo-prueba');
      construirNavegador();
      irAGrupo(0);
      pintarAdvertencias();
      E.activo = true;
      iniciarReloj();
      document.title = 'Prueba · ' + r.examen.titulo;
    } catch (err) {
      $('ex-hoja').innerHTML = '<div class="mensaje error">' + esc(err.message) + ' Abre la prueba desde el panel (botón «Probar como alumno»).</div>';
    }
  }

  async function calificarPrueba() {
    if (E.enviando) return;
    E.enviando = true;
    const btn = $('btn-env-ok');
    cargando(btn, true, 'Calificando…');
    try {
      const r = await llamar('examenProbar', { tokenAdmin: localStorage.getItem('examenSeguro.admin.prueba') || '', examen_id: new URLSearchParams(location.search).get('prueba'), respuestas: E.respuestas }, { espera: 120000 });
      clearInterval(E.tReloj);
      $('modal-enviar').hidden = true;
      const marca = { CORRECTA: ['✓', 'ok'], INCORRECTA: ['✗', 'mal'], PARCIAL: ['½', 'parcial'], POR_REVISAR: ['?', 'parcial'], SIN_RESPUESTA: ['–', 'mal'] };
      $('prueba-res').innerHTML = '<div class="prueba-cal"><div><div class="suave pequeno">Calificación de la prueba</div><div class="prueba-num">' + r.calificacion.toFixed(1) + '</div>' +
        '<div class="suave">' + r.puntos + ' de ' + r.puntos_max + ' puntos</div></div>' +
        '<div class="pequeno suave">Así quedaría calificado un alumno con estas respuestas. ' +
        (r.ia === 'OK' ? 'Las preguntas abiertas las calificó la IA.' : r.ia === 'ERROR' ? 'La IA no respondió; las abiertas quedaron pendientes.' : 'Sin IA configurada, las abiertas quedan pendientes para calificar a mano.') + '</div></div>' +
        r.items.map((it) => {
          const m = marca[it.resultado] || ['', ''];
          return '<div class="prueba-item ' + m[1] + '"><div class="prueba-cab"><b>' + it.n + '.</b> <span class="prueba-enun">' + (it.inciso ? esc(it.inciso) + ' ' : '') + formato(it.enunciado || '') + '</span>' +
            '<span class="prueba-pts ' + m[1] + '">' + m[0] + ' ' + it.puntos + '/' + it.puntos_max + '</span></div>' +
            '<div class="prueba-resp"><div><b>Respuesta</b>' + (it.tipo === 'codigo' && it.respuesta_alumno ? bloqueCodigo(it.respuesta_alumno) : '<pre>' + esc(it.respuesta_alumno || '—') + '</pre>') + '</div>' +
            '<div><b>Correcta / guía</b>' + (it.tipo === 'codigo' && it.respuesta_correcta ? bloqueCodigo(it.respuesta_correcta) : '<pre>' + esc(it.respuesta_correcta || '—') + '</pre>') + '</div></div>' +
            (it.nota ? '<div class="prueba-nota">🤖 ' + esc(it.nota) + '</div>' : '') + '</div>';
        }).join('');
      renderMate($('prueba-res'));
      mostrar('p-prueba');
    } catch (err) {
      avisar(err.message, 'peligro', 6000);
    } finally { E.enviando = false; cargando(btn, false); }
  }
  $('btn-prueba-otra').addEventListener('click', () => location.reload());

  // ───────────── Inicio ─────────────
  const pruebaId = new URLSearchParams(location.search).get('prueba');
  if (pruebaId) { iniciarPrueba(pruebaId); return; }
  const ses = leerSesion();
  if (ses && ses.codigo) {
    $('in-codigo').value = ses.codigo;
    mensaje('msg-codigo', 'Tienes un examen en curso en este equipo. Presiona «Entrar» para continuar.', 'aviso');
  }
  setTimeout(() => $('in-codigo').focus(), 50);
})();
