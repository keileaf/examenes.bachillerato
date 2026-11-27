/* Panel de administración: códigos, aplicación en vivo, resultados, incidencias y exámenes. */
(function () {
  'use strict';
  const { llamar, Reloj, esc, formato, bloqueCodigo, renderMate, latex, leerNumero, leerConjunto, avisar, cargando, formatoTiempo, fechaHora, hora, haceCuanto } = window.Comun;
  const $ = (id) => document.getElementById(id);
  const CLAVE_TOKEN = 'examenSeguro.admin';

  const A = { token: '', ses: null, datos: null, vista: 'examenes', resExamen: '', resGrupo: '', carpetaSel: '', tipoSel: '', examenSel: '', incVistas: null, tRefresco: null, cargandoResumen: false };

  const TIPOS_INC = {
    INICIO_EXAMEN: ['Inició el examen', ''], EXAMEN_ENVIADO: ['Examen enviado', ''],
    SALIO_PANTALLA_COMPLETA: ['Salió de pantalla completa', 'g'], CAMBIO_PESTANA: ['Cambió de pestaña / ventana', 'g'],
    PERDIO_FOCO: ['Usó otra ventana o programa', 'g'], RECARGO_PAGINA: ['Recargó o cerró la página', 'g'], VENTANA_REDUCIDA: ['Redujo la ventana', ''],
    INTENTO_COPIAR: ['Intentó copiar', ''], INTENTO_PEGAR: ['Intentó pegar', ''], CLIC_DERECHO: ['Clic derecho', ''],
    TECLA_BLOQUEADA: ['Atajo de teclado bloqueado', ''], CAPTURA_PANTALLA: ['Captura de pantalla', ''],
    HERRAMIENTAS_DESARROLLADOR: ['Intentó abrir herramientas de desarrollador', ''], PANTALLA_EXTENDIDA: ['Tiene 2 o más pantallas', ''],
    SIN_CONEXION: ['Perdió la conexión', ''], DESBLOQUEADO: ['Desbloqueado', ''], PIN_INCORRECTO: ['PIN incorrecto', ''],
    SESION_LIBERADA: ['Sesión liberada', ''], REANUDO_OTRO_EQUIPO: ['Continuó en otro equipo', ''],
    ADVERTENCIA_RETIRADA: ['Advertencia retirada', ''], TIEMPO_EXTRA: ['Tiempo extra', '']
  };
  const TIPOS_EX = { ADMISION: 'Admisión', PERIODO_1: '1er periodo', PERIODO_2: '2º periodo', PERIODO_3: '3er periodo', SEMESTRAL: 'Semestral', OTRO: 'Otro' };
  const MOTIVOS = { ALUMNO: 'Lo envió el alumno', TIEMPO: 'Se acabó el tiempo', ADVERTENCIAS: 'Límite de advertencias', APLICADOR: 'Forzado por el aplicador' };

  // ───────────── Sesión ─────────────
  $('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('btn-login');
    cargando(btn, true, 'Entrando…');
    $('msg-login').innerHTML = '';
    try {
      const r = await llamar('login', { usuario: $('in-usuario').value.trim() || 'admin', clave: $('in-clave').value });
      A.token = r.tokenAdmin;
      sessionStorage.setItem(CLAVE_TOKEN, A.token);
      try { localStorage.setItem('examenSeguro.usuario', $('in-usuario').value.trim()); } catch (e2) { /* */ }
      $('in-clave').value = '';
      entrar();
    } catch (err) {
      $('msg-login').innerHTML = '<div class="mensaje error">' + esc(err.message) + '</div>';
    } finally { cargando(btn, false); }
  });

  $('btn-salir').addEventListener('click', () => { sessionStorage.removeItem(CLAVE_TOKEN); location.reload(); });

  function entrar() {
    $('v-login').hidden = true;
    $('v-panel').hidden = false;
    $('url-alumno').textContent = new URL('index.html', location.href).href;
    refrescar();
    clearInterval(A.tRefresco);
    A.tRefresco = setInterval(() => { if (!$('v-panel').hidden && (A.vista === 'vivo' || A.vista === 'incidencias')) refrescar(); }, 8000);
    setInterval(pintarVivoTiempos, 1000);
  }

  async function api(accion, datos, op) {
    try {
      return await llamar(accion, Object.assign({ tokenAdmin: A.token }, datos || {}), op);
    } catch (err) {
      if (err.codigo === 'SESION_ADMIN') {
        sessionStorage.removeItem(CLAVE_TOKEN);
        avisar(err.message, 'peligro', 5000);
        setTimeout(() => location.reload(), 1500);
      }
      throw err;
    }
  }

  async function refrescar() {
    if (A.cargandoResumen) return;
    A.cargandoResumen = true;
    try {
      const d = await api('adminResumen', {}, { reintentos: 0 });
      notificarNuevas(d.incidencias);
      A.datos = d;
      aplicarSesion(d.sesion);
      if (!A.examenSel || !d.examenes.some((x) => x.examen_id === A.examenSel)) A.examenSel = (d.examenes[0] || {}).examen_id || '';
      pintarTodo();
      $('txt-actualizado').textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (err) {
      $('txt-actualizado').textContent = '⚠ ' + err.message;
    } finally { A.cargandoResumen = false; }
  }

  function aplicarSesion(ses) {
    if (!ses || (A.ses && A.ses.usuario === ses.usuario)) return;
    A.ses = ses;
    const admin = ses.rol === 'admin';
    $('txt-nombre').textContent = ses.nombre;
    $('txt-rol').textContent = admin ? 'Administración' : 'Panel de profesores';
    $('tab-profesores').hidden = !admin;
    $('tit-examenes').textContent = admin ? 'Exámenes (todos los profesores)' : 'Mis exámenes';
    $('pestanas').querySelector('[data-v="examenes"]').textContent = admin ? 'Exámenes' : 'Mis exámenes';
  }

  function notificarNuevas(incidencias) {
    const graves = incidencias.filter((i) => i.grave);
    if (A.incVistas === null) { A.incVistas = new Set(graves.map((i) => i.fila + '|' + i.fecha)); return; }
    const nuevas = graves.filter((i) => !A.incVistas.has(i.fila + '|' + i.fecha));
    nuevas.forEach((i) => A.incVistas.add(i.fila + '|' + i.fecha));
    if (nuevas.length) {
      const i = nuevas[0];
      avisar('⚠ ' + (i.alumno || i.codigo) + ': ' + (TIPOS_INC[i.tipo] || [i.tipo])[0] + ' (' + i.advertencias_total + ' advertencia' + (i.advertencias_total === 1 ? '' : 's') + ')', 'peligro', 7000);
      pitido();
    }
  }
  function pitido() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.25);
    } catch (e) { /* */ }
  }

  // ───────────── Pestañas ─────────────
  $('pestanas').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    A.vista = b.dataset.v;
    $('pestanas').querySelectorAll('button').forEach((x) => x.classList.toggle('activa', x === b));
    ['vivo', 'resultados', 'incidencias', 'examenes', 'profesores'].forEach((v) => { $('v-' + v).hidden = v !== A.vista; });
    if (A.vista === 'profesores') cargarProfesores(); else refrescar();
  });

  function pintarTodo() {
    pintarSelectores();
    pintarVivo();
    pintarResultados();
    pintarIncidencias();
    pintarExamenes();
  }

  function examenPorId(id) { return (A.datos.examenes || []).find((x) => x.examen_id === id) || {}; }

  function pintarSelectores() {
    const opts = A.datos.examenes.filter((x) => !x.archivado || x.examen_id === A.examenSel).map((x) => '<option value="' + esc(x.examen_id) + '">' + esc(x.titulo) + '</option>').join('');
    const s = $('sel-examen');
    if (s.dataset.opts !== opts) { s.innerHTML = opts; s.dataset.opts = opts; }
    s.value = A.examenSel;
    $('gen-examen').innerHTML = A.datos.examenes.filter((x) => x.activo).map((x) => '<option value="' + esc(x.examen_id) + '">' + esc(x.titulo) + '</option>').join('');
    const grupos = Array.from(new Set(A.datos.codigos.map((c) => c.grupo).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
    $('lista-grupos').innerHTML = grupos.map((g) => '<option value="' + esc(g) + '">').join('');
    const sr = $('sel-res-examen');
    const optsRes = '<option value="">Todos los exámenes</option>' + A.datos.examenes.filter((x) => A.datos.resultados.some((r) => r.examen_id === x.examen_id))
      .map((x) => '<option value="' + esc(x.examen_id) + '">' + esc(x.titulo) + (x.archivado ? ' (archivado)' : '') + '</option>').join('');
    if (sr.dataset.opts !== optsRes) { sr.innerHTML = optsRes; sr.dataset.opts = optsRes; }
    if (A.resExamen && !A.datos.resultados.some((r) => r.examen_id === A.resExamen)) A.resExamen = '';
    sr.value = A.resExamen;
    const selInc = $('sel-inc');
    const prev = selInc.value;
    const codigosConInc = Array.from(new Set(A.datos.incidencias.map((i) => i.codigo)));
    selInc.innerHTML = '<option value="">Todos los alumnos</option>' + codigosConInc.map((c) => {
      const i = A.datos.incidencias.find((x) => x.codigo === c);
      return '<option value="' + esc(c) + '">' + esc(c + (i && i.alumno ? ' · ' + i.alumno : '')) + '</option>';
    }).join('');
    selInc.value = codigosConInc.includes(prev) ? prev : '';
  }
  $('sel-examen').addEventListener('change', (e) => { A.examenSel = e.target.value; pintarVivo(); });
  $('chk-anulados').addEventListener('change', pintarVivo);

  // ───────────── En vivo ─────────────
  const ORDEN_ESTADO = { EN_CURSO: 0, DISPONIBLE: 1, ENVIADO: 2, ANULADO: 3 };

  function pintarVivo() {
    if (!A.datos) return;
    const ex = examenPorId(A.examenSel);
    let cods = A.datos.codigos.filter((c) => c.examen_id === A.examenSel);
    const k = { DISPONIBLE: 0, EN_CURSO: 0, ENVIADO: 0, bloqueados: 0 };
    cods.forEach((c) => { k[c.estado] = (k[c.estado] || 0) + 1; if (c.estado === 'EN_CURSO' && c.bloqueado) k.bloqueados++; });
    const advHoy = A.datos.incidencias.filter((i) => i.grave && cods.some((c) => c.codigo === i.codigo) && new Date(i.fecha).toDateString() === new Date().toDateString()).length;
    $('kpis').innerHTML = [
      [k.DISPONIBLE, 'Códigos disponibles', ''], [k.EN_CURSO, 'Contestando ahora', ''], [k.ENVIADO, 'Exámenes enviados', ''],
      [advHoy, 'Advertencias hoy', advHoy ? 'alerta' : ''], [k.bloqueados, 'Bloqueados', k.bloqueados ? 'alerta' : '']
    ].map((x) => '<div class="kpi ' + x[2] + '"><div class="n">' + x[0] + '</div><div class="l">' + x[1] + '</div></div>').join('');

    pintarSeguridadVivo(ex, cods);
    if (!$('chk-anulados').checked) cods = cods.filter((c) => c.estado !== 'ANULADO');
    cods.sort((a, b) => (ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado]) || (b.inicio - a.inicio) || (b.creado - a.creado));
    const total = ex.total_preguntas || 0;
    let html = '<thead><tr><th>Código</th><th>Estado</th><th>Alumno</th><th>Avance</th><th>Tiempo</th><th>Advertencias</th><th>Última señal</th><th></th></tr></thead><tbody>';
    if (!cods.length) html += '<tr><td colspan="8" class="vacio">No hay códigos para este examen. Usa «Generar códigos».</td></tr>';
    cods.forEach((c) => {
      const libre = c.seguridad === 'LIBRE' || (!c.seguridad && ex.seguridad === 'LIBRE');
      const estado = (c.estado === 'EN_CURSO' && libre ? '<span class="estado LIBRE" title="Sin candados: puede usar otros programas">🔓</span> ' : '') + (c.estado === 'EN_CURSO' && c.bloqueado ? '<span class="estado BLOQUEADO">BLOQUEADO</span>' : '<span class="estado ' + c.estado + '">' + c.estado.replace('_', ' ') + '</span>');
      const extra = [c.grupo ? 'Grupo ' + c.grupo : '', c.escuela, c.promedio ? 'Prom. ' + c.promedio : ''].filter(Boolean).join(' · ');
      const alumno = c.nombre ? '<b>' + esc(c.nombre + ' ' + c.apellidos) + '</b><div class="pequeno suave">' + esc(extra) + '</div>' : '<span class="suave">' + esc(c.grupo ? 'Grupo ' + c.grupo : (c.etiqueta || '—')) + '</span>';
      const avance = c.estado === 'EN_CURSO' || c.estado === 'ENVIADO'
        ? '<span class="mini-barra"><i style="width:' + (total ? Math.round(c.contestadas / total * 100) : 0) + '%"></i></span><span class="pequeno">' + c.contestadas + '/' + total + '</span>' : '';
      let adv = '<span class="puntos-adv">';
      for (let i = 0; i < (ex.max_advertencias || 3); i++) adv += '<i class="' + (i < c.advertencias ? 'on' : '') + '"></i>';
      adv += '</span>';
      const senal = c.estado === 'EN_CURSO' ? '<span data-senal="' + c.ultimo_contacto + '" class="pequeno"></span>' : (c.estado === 'ENVIADO' ? '<span class="pequeno suave">' + esc(MOTIVOS[c.motivo_envio] || '') + '</span>' : '');
      html += '<tr class="' + (c.estado === 'EN_CURSO' && (c.bloqueado || c.advertencias) ? 'resaltar' : '') + '">' +
        '<td class="mono"><b>' + esc(c.codigo) + '</b></td><td>' + estado + '</td><td>' + alumno + '</td><td>' + avance + '</td>' +
        '<td class="mono">' + (c.estado === 'EN_CURSO' ? '<span data-limite="' + c.limite + '"></span>' : (c.estado === 'ENVIADO' ? hora(c.enviado) : '')) + '</td>' +
        '<td>' + (c.estado === 'DISPONIBLE' ? '' : adv) + '</td><td>' + senal + '</td><td>' + menuAcciones(c) + '</td></tr>';
    });
    $('tabla-codigos').innerHTML = html + '</tbody>';
    // Si había un menú de acciones abierto, se mantiene abierto tras la actualización automática
    if (A.menuAbierto) {
      const b = $('tabla-codigos').querySelector('[data-menu="' + CSS.escape(A.menuAbierto) + '"]');
      if (b) b.nextElementSibling.hidden = false; else A.menuAbierto = null;
    }
    pintarVivoTiempos();
  }

  /** Barra para quitar o poner los candados en vivo (parte práctica). */
  function pintarSeguridadVivo(ex, cods) {
    const caja = $('vivo-seg');
    if (!ex) { caja.innerHTML = ''; return; }
    const efectiva = (c) => (c.seguridad === 'LIBRE' || c.seguridad === 'COMPLETA') ? c.seguridad : (ex.seguridad === 'LIBRE' ? 'LIBRE' : 'COMPLETA');
    const enCurso = cods.filter((c) => c.estado === 'EN_CURSO');
    const grupos = Array.from(new Set(cods.filter((c) => c.estado === 'EN_CURSO' || c.estado === 'DISPONIBLE').map((c) => c.grupo).filter(Boolean))).sort();
    const selAnt = $('vivo-seg-grupo') ? $('vivo-seg-grupo').value : '';
    const g = grupos.indexOf(selAnt) >= 0 ? selAnt : '';
    const delGrupo = enCurso.filter((c) => !g || c.grupo === g);
    const libres = delGrupo.filter((c) => efectiva(c) === 'LIBRE').length;
    const conCandado = delGrupo.length - libres;
    caja.innerHTML = '<div class="vivo-seg">' +
      '<b>Seguridad</b>' +
      '<span class="pequeno suave">El examen está configurado ' + (ex.seguridad === 'LIBRE' ? '🔓 sin candados' : '🔒 con candados') + '.</span>' +
      (enCurso.length ? '<span class="pequeno">Ahora: <b>' + conCandado + '</b> con candados · <b>' + libres + '</b> sin candados</span>' : '') +
      (grupos.length > 1 ? '<select class="entrada chica" id="vivo-seg-grupo" style="width:auto"><option value="">Todos los grupos</option>' + grupos.map((x) => '<option' + (x === g ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select>' : '') +
      '<button class="btn secundario chico" data-seg="LIBRE"' + (delGrupo.length && !conCandado ? ' disabled' : '') + ' title="Para la parte práctica: el alumno podrá abrir Visual Studio Code u otros programas, y copiar y pegar">🔓 Quitar candados</button>' +
      '<button class="btn secundario chico" data-seg="COMPLETA"' + (delGrupo.length && !libres ? ' disabled' : '') + '>🔒 Poner candados</button></div>';
  }
  $('vivo-seg').addEventListener('change', (e) => { if (e.target.id === 'vivo-seg-grupo') pintarVivo(); });
  $('vivo-seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-seg]');
    if (!b) return;
    const modo = b.dataset.seg;
    const grupo = $('vivo-seg-grupo') ? $('vivo-seg-grupo').value : '';
    const quien = grupo ? 'los alumnos del grupo ' + grupo : 'todos los alumnos de este examen';
    confirmar(modo === 'LIBRE' ? 'Quitar candados' : 'Poner candados',
      modo === 'LIBRE'
        ? 'A ' + quien + ' (los que están contestando y los que aún no entran) se les quitarán los candados: podrán abrir otros programas, como Visual Studio Code, y copiar y pegar. Salir del examen ya no contará como advertencia. Les llega en menos de un minuto.'
        : 'A ' + quien + ' se les volverán a poner los candados: tendrán que regresar a pantalla completa y salir contará como advertencia. Les llega en menos de un minuto.',
      '', async () => {
        const r = await api('adminSeguridad', { examen_id: A.examenSel, grupo, modo });
        avisar((modo === 'LIBRE' ? 'Candados quitados' : 'Candados puestos') + ' · ' + r.alumnos + ' alumno(s) contestando ahora', 'ok', 6000);
        await refrescar();
      });
  });

  function pintarVivoTiempos() {
    document.querySelectorAll('[data-limite]').forEach((el) => {
      const resta = Number(el.dataset.limite) - Reloj.ahora();
      el.textContent = formatoTiempo(resta);
      el.style.color = resta < 5 * 60000 ? 'var(--peligro)' : '';
    });
    document.querySelectorAll('[data-senal]').forEach((el) => {
      const ms = Number(el.dataset.senal);
      el.textContent = haceCuanto(ms);
      const viejo = Reloj.ahora() - ms > 75000;
      el.style.color = viejo ? 'var(--aviso)' : '';
      el.title = viejo ? 'Hace rato que este equipo no se comunica (¿sin internet o cerró la página?)' : '';
    });
  }

  function menuAcciones(c) {
    const acc = [];
    if (c.estado === 'EN_CURSO') {
      if (c.bloqueado) acc.push(['desbloquear', 'Desbloquear examen']);
      acc.push(['agregarTiempo', 'Dar 10 minutos más']);
      if (c.advertencias > 0) acc.push(['perdonar', 'Quitar una advertencia']);
      acc.push(['liberar', 'Pasar a otro equipo']);
      acc.push(['forzarEnvio', 'Forzar envío', 'rojo']);
    }
    if (c.estado === 'ENVIADO') acc.push(['ver', 'Ver respuestas']);
    if (c.estado === 'DISPONIBLE' || c.estado === 'EN_CURSO') acc.push(['anular', 'Anular código', 'rojo']);
    if (c.estado !== 'DISPONIBLE') acc.push(['reiniciar', 'Reiniciar (borrar todo)', 'rojo']);
    if (!acc.length) return '';
    return '<div class="menu-acc"><button class="btn secundario chico" data-menu="' + esc(c.codigo) + '">Acciones ▾</button><div class="lista" hidden>' +
      acc.map((a) => '<button data-acc="' + a[0] + '" data-cod="' + esc(c.codigo) + '" class="' + (a[2] || '') + '">' + a[1] + '</button>').join('') + '</div></div>';
  }

  document.addEventListener('click', (e) => {
    const menu = e.target.closest('[data-menu]');
    document.querySelectorAll('.menu-acc .lista').forEach((l) => { if (!menu || l !== menu.nextElementSibling) l.hidden = true; });
    if (menu) {
      menu.nextElementSibling.hidden = !menu.nextElementSibling.hidden;
      A.menuAbierto = menu.nextElementSibling.hidden ? null : menu.dataset.menu;
      return;
    }
    A.menuAbierto = null;
    const b = e.target.closest('#tabla-codigos [data-acc]');
    if (b) accionCodigo(b.dataset.acc, b.dataset.cod);
  });

  const TEXTOS_ACC = {
    desbloquear: ['Desbloquear examen', 'El alumno podrá volver a su examen (tendrá que regresar a pantalla completa).', ''],
    agregarTiempo: ['Dar 10 minutos más', 'Se agregarán 10 minutos al tiempo de este alumno.', ''],
    perdonar: ['Quitar una advertencia', 'Úsalo si la salida no fue culpa del alumno (por ejemplo, una falla del equipo).', ''],
    liberar: ['Pasar a otro equipo', 'El alumno podrá entrar con el mismo código en otra computadora y continuar con sus respuestas y su tiempo. El equipo anterior queda desconectado.', ''],
    forzarEnvio: ['Forzar envío', 'El examen se enviará y calificará ahora con lo que haya guardado.', 'peligro'],
    anular: ['Anular código', 'El código ya no servirá. Si el alumno estaba contestando, se le cerrará el examen.', 'peligro'],
    reiniciar: ['Reiniciar código', 'Se BORRAN los datos, respuestas y calificación de este código, y queda como nuevo. Esto no se puede deshacer.', 'peligro']
  };

  function accionCodigo(acc, codigo) {
    if (acc === 'ver') { abrirDetalle(codigo); return; }
    const t = TEXTOS_ACC[acc];
    const c = A.datos.codigos.find((x) => x.codigo === codigo) || {};
    confirmar(t[0] + ' · ' + codigo, (c.nombre ? c.nombre + ' ' + c.apellidos + '. ' : '') + t[1], t[2], async () => {
      await api('adminAccionCodigo', { codigo, accion: acc, minutos: 10 });
      avisar('Listo: ' + t[0].toLowerCase() + ' (' + codigo + ')', 'ok');
      refrescar();
    });
  }

  function confirmar(titulo, texto, tipo, alConfirmar) {
    $('conf-titulo').textContent = titulo;
    $('conf-texto').textContent = texto;
    $('conf-extra').innerHTML = '';
    const ok = $('conf-ok');
    ok.className = 'btn' + (tipo ? ' ' + tipo : '');
    ok.disabled = false;
    ok.textContent = 'Confirmar';
    ok.onclick = async () => {
      cargando(ok, true);
      try { await alConfirmar(); cerrarModal('m-confirmar'); } catch (err) { avisar(err.message, 'peligro', 5000); } finally { cargando(ok, false); }
    };
    $('m-confirmar').hidden = false;
  }

  function cerrarModal(id) { $(id).hidden = true; }
  document.querySelectorAll('.modal-fondo').forEach((m) => {
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-cerrar]')) m.hidden = true; });
  });

  // ───────────── Generar códigos ─────────────
  $('btn-generar').addEventListener('click', () => {
    $('gen-examen').value = A.examenSel;
    $('msg-generar').innerHTML = '';
    $('m-generar').hidden = false;
  });
  $('form-generar').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('btn-gen-ok');
    cargando(btn, true, 'Generando…');
    try {
      if (!$('gen-etiqueta').value.trim()) throw new Error('Escribe el grupo, ej. 3°B.');
      const r = await api('adminGenerarCodigos', { examen_id: $('gen-examen').value, cantidad: Number($('gen-cantidad').value), grupo: $('gen-etiqueta').value });
      cerrarModal('m-generar');
      A.ultimos = { codigos: r.codigos, examen: r.examen, etiqueta: r.grupo };
      $('cod-examen').textContent = r.examen + ' · ' + r.codigos.length + ' código' + (r.codigos.length === 1 ? '' : 's');
      $('cod-lista').innerHTML = r.codigos.map((c) => '<div>' + esc(c) + '</div>').join('');
      $('m-codigos').hidden = false;
      refrescar();
    } catch (err) {
      $('msg-generar').innerHTML = '<div class="mensaje error">' + esc(err.message) + '</div>';
    } finally { cargando(btn, false); }
  });
  $('btn-copiar').addEventListener('click', () => {
    const txt = A.ultimos.codigos.join('\n');
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => avisar('Códigos copiados', 'ok')).catch(() => avisar('No se pudo copiar; selecciónalos a mano.', 'peligro'));
  });
  $('btn-imprimir').addEventListener('click', () => {
    const url = new URL('index.html', location.href).href;
    $('zona-impresion').innerHTML = A.ultimos.codigos.map((c) => '<div class="ficha"><div class="peq">Colegio La Paz · ' + esc(A.ultimos.examen) + ' · Grupo ' + esc(A.ultimos.etiqueta) + '</div>' +
      '<div class="peq">Nombre: ______________________________________________</div><div class="cod">' + esc(c) + '</div>' +
      '<div class="peq">Entra a <b>' + esc(url) + '</b> y escribe este código. Es personal y sirve una sola vez.</div></div>').join('');
    window.print();
  });

  // ───────────── Resultados ─────────────
  $('sel-res-examen').addEventListener('change', (e) => { A.resExamen = e.target.value; A.resGrupo = ''; pintarResultados(); });
  $('sel-res-grupo').addEventListener('change', (e) => { A.resGrupo = e.target.value; pintarResultados(); });
  $('btn-analisis').addEventListener('click', () => window.Analisis.abrir(A.resExamen, A.resGrupo));
  $('btn-pdfs').addEventListener('click', () => window.Analisis.pdf(A.resExamen, null, $('btn-pdfs'), A.resGrupo));
  $('btn-evidencias').addEventListener('click', () => window.Analisis.evidencias(A.resExamen));
  $('btn-ia-abiertas').addEventListener('click', async () => {
    const btn = $('btn-ia-abiertas');
    cargando(btn, true, 'Calificando…');
    try {
      const r = await api('iaCalificarPendientes', { examen_id: A.resExamen }, { espera: 300000 });
      avisar(r.calificadas ? 'La IA calificó ' + r.calificadas + ' respuesta(s) abierta(s). Revísalas en «Revisar».' : 'No hubo respuestas pendientes que calificar (o la IA no respondió; intenta en unos minutos).', r.calificadas ? 'ok' : '', 7000);
      refrescar();
    } catch (err) { avisar(err.message, 'peligro', 6000); } finally { cargando(btn, false); }
  });
  function pintarResultados() {
    const porRevisar = A.datos.resultados.filter((r) => r.estado === 'POR_REVISAR').length;
    const delExamen = A.datos.resultados.filter((r) => !A.resExamen || r.examen_id === A.resExamen);
    const grupos = Array.from(new Set(delExamen.map((r) => r.grupo || ''))).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
    if (A.resGrupo && grupos.indexOf(A.resGrupo) < 0) A.resGrupo = '';
    const sg = $('sel-res-grupo');
    const optsG = '<option value="">Todos los grupos</option>' + grupos.map((g) => '<option value="' + esc(g) + '">Grupo ' + esc(g) + '</option>').join('');
    if (sg.dataset.opts !== optsG) { sg.innerHTML = optsG; sg.dataset.opts = optsG; }
    sg.value = A.resGrupo;
    sg.hidden = grupos.length < 2;
    const res = delExamen.filter((r) => !A.resGrupo || r.grupo === A.resGrupo)
      .sort((a, b) => A.resExamen ? (a.apellidos + a.nombre).localeCompare(b.apellidos + b.nombre, 'es') : b.enviado - a.enviado);
    $('btn-analisis').disabled = !A.resExamen;
    const pendientesEx = A.resExamen && delExamen.some((r) => r.estado === 'POR_REVISAR');
    $('btn-ia-abiertas').hidden = !(pendientesEx && A.datos.sesion && A.datos.sesion.ia);
    $('btn-pdfs').disabled = !A.resExamen;
    $('cnt-revisar').hidden = !porRevisar;
    $('cnt-revisar').textContent = porRevisar;
    const conEscuela = res.some((r) => r.escuela);
    let html = '<thead><tr><th>Alumno</th><th>Grupo</th>' + (conEscuela ? '<th>Escuela</th><th>Prom.</th>' : '') + '<th>Calificación</th><th>Puntos</th><th>Advert.</th><th>Envío</th><th>Estado</th><th></th></tr></thead><tbody>';
    if (!res.length) html += '<tr><td colspan="10" class="vacio">Aún no hay exámenes enviados.</td></tr>';
    res.forEach((r) => {
      html += '<tr><td><b>' + esc(r.nombre + ' ' + r.apellidos) + '</b><div class="pequeno suave mono">' + esc(r.codigo) + ' · ' + esc(r.examen) + '</div></td>' +
        '<td>' + esc(r.grupo || '—') + '</td>' + (conEscuela ? '<td>' + esc(r.escuela) + '</td><td>' + esc(r.promedio) + '</td>' : '') +
        '<td><span class="calif">' + r.calificacion.toFixed(1) + '</span></td>' +
        '<td>' + fmt(r.puntos) + ' / ' + fmt(r.puntos_max) + '<div class="pequeno suave">' + r.porcentaje + '%</div></td>' +
        '<td>' + (r.advertencias ? '<span class="inc-grave">' + r.advertencias + '</span>' : '0') + '</td>' +
        '<td class="pequeno">' + fechaHora(r.enviado) + '<div class="suave">' + esc(MOTIVOS[r.motivo_envio] || r.motivo_envio) + ' · ' + r.minutos_usados + ' min</div></td>' +
        '<td><span class="estado ' + r.estado + '">' + (r.estado === 'POR_REVISAR' ? 'POR REVISAR (' + r.por_revisar + ')' : 'COMPLETO') + '</span>' +
        (Number(r.revision_ia) ? '<div class="pequeno suave" title="Preguntas abiertas calificadas por la IA">🤖 ' + r.revision_ia + ' por IA</div>' : '') + '</td>' +
        '<td class="nowrap"><button class="btn secundario chico" data-ver="' + esc(r.codigo) + '">Revisar</button> ' +
        '<button class="btn secundario chico" data-pdf="' + esc(r.codigo) + '" data-ex="' + esc(r.examen_id) + '" title="Descargar su examen evaluado en PDF">PDF</button></td></tr>';
    });
    $('tabla-resultados').innerHTML = html + '</tbody>';
  }
  const fmt = (n) => (Math.round(Number(n) * 10) / 10).toString();
  $('tabla-resultados').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ver]');
    if (b) { abrirDetalle(b.dataset.ver); return; }
    const p = e.target.closest('[data-pdf]');
    if (p) window.Analisis.pdf(p.dataset.ex, [p.dataset.pdf], p);
  });

  $('btn-csv').addEventListener('click', () => {
    const cols = ['codigo', 'examen', 'grupo', 'nombre', 'apellidos', 'escuela', 'promedio', 'calificacion', 'puntos', 'puntos_max', 'porcentaje', 'advertencias', 'motivo_envio', 'minutos_usados', 'estado'];
    const lista = A.datos.resultados.filter((r) => (!A.resExamen || r.examen_id === A.resExamen) && (!A.resGrupo || r.grupo === A.resGrupo));
    const filas = [cols.join(',')].concat(lista.map((r) => cols.map((c) => '"' + String(r[c] == null ? '' : r[c]).replace(/"/g, '""') + '"').join(',')));
    const blob = new Blob(['﻿' + filas.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'resultados-examen-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
  });

  // ───────────── Cajón: detalle y calificación ─────────────
  function abrirCajon(titulo, sub) {
    $('caj-titulo').textContent = titulo;
    $('caj-sub').textContent = sub || '';
    $('caj-cuerpo').innerHTML = '<p class="suave">Cargando…</p>';
    $('caj-pie').innerHTML = '';
    $('cajon').hidden = false; $('cajon-fondo').hidden = false;
  }
  function cerrarCajon() { $('cajon').hidden = true; $('cajon-fondo').hidden = true; }
  $('caj-cerrar').addEventListener('click', cerrarCajon);
  $('cajon-fondo').addEventListener('click', cerrarCajon);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { cerrarCajon(); document.querySelectorAll('.modal-fondo').forEach((m) => { m.hidden = true; }); } });

  function textoRespuesta(it, valor) {
    if (valor == null || String(valor).trim() === '') return '<span class="suave">— sin respuesta —</span>';
    const v = String(valor);
    if (it.tipo === 'numerica' || it.tipo === 'conjunto') {
      const r = it.tipo === 'numerica' ? leerNumero(v, true) : leerConjunto(v);
      const simple = /^-?\d+(\.\d+)?$/.test(v.trim());
      return '<span class="mono">' + esc(v) + '</span>' + (r && !simple ? ' &nbsp;→ ' + latex(r.tex) : (r ? '' : ' <span class="suave">(no se entiende)</span>'));
    }
    if (it.tipo === 'codigo') return bloqueCodigo(v);
    if (it.tipo === 'opcion') return formato(v);
    if (it.tipo === 'abierta' || it.tipo === 'completar' || it.tipo === 'relacionar' || it.tipo === 'crucigrama') return '<div style="white-space:pre-wrap">' + esc(v) + '</div>';
    return esc(v);
  }

  async function abrirDetalle(codigo) {
    abrirCajon('Revisión · ' + codigo, '');
    try {
      const d = await api('adminDetalle', { codigo });
      const r = d.resultado;
      $('caj-titulo').textContent = d.alumno.nombre + ' ' + d.alumno.apellidos;
      $('caj-sub').textContent = d.examen.titulo + ' · Código ' + codigo + (d.alumno.escuela ? ' · ' + d.alumno.escuela : '') + (d.alumno.promedio ? ' · Promedio ' + d.alumno.promedio : '');
      let html = '';
      let grupo = null;
      d.items.forEach((it) => {
        if (it.grupo !== grupo) { grupo = it.grupo; html += '<div class="titulo-grupo">' + esc(it.seccion) + ' — ' + esc(it.grupo) + '</div>'; }
        const editable = d.estado === 'ENVIADO';
        html += '<div class="item-rev ' + esc(it.resultado) + '"><div class="top"><div class="enun">' + (it.inciso ? '<b>' + esc(it.inciso) + '</b> ' : '') + (it.enunciado ? formato(it.enunciado) : '<span class="suave">' + ({ relacionar: 'Relacionar columnas', crucigrama: 'Crucigrama' }[it.tipo] || '') + '</span>') + '</div>' +
          '<div class="pts-in">' + (editable ? '<input type="number" min="0" max="' + it.puntos_max + '" step="0.5" value="' + it.puntos + '" data-pid="' + esc(it.pregunta_id) + '" data-orig="' + it.puntos + '">' : it.puntos) + ' / ' + it.puntos_max + '</div></div>' +
          (it.imagen_url ? '<img class="figura-rev" src="' + esc(it.imagen_url) + '" alt="Figura de la pregunta" loading="lazy">' : '') +
          '<div class="resp"><div><b>Respuesta del alumno</b>' + textoRespuesta(it, it.respuesta_alumno) + '</div>' +
          '<div><b>' + (it.tipo === 'abierta' || it.tipo === 'codigo' ? 'Guía para calificar' : 'Respuesta correcta') + '</b>' + (it.tipo === 'codigo' && it.respuesta_correcta ? bloqueCodigo(it.respuesta_correcta) : it.tipo === 'opcion' ? '<div>' + formato(it.respuesta_correcta) + '</div>' : '<div style="white-space:pre-wrap">' + esc(it.respuesta_correcta) + '</div>') + '</div></div>' +
          (it.nota ? '<div class="nota-ia">' + (it.revisado === 'IA' ? '🤖 <b>Calificada por la IA:</b> ' : '🤖 ') + esc(it.nota) + (it.revisado === 'IA' ? ' <span class="suave">(si no estás de acuerdo, cambia los puntos y guarda)</span>' : '') + '</div>' : '') +
          (it.resultado === 'POR_REVISAR' ? '<div class="pequeno" style="color:var(--aviso);margin-top:6px">Pendiente de calificar a mano</div>' : '') + '</div>';
      });
      if (r) {
        html += '<div class="campo" style="margin-top:18px"><label for="caj-coment">Comentario para el alumno (sale en su PDF)</label>' +
          '<textarea class="entrada" id="caj-coment" maxlength="1500" style="min-height:80px" placeholder="Ej. Repasa leyes de los exponentes.">' + esc(r.comentario || '') + '</textarea></div>';
      }
      $('caj-cuerpo').innerHTML = html;
      renderMate($('caj-cuerpo'));
      const pie = $('caj-pie');
      if (r) {
        pie.innerHTML = '<div><span class="calif" id="caj-calif">' + Number(r.calificacion).toFixed(1) + '</span> <span class="suave">· <span id="caj-puntos">' + fmt(r.puntos) + '</span> / ' + fmt(r.puntos_max) + ' puntos</span></div>' +
          '<div style="display:flex;gap:8px"><button class="btn secundario" id="btn-caj-pdf">PDF del alumno</button><button class="btn" id="btn-guardar-calif" disabled>Guardar</button></div>';
        const comentOrig = String(r.comentario || '');
        const revisar = () => {
          $('btn-guardar-calif').disabled = !$('caj-cuerpo').querySelector('input.cambiado') && $('caj-coment').value === comentOrig;
        };
        const inputs = $('caj-cuerpo').querySelectorAll('input[data-pid]');
        inputs.forEach((inp) => inp.addEventListener('input', () => {
          inp.classList.toggle('cambiado', Number(inp.value) !== Number(inp.dataset.orig));
          revisar();
        }));
        $('caj-coment').addEventListener('input', revisar);
        $('btn-caj-pdf').addEventListener('click', () => window.Analisis.pdf(d.examen.examen_id, [codigo], $('btn-caj-pdf')));
        $('btn-guardar-calif').addEventListener('click', async () => {
          const btn = $('btn-guardar-calif');
          const cambios = Array.from($('caj-cuerpo').querySelectorAll('input.cambiado')).map((i) => ({ pregunta_id: i.dataset.pid, puntos: Number(i.value) }));
          cargando(btn, true, 'Guardando…');
          try {
            await api('adminCalificar', { codigo, cambios, comentario: $('caj-coment').value });
            avisar('Calificación guardada', 'ok');
            await refrescar();
            abrirDetalle(codigo);
          } catch (err) { avisar(err.message, 'peligro', 5000); cargando(btn, false); }
        });
      } else {
        pie.innerHTML = '<span class="suave">El examen aún no se ha enviado; se muestran las respuestas guardadas hasta ahora.</span>';
      }
    } catch (err) {
      $('caj-cuerpo').innerHTML = '<div class="mensaje error">' + esc(err.message) + '</div>';
    }
  }

  // ───────────── Incidencias ─────────────
  $('sel-inc').addEventListener('change', pintarIncidencias);
  $('chk-graves').addEventListener('change', pintarIncidencias);
  function pintarIncidencias() {
    const filtro = $('sel-inc').value;
    const solo = $('chk-graves').checked;
    const lista = A.datos.incidencias.filter((i) => (!filtro || i.codigo === filtro) && (!solo || i.grave));
    const hoy = A.datos.incidencias.filter((i) => i.grave && new Date(i.fecha).toDateString() === new Date().toDateString()).length;
    $('cnt-inc').hidden = !hoy; $('cnt-inc').textContent = hoy;
    let html = '<thead><tr><th>Hora</th><th>Código</th><th>Alumno</th><th>Evento</th><th>Detalle</th><th>Advertencias</th></tr></thead><tbody>';
    if (!lista.length) html += '<tr><td colspan="6" class="vacio">Sin incidencias.</td></tr>';
    lista.forEach((i) => {
      const t = TIPOS_INC[i.tipo] || [i.tipo, ''];
      html += '<tr class="' + (i.grave ? 'resaltar' : '') + '"><td class="mono pequeno">' + fechaHora(i.fecha) + ':' + String(new Date(i.fecha).getSeconds()).padStart(2, '0') + '</td>' +
        '<td class="mono">' + esc(i.codigo) + '</td><td>' + esc(i.alumno) + '</td>' +
        '<td class="' + (i.grave ? 'inc-grave' : '') + '">' + (i.grave ? '⚠ ' : '') + esc(t[0]) + '</td>' +
        '<td class="pequeno suave">' + esc(i.detalle) + '</td><td>' + (i.grave ? i.advertencias_total : '') + '</td></tr>';
    });
    $('tabla-inc').innerHTML = html + '</tbody>';
  }

  // ───────────── Exámenes ─────────────
  function pintarCarpetas() {
    const carpetas = (A.datos.carpetas || []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
    if (A.carpetaSel && A.carpetaSel !== '__sin' && A.carpetaSel !== '__arch' && !carpetas.some((c) => c.carpeta_id === A.carpetaSel)) A.carpetaSel = '';
    const vigentes = A.datos.examenes.filter((x) => !x.archivado);
    const archivados = A.datos.examenes.length - vigentes.length;
    if (A.carpetaSel === '__arch' && !archivados) A.carpetaSel = '';
    const cuenta = (id) => vigentes.filter((x) => (id === '__sin' ? !x.carpeta || !carpetas.some((c) => c.carpeta_id === x.carpeta) : x.carpeta === id)).length;
    const item = (id, ico, nombre, n, editable) => '<div class="carp' + (A.carpetaSel === id ? ' activa' : '') + '" data-carp="' + esc(id) + '"><span class="carp-ico">' + ico + '</span><span class="carp-nom">' + esc(nombre) + '</span><span class="carp-n">' + n + '</span>' +
      (editable ? '<span class="carp-acc"><button class="ico-btn" data-carp-acc="renombrar" data-id="' + esc(id) + '" title="Renombrar">✎</button><button class="ico-btn rojo" data-carp-acc="borrar" data-id="' + esc(id) + '" title="Eliminar carpeta">✕</button></span>' : '') + '</div>';
    let h = '<div class="carp-tit">Carpetas</div>' + item('', '🗂', 'Todos los exámenes', vigentes.length, false);
    carpetas.forEach((c) => { h += item(c.carpeta_id, '📁', c.nombre, cuenta(c.carpeta_id), true); });
    const sin = cuenta('__sin');
    if (carpetas.length && sin) h += item('__sin', '📄', 'Sin carpeta', sin, false);
    if (archivados) h += '<div class="carp-sep"></div>' + item('__arch', '📦', 'Archivados', archivados, false);
    h += '<button class="btn secundario chico bloque" data-carp-acc="nueva" style="margin-top:10px">+ Nueva carpeta</button>';
    $('carpetas-nav').innerHTML = h;
    const tipos = Object.keys(TIPOS_EX).filter((t) => A.datos.examenes.some((x) => x.tipo_examen === t));
    $('filtro-tipos').innerHTML = tipos.length > 1 ? '<button class="' + (!A.tipoSel ? 'activo' : '') + '" data-tipo-ex="">Todos</button>' +
      tipos.map((t) => '<button class="' + (A.tipoSel === t ? 'activo' : '') + '" data-tipo-ex="' + t + '">' + TIPOS_EX[t] + '</button>').join('') : '';
  }

  function pintarExamenes() {
    const admin = A.ses && A.ses.rol === 'admin';
    pintarCarpetas();
    const carpetas = A.datos.carpetas || [];
    const nombreCarpeta = (id) => (carpetas.find((c) => c.carpeta_id === id) || {}).nombre;
    if (A.tipoSel && !A.datos.examenes.some((x) => x.tipo_examen === A.tipoSel)) A.tipoSel = '';
    const lista = A.datos.examenes.filter((x) => {
      if (A.carpetaSel === '__arch') return !!x.archivado && (!A.tipoSel || x.tipo_examen === A.tipoSel);
      if (x.archivado) return false;
      if (A.tipoSel && x.tipo_examen !== A.tipoSel) return false;
      if (!A.carpetaSel) return true;
      if (A.carpetaSel === '__sin') return !x.carpeta || !nombreCarpeta(x.carpeta);
      return x.carpeta === A.carpetaSel;
    }).sort((a, b) => (b.actualizado || 0) - (a.actualizado || 0));
    if (!A.datos.examenes.length) {
      $('lista-examenes').innerHTML = '<div class="vacio-grande"><h3>Aún no tienes exámenes</h3><p class="suave">Crea uno desde cero o importa el que ya tienes en PDF o fotos.</p>' +
        '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button class="btn secundario" data-acc-ex="importar">✨ Importar con IA</button><button class="btn" data-acc-ex="nuevo">+ Nuevo examen</button></div></div>';
      return;
    }
    if (!lista.length && !A.carpetaSel && A.datos.examenes.every((x) => x.archivado)) {
      $('lista-examenes').innerHTML = '<div class="vacio-grande"><h3>Todos tus exámenes están archivados</h3><p class="suave">Los encuentras en «📦 Archivados», en la lista de carpetas.</p><button class="btn" data-acc-ex="nuevo">+ Nuevo examen</button></div>';
      return;
    }
    if (!lista.length) {
      $('lista-examenes').innerHTML = '<div class="vacio-grande"><h3>Esta carpeta está vacía</h3><p class="suave">Crea un examen aquí o mueve uno con el menú ⋯ de su tarjeta.</p><button class="btn" data-acc-ex="nuevo">+ Nuevo examen en esta carpeta</button></div>';
      return;
    }
    $('lista-examenes').innerHTML = lista.map((x) => {
      const n = A.datos.codigos.filter((c) => c.examen_id === x.examen_id);
      const enviados = n.filter((c) => c.estado === 'ENVIADO').length;
      const enCurso = n.filter((c) => c.estado === 'EN_CURSO').length;
      const id = esc(x.examen_id);
      const grupos = Array.from(new Set(n.map((c) => c.grupo).filter(Boolean)));
      return '<div class="tarjeta-ex"><div class="tx-cab"><div><span class="tipo-ex t-' + esc(x.tipo_examen) + '">' + esc(TIPOS_EX[x.tipo_examen] || '') + '</span>' + (x.seguridad === 'LIBRE' ? ' <span class="tipo-ex t-LIBRE" title="Examen práctico: el alumno puede usar otros programas">🔓 Sin candados</span>' : '') + '<h3>' + esc(x.titulo) + '</h3></div>' +
        (x.archivado ? '<span class="estado ARCHIVADO">📦 ARCHIVADO</span>' : x.activo ? '<span class="estado COMPLETO">ACTIVO</span>' : '<span class="estado ANULADO">INACTIVO</span>') + '</div>' +
        '<div class="suave pequeno">' + esc([x.materia, x.semestre ? 'Semestre ' + x.semestre : '', x.fecha_aplicacion ? 'Aplicación ' + x.fecha_aplicacion.split('-').reverse().join('/') : ''].filter(Boolean).join(' · ')) + (admin ? ' · <b>' + esc(x.propietario_nombre) + '</b>' : '') +
        (x.carpeta && nombreCarpeta(x.carpeta) && !A.carpetaSel ? ' · 📁 ' + esc(nombreCarpeta(x.carpeta)) : '') + '</div>' +
        '<div class="tx-datos"><span>📝 ' + x.total_preguntas + ' preguntas · ' + fmt(x.puntos_max) + ' pts</span><span>⏱ ' + x.duracion_min + ' min</span>' +
        '<span>🔑 ' + n.length + ' códigos' + (grupos.length ? ' · ' + esc(grupos.join(', ')) : '') + '</span><span>✅ ' + enviados + ' aplicados' + (enCurso ? ' · ' + enCurso + ' en curso' : '') + '</span></div>' +
        '<div class="tx-acc">' +
        '<button class="btn chico" data-acc-ex="editar" data-id="' + id + '">' + (x.usado ? 'Configurar' : 'Editar') + '</button>' +
        '<button class="btn secundario chico" data-acc-ex="probar" data-id="' + id + '" title="Contéstalo como alumno y mira cómo se califica">▶ Probar</button>' +
        (x.activo ? '<button class="btn secundario chico" data-acc-ex="codigos" data-id="' + id + '">Generar códigos</button>' : '') +
        (enviados ? '<button class="btn secundario chico" data-acc-ex="resultados" data-id="' + id + '">📊 Resultados</button>' : '') +
        '<div class="menu-acc"><button class="btn secundario chico" data-menu-ex>⋯</button><div class="lista" hidden>' +
        (enviados ? '<button data-acc-ex="analisis" data-id="' + id + '">📊 Análisis</button><button data-acc-ex="evidencias" data-id="' + id + '">📁 Evidencias</button>' : '') +
        '<button data-acc-ex="prev" data-id="' + id + '">Vista previa con respuestas</button>' +
        '<button data-acc-ex="mover" data-id="' + id + '">Mover a carpeta…</button>' +
        '<button data-acc-ex="duplicar" data-id="' + id + '">Duplicar</button>' +
        (x.archivado ? '' : '<button data-acc-ex="activo" data-id="' + id + '">' + (x.activo ? 'Desactivar' : 'Activar') + '</button>') +
        '<button data-acc-ex="archivar" data-id="' + id + '">' + (x.archivado ? '📤 Sacar del archivo' : '📦 Archivar') + '</button>' +
        (x.usado ? '<button class="rojo" data-acc-ex="eliminar-todo" data-id="' + id + '">🗑 Eliminar por completo…</button>' : '<button class="rojo" data-acc-ex="eliminar" data-id="' + id + '">🗑 Eliminar</button>') +
        '</div></div></div>' +
        (x.usado ? '<div class="pequeno suave" style="margin-top:8px">Ya se aplicó: sus preguntas quedan fijas. Para cambiarlas, duplícalo.</div>' : '') + '</div>';
    }).join('');
  }

  // Carpetas: elegir, crear, renombrar, borrar
  $('carpetas-nav').addEventListener('click', (e) => {
    const acc = e.target.closest('[data-carp-acc]');
    if (acc) {
      e.stopPropagation();
      const id = acc.dataset.id;
      const c = (A.datos.carpetas || []).find((x) => x.carpeta_id === id);
      if (acc.dataset.carpAcc === 'nueva' || acc.dataset.carpAcc === 'renombrar') {
        A.carpEdit = c || null;
        $('carp-titulo').textContent = c ? 'Renombrar carpeta' : 'Nueva carpeta';
        $('carp-nombre').value = c ? c.nombre : '';
        $('msg-carp').innerHTML = '';
        $('m-carpeta').hidden = false;
        setTimeout(() => $('carp-nombre').focus(), 50);
      } else if (acc.dataset.carpAcc === 'borrar') {
        confirmar('Eliminar carpeta', 'Se eliminará la carpeta «' + c.nombre + '». Sus exámenes NO se borran: quedan «sin carpeta».', 'peligro', async () => {
          await api('carpetaEliminar', { carpeta_id: id });
          A.carpetaSel = '';
          await refrescar();
        });
      }
      return;
    }
    const it = e.target.closest('[data-carp]');
    if (it) { A.carpetaSel = it.dataset.carp; pintarExamenes(); }
  });
  $('filtro-tipos').addEventListener('click', (e) => { const b = e.target.closest('[data-tipo-ex]'); if (b) { A.tipoSel = b.dataset.tipoEx; pintarExamenes(); } });
  $('form-carpeta').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('btn-carp-ok');
    cargando(btn, true);
    try {
      const r = await api('carpetaGuardar', { carpeta: { carpeta_id: A.carpEdit ? A.carpEdit.carpeta_id : '', nombre: $('carp-nombre').value } });
      cerrarModal('m-carpeta');
      A.carpetaSel = r.carpeta_id;
      await refrescar();
    } catch (err) { $('msg-carp').innerHTML = '<div class="mensaje error">' + esc(err.message) + '</div>'; } finally { cargando(btn, false); }
  });
  $('form-mover').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('btn-mov-ok');
    cargando(btn, true);
    try {
      await api('examenMover', { examen_id: A.moverId, carpeta_id: $('mov-carpeta').value });
      cerrarModal('m-mover');
      avisar('Examen movido', 'ok');
      await refrescar();
    } catch (err) { avisar(err.message, 'peligro', 5000); } finally { cargando(btn, false); }
  });

  $('btn-nuevo-examen').addEventListener('click', () => window.Editor.nuevo());
  $('btn-semestral').addEventListener('click', () => window.Editor.semestral());
  $('btn-importar').addEventListener('click', () => window.Editor.importar());
  document.addEventListener('click', (e) => {
    const m = e.target.closest('[data-menu-ex]');
    document.querySelectorAll('#lista-examenes .lista').forEach((l) => { if (!m || l !== m.nextElementSibling) l.hidden = true; });
    if (m) {
      const l = m.nextElementSibling;
      l.hidden = !l.hidden;
      if (!l.hidden) {
        // Si no cabe hacia abajo, el menú se abre hacia arriba
        l.classList.remove('arriba');
        const r = l.getBoundingClientRect();
        if (r.bottom > window.innerHeight - 8 && m.getBoundingClientRect().top > r.height + 8) l.classList.add('arriba');
      }
      return;
    }
    const b = e.target.closest('[data-acc-ex]');
    if (!b) return;
    const id = b.dataset.id;
    const x = id ? examenPorId(id) : {};
    switch (b.dataset.accEx) {
      case 'nuevo': window.Editor.nuevo(); break;
      case 'importar': window.Editor.importar(); break;
      case 'editar': window.Editor.abrir(id); break;
      case 'prev': vistaPrevia(id); break;
      case 'probar': window.Panel.probarComoAlumno(id); break;
      case 'analisis': window.Analisis.abrir(id); break;
      case 'evidencias': window.Analisis.evidencias(id); break;
      case 'resultados': {
        A.resExamen = id; A.resGrupo = '';
        $('pestanas').querySelector('[data-v="resultados"]').click();
        break;
      }
      case 'mover': {
        const carpetas = (A.datos.carpetas || []).filter((c) => !A.ses || A.ses.rol !== 'admin' || c.propietario === x.propietario);
        if (!carpetas.length) { avisar('Primero crea una carpeta con «+ Nueva carpeta».', 'peligro', 5000); break; }
        A.moverId = id;
        $('mov-examen').textContent = x.titulo;
        $('mov-carpeta').innerHTML = '<option value="">(Sin carpeta)</option>' + carpetas.map((c) => '<option value="' + esc(c.carpeta_id) + '">' + esc(c.nombre) + '</option>').join('');
        $('mov-carpeta').value = x.carpeta || '';
        $('m-mover').hidden = false;
        break;
      }
      case 'codigos': $('gen-examen').value = id; $('msg-generar').innerHTML = ''; $('m-generar').hidden = false; break;
      case 'duplicar':
        confirmar('Duplicar examen', 'Se creará una copia de «' + x.titulo + '» que podrás editar libremente.', '', async () => {
          const r = await api('examenDuplicar', { examen_id: id });
          await refrescar();
          window.Editor.abrir(r.examen_id);
        });
        break;
      case 'activo':
        (async () => {
          try {
            const d = await api('examenObtener', { examen_id: id });
            await api('examenGuardar', { examen: Object.assign({}, d.examen, { activo: !d.examen.activo }) });
            avisar(d.examen.activo ? 'Examen desactivado: ya no se puede presentar.' : 'Examen activado.', 'ok');
            refrescar();
          } catch (err) { avisar(err.message, 'peligro', 5000); }
        })();
        break;
      case 'archivar':
        (async () => {
          try {
            await api('examenArchivar', { examen_id: id, archivar: !x.archivado });
            avisar(x.archivado ? 'El examen volvió a «Mis exámenes» (sigue inactivo: actívalo para aplicarlo).' : 'Examen archivado y desactivado. Lo encuentras en «📦 Archivados»; sus resultados siguen disponibles.', 'ok', 6000);
            refrescar();
          } catch (err) { avisar(err.message, 'peligro', 5000); }
        })();
        break;
      case 'eliminar-todo': {
        const res = A.datos.resultados.filter((r) => r.examen_id === id).length;
        const cods = A.datos.codigos.filter((c) => c.examen_id === id).length;
        confirmar('Eliminar por completo', '', 'peligro', async () => {
          const r = await api('examenEliminar', { examen_id: id, completo: true, confirmacion: $('conf-escribe').value }, { espera: 120000 });
          avisar('Examen eliminado por completo · ' + r.borrado.resultados + ' resultado(s) y ' + r.borrado.respuestas + ' respuesta(s) borrados', 'ok', 7000);
          refrescar();
        });
        $('conf-texto').innerHTML = 'Se borrará <b>«' + esc(x.titulo) + '»</b> con <b>todo</b>: sus preguntas, ' + cods + ' código(s), <b>' + res + ' calificación(es) de alumnos</b>, sus respuestas, incidencias e imágenes. <b>No se puede deshacer.</b>' +
          '<br><br>Si necesitas guardar evidencias, primero descárgalas desde el menú ⋯ › 📁 Evidencias, o el CSV en Resultados. Si solo quieres quitarlo de la vista, mejor <b>📦 Archívalo</b>.';
        $('conf-extra').innerHTML = '<label class="pequeno" for="conf-escribe">Para confirmar, escribe el nombre del examen: <b>' + esc(x.titulo) + '</b></label>' +
          '<input class="entrada" id="conf-escribe" autocomplete="off" spellcheck="false" style="margin-top:6px">';
        const okBtn = $('conf-ok');
        const norm = (t) => String(t || '').trim().replace(/\s+/g, ' ').toLowerCase();
        okBtn.disabled = true;
        okBtn.textContent = 'Eliminar para siempre';
        $('conf-escribe').addEventListener('input', (ev) => { okBtn.disabled = norm(ev.target.value) !== norm(x.titulo); });
        setTimeout(() => $('conf-escribe').focus(), 50);
        break;
      }
      case 'eliminar':
        confirmar('Eliminar examen', 'Se eliminará «' + x.titulo + '» con sus preguntas y sus códigos sin usar. Esto no se puede deshacer.', 'peligro', async () => {
          await api('examenEliminar', { examen_id: id });
          avisar('Examen eliminado', 'ok');
          refrescar();
        });
        break;
    }
  });

  // ───────────── Profesores (solo admin) ─────────────
  async function cargarProfesores() {
    $('tabla-prof').innerHTML = '<tbody><tr><td class="vacio">Cargando…</td></tr></tbody>';
    try {
      const d = await api('adminUsuarios', {});
      A.usuarios = d.usuarios;
      let html = '<thead><tr><th>Profesor</th><th>Usuario</th><th>Materia</th><th>Exámenes</th><th>Último acceso</th><th>Estado</th><th></th></tr></thead><tbody>';
      if (!d.usuarios.length) html += '<tr><td colspan="7" class="vacio">Aún no hay profesores. Usa «Nuevo profesor».</td></tr>';
      d.usuarios.forEach((u) => {
        html += '<tr><td><b>' + esc(u.nombre) + '</b><div class="pequeno suave">' + esc(u.correo || '') + '</div></td><td class="mono">' + esc(u.usuario) + '</td>' +
          '<td>' + esc(u.materia || '') + '</td><td>' + u.examenes + '</td><td class="pequeno">' + (u.ultimo_acceso ? fechaHora(u.ultimo_acceso) : '<span class="suave">Nunca</span>') + '</td>' +
          '<td>' + (u.activo ? '<span class="estado COMPLETO">ACTIVO</span>' : '<span class="estado ANULADO">INACTIVO</span>') + '</td>' +
          '<td class="nowrap"><button class="btn secundario chico" data-prof="editar" data-u="' + esc(u.usuario) + '">Editar</button> ' +
          '<button class="btn secundario chico" data-prof="clave" data-u="' + esc(u.usuario) + '">Nueva contraseña</button></td></tr>';
      });
      $('tabla-prof').innerHTML = html + '</tbody>';
    } catch (err) {
      $('tabla-prof').innerHTML = '<tbody><tr><td class="vacio">' + esc(err.message) + '</td></tr></tbody>';
    }
  }
  function abrirProfesor(u) {
    A.profEdit = u || null;
    $('prof-titulo').textContent = u ? 'Editar profesor' : 'Nuevo profesor';
    $('prof-nombre').value = u ? u.nombre : '';
    $('prof-usuario').value = u ? u.usuario : '';
    $('prof-usuario').disabled = !!u;
    $('prof-materia').value = u ? u.materia || '' : '';
    $('prof-correo').value = u ? u.correo || '' : '';
    $('prof-activo').checked = u ? u.activo : true;
    $('prof-activo-caja').hidden = !u;
    $('msg-prof').innerHTML = '';
    $('m-prof').hidden = false;
    setTimeout(() => $('prof-nombre').focus(), 50);
  }
  $('btn-nuevo-prof').addEventListener('click', () => abrirProfesor(null));
  $('prof-nombre').addEventListener('input', () => {
    if (A.profEdit || $('prof-usuario').dataset.tocado) return;
    const partes = $('prof-nombre').value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/);
    $('prof-usuario').value = partes.length > 1 ? partes[0] + '.' + partes[partes.length > 2 ? partes.length - 2 : 1] : (partes[0] || '');
  });
  $('prof-usuario').addEventListener('input', (e) => { e.target.dataset.tocado = '1'; e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''); });
  $('form-prof').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('btn-prof-ok');
    cargando(btn, true, 'Guardando…');
    try {
      const r = await api('adminUsuarioGuardar', {
        esNuevo: !A.profEdit,
        usuario: { usuario: $('prof-usuario').value, nombre: $('prof-nombre').value, materia: $('prof-materia').value, correo: $('prof-correo').value, activo: $('prof-activo').checked }
      });
      cerrarModal('m-prof');
      delete $('prof-usuario').dataset.tocado;
      if (r.claveTemporal) mostrarAcceso(r.usuario, r.claveTemporal, $('prof-nombre').value);
      else avisar('Profesor actualizado', 'ok');
      cargarProfesores();
    } catch (err) {
      $('msg-prof').innerHTML = '<div class="mensaje error">' + esc(err.message) + '</div>';
    } finally { cargando(btn, false); }
  });
  $('tabla-prof').addEventListener('click', (e) => {
    const b = e.target.closest('[data-prof]');
    if (!b) return;
    const u = (A.usuarios || []).find((x) => x.usuario === b.dataset.u);
    if (b.dataset.prof === 'editar') { abrirProfesor(u); return; }
    confirmar('Nueva contraseña', 'Se generará una contraseña temporal para ' + u.nombre + '. La anterior dejará de funcionar.', '', async () => {
      const r = await api('adminUsuarioGuardar', { nuevaClave: true, usuario: u });
      mostrarAcceso(u.usuario, r.claveTemporal, u.nombre);
    });
  });
  function mostrarAcceso(usuario, clave, nombre) {
    $('tmp-texto').textContent = 'Hola ' + String(nombre || '').split(' ')[0] + ', estos son tus datos para el panel de exámenes:\n\n' +
      'Página: ' + new URL('admin.html', location.href).href + '\nUsuario: ' + usuario + '\nContraseña temporal: ' + clave + '\n\nAl entrar, cámbiala en «Cambiar contraseña».';
    $('m-temporal').hidden = false;
  }
  $('btn-tmp-copiar').addEventListener('click', () => {
    navigator.clipboard.writeText($('tmp-texto').textContent).then(() => avisar('Copiado', 'ok')).catch(() => avisar('Selecciona el texto y cópialo', 'peligro'));
  });

  // ───────────── Cambiar contraseña ─────────────
  $('btn-clave').addEventListener('click', () => { $('form-clave').reset(); $('msg-clave').innerHTML = ''; $('m-clave').hidden = false; });
  $('form-clave').addEventListener('submit', async (e) => {
    e.preventDefault();
    if ($('cl-nueva').value !== $('cl-nueva2').value) { $('msg-clave').innerHTML = '<div class="mensaje error">Las contraseñas nuevas no coinciden.</div>'; return; }
    const btn = $('btn-clave-ok');
    cargando(btn, true);
    try {
      await api('cambiarClave', { actual: $('cl-actual').value, nueva: $('cl-nueva').value });
      cerrarModal('m-clave');
      avisar('Contraseña cambiada', 'ok');
    } catch (err) {
      $('msg-clave').innerHTML = '<div class="mensaje error">' + esc(err.message) + '</div>';
    } finally { cargando(btn, false); }
  });

  async function vistaPrevia(id) {
    abrirCajon('Vista previa', 'Así se ve el examen; las respuestas correctas están marcadas en verde (el alumno no las ve).');
    try {
      const d = await api('adminVistaPrevia', { examen_id: id });
      $('caj-titulo').textContent = d.examen.titulo;
      let n = 0, html = '';
      d.grupos.forEach((g) => {
        html += '<div class="titulo-grupo">' + esc(g.seccion) + '</div><div class="item-rev"><b>' + esc(g.grupo) + '</b> <span class="suave pequeno">(' + g.puntos + ' pts)</span></div>';
        g.items.forEach((it) => {
          n++;
          let resp = '';
          if (it.tipo === 'opcion') {
            resp = '<div class="opciones" style="margin-top:8px">' + it.opciones.map((o) => '<div class="opcion ' + (o.id === it.respuesta.trim().toUpperCase() ? 'correcta-prev' : '') + '"><span class="letra">' + o.id + '</span><span>' + formato(o.texto) + '</span></div>').join('') + '</div>';
          } else {
            resp = '<div class="resp" style="grid-template-columns:1fr"><div><b>' + (it.tipo === 'abierta' || it.tipo === 'codigo' ? 'Guía para calificar' : 'Respuesta · tipo ' + it.tipo) + '</b>' + (it.tipo === 'codigo' ? bloqueCodigo(it.respuesta) : esc(it.respuesta)) + '</div></div>';
          }
          html += '<div class="item-rev"><div class="top"><div class="enun"><b>' + n + '. ' + esc(it.inciso) + '</b> ' + formato(it.enunciado) + '</div><div class="pequeno suave">' + it.puntos + (it.puntos === 1 ? ' pt' : ' pts') + '</div></div>' +
            (it.imagen ? '<img src="' + esc(it.imagen) + '" style="max-width:100%;margin-top:8px">' : '') + resp + '</div>';
        });
      });
      $('caj-cuerpo').innerHTML = html;
      renderMate($('caj-cuerpo'));
      $('caj-pie').innerHTML = '<span class="suave">' + n + ' preguntas · ' + d.examen.duracion_min + ' minutos</span>';
    } catch (err) {
      $('caj-cuerpo').innerHTML = '<div class="mensaje error">' + esc(err.message) + '</div>';
    }
  }

  // ───────────── Para editor.js y analisis.js ─────────────
  window.Panel = {
    A, api, refrescar, abrirCajon, cerrarCajon, confirmar, cerrarModal, vistaPrevia, textoRespuesta, fmt,
    probarComoAlumno(id) {
      try { localStorage.setItem('examenSeguro.admin.prueba', A.token); } catch (e) { /* */ }
      window.open('index.html?prueba=' + encodeURIComponent(id), '_blank');
    },
    abrirDetalle,
    mostrarPanel() { $('v-editor').hidden = true; $('v-panel').hidden = false; window.scrollTo(0, 0); },
    mostrarEditor() { $('v-panel').hidden = true; $('v-editor').hidden = false; window.scrollTo(0, 0); }
  };

  // ───────────── Inicio ─────────────
  A.token = sessionStorage.getItem(CLAVE_TOKEN) || '';
  try { $('in-usuario').value = localStorage.getItem('examenSeguro.usuario') || ''; } catch (e) { /* */ }
  if (A.token) entrar(); else setTimeout(() => ($('in-usuario').value ? $('in-clave') : $('in-usuario')).focus(), 50);
})();
