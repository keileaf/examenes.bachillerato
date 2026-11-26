/* Análisis de resultados por pregunta y por alumno + reportes PDF para enviar a cada alumno. */
(function () {
  'use strict';
  const { esc, renderMate, latex, leerNumero, leerConjunto, avisar, cargando, fechaHora } = window.Comun;
  const P = () => window.Panel;
  const $ = (id) => document.getElementById(id);
  const sinLetra = (t) => String(t || '').replace(/^[A-H]\)\s*/, '');
  const color = (pct) => (pct < 40 ? 'malo' : pct < 70 ? 'regular' : 'bueno');

  // ───────────── Análisis ─────────────
  async function abrir(examenId) {
    if (!examenId) return;
    P().abrirCajon('Análisis', 'Cargando…');
    $('cajon').classList.add('ancho');
    try {
      const d = await P().api('examenAnalisis', { examen_id: examenId });
      pintar(d, 'numero');
    } catch (err) {
      $('caj-cuerpo').innerHTML = '<div class="mensaje error">' + esc(err.message) + '</div>';
    }
  }
  // Quitar el ancho al cerrar
  new MutationObserver(() => { if ($('cajon').hidden) $('cajon').classList.remove('ancho'); }).observe($('cajon'), { attributes: true, attributeFilter: ['hidden'] });

  function pintar(d, orden) {
    const r = d.resumen;
    $('caj-titulo').textContent = 'Análisis · ' + d.examen.titulo;
    $('caj-sub').textContent = r.aplicados + ' alumno' + (r.aplicados === 1 ? '' : 's') + ' · ' + d.preguntas.length + ' preguntas' + (r.por_revisar ? ' · ' + r.por_revisar + ' con preguntas abiertas por calificar' : '');
    if (!r.aplicados) { $('caj-cuerpo').innerHTML = '<p class="suave">Todavía nadie ha enviado este examen.</p>'; $('caj-pie').innerHTML = ''; return; }
    let h = '<div class="kpis compactos">' + [
      [r.promedio.toFixed(1), 'Promedio del grupo'], [r.maxima.toFixed(1), 'Calificación más alta'], [r.minima.toFixed(1), 'Calificación más baja'],
      [r.aprobados + ' de ' + r.aplicados, 'Aprobados (6 o más)']
    ].map((k) => '<div class="kpi"><div class="n">' + k[0] + '</div><div class="l">' + k[1] + '</div></div>').join('') + '</div>';

    const lista = d.preguntas.slice();
    if (orden === 'falladas') lista.sort((a, b) => a.pct_aciertos - b.pct_aciertos || a.n - b.n);
    h += '<div class="an-cab"><h3>Aciertos por pregunta</h3><div class="segmentado">' +
      '<button data-orden="numero" class="' + (orden === 'numero' ? 'activo' : '') + '">En orden</button>' +
      '<button data-orden="falladas" class="' + (orden === 'falladas' ? 'activo' : '') + '">Más falladas primero</button></div></div>' +
      '<p class="pequeno suave">Haz clic en una pregunta para ver qué contestaron los alumnos.</p><div class="an-preguntas">';
    lista.forEach((q) => {
      h += '<details class="an-preg"><summary><span class="num">' + q.n + '</span><span class="an-enun">' + (q.inciso ? '<b>' + esc(q.inciso) + '</b> ' : '') + esc(q.enunciado) + '</span>' +
        '<span class="an-barra"><i class="' + color(q.pct_aciertos) + '" style="width:' + Math.max(2, q.pct_aciertos) + '%"></i></span>' +
        '<span class="an-pct ' + color(q.pct_aciertos) + '">' + q.pct_aciertos + '%</span><span class="pequeno suave an-cuenta">' + q.correctas + '/' + q.total + '</span></summary>' +
        '<div class="an-detalle">' + detallePregunta(q) + '</div></details>';
    });
    h += '</div>';

    // Matriz alumno × pregunta
    h += '<div class="an-cab"><h3>Por alumno</h3><span class="pequeno suave">✓ correcta · ✗ incorrecta · ½ parcial · ? por calificar · – sin respuesta</span></div>' +
      '<div class="tabla-env matriz-env"><table class="matriz"><thead><tr><th class="fijo">Alumno</th><th>Cal.</th>' +
      d.preguntas.map((q) => '<th title="' + esc(q.inciso || '') + '">' + q.n + '</th>').join('') + '<th></th></tr></thead><tbody>';
    d.alumnos.forEach((a) => {
      h += '<tr><td class="fijo"><b>' + esc(a.nombre) + '</b></td><td class="cal">' + a.calificacion.toFixed(1) + '</td>' +
        d.preguntas.map((q) => {
          const x = a.por_pregunta[q.pregunta_id];
          const r = x ? x.r : 'SIN_RESPUESTA';
          const s = { CORRECTA: ['✓', 'ok'], INCORRECTA: ['✗', 'mal'], PARCIAL: ['½', 'parcial'], POR_REVISAR: ['?', 'revisar'], SIN_RESPUESTA: ['–', 'vacia'] }[r] || ['', ''];
          return '<td class="c ' + s[1] + '" title="Pregunta ' + q.n + ': ' + (x ? x.p : 0) + ' de ' + q.puntos + ' pts">' + s[0] + '</td>';
        }).join('') + '<td class="nowrap"><button class="btn secundario chico" data-an-pdf="' + esc(a.codigo) + '">PDF</button></td></tr>';
    });
    h += '</tbody></table></div>';
    $('caj-cuerpo').innerHTML = h;
    $('caj-cuerpo').querySelectorAll('.an-enun, .an-detalle').forEach(renderMate);
    $('caj-cuerpo').querySelectorAll('[data-orden]').forEach((b) => b.addEventListener('click', () => pintar(d, b.dataset.orden)));
    $('caj-cuerpo').querySelectorAll('[data-an-pdf]').forEach((b) => b.addEventListener('click', () => pdf(d.examen.examen_id, [b.dataset.anPdf], b)));
    $('caj-pie').innerHTML = '<span class="suave pequeno">Las preguntas con menos de 40% de aciertos son buenas candidatas para repasar en clase.</span>' +
      '<button class="btn" id="an-pdfs">📄 PDF de todos los alumnos</button>';
    $('an-pdfs').addEventListener('click', () => pdf(d.examen.examen_id, null, $('an-pdfs')));
  }

  function detallePregunta(q) {
    let h = '<div class="an-enun-completo">' + esc(q.enunciado) + '</div>';
    if (q.tipo === 'opcion') {
      const correcta = String(q.respuesta).charAt(0);
      const total = q.total || 1;
      h += '<div class="an-dist">' + q.opciones.map((o, i) => {
        const l = String.fromCharCode(65 + i);
        const nVotos = q.distribucion[l] || 0;
        const pct = Math.round((nVotos / total) * 100);
        return '<div class="an-op' + (l === correcta ? ' correcta' : '') + '"><span class="an-op-txt">' + (l === correcta ? '✓ ' : '') + esc(o) + '</span>' +
          '<span class="an-barra"><i class="' + (l === correcta ? 'bueno' : 'malo') + '" style="width:' + Math.max(1, pct) + '%"></i></span><span class="pequeno">' + nVotos + ' (' + pct + '%)</span></div>';
      }).join('') + '</div>';
      const masElegida = Object.keys(q.distribucion).sort((a, b) => q.distribucion[b] - q.distribucion[a])[0];
      if (masElegida && masElegida !== correcta && q.distribucion[masElegida] >= 2) {
        h += '<div class="mensaje aviso pequeno">La opción incorrecta más elegida fue «' + esc(q.opciones[masElegida.charCodeAt(0) - 65] || masElegida) + '»: puede indicar una confusión común.</div>';
      }
    } else {
      h += '<div class="pequeno"><b>Respuesta correcta:</b> ' + respuestaBonita(q.tipo, q.respuesta) + '</div>';
      if (q.errores_comunes.length) {
        h += '<div class="pequeno" style="margin-top:6px"><b>Respuestas incorrectas más comunes:</b> ' +
          q.errores_comunes.map((e) => '<span class="chip-err">' + respuestaBonita(q.tipo, e.respuesta) + ' <span class="suave">×' + e.veces + '</span></span>').join(' ') + '</div>';
      }
      if (q.tipo === 'abierta') h += '<div class="pequeno suave">Promedio: ' + q.promedio_puntos + ' de ' + q.puntos + ' puntos.</div>';
    }
    if (q.sin_respuesta) h += '<div class="pequeno suave" style="margin-top:6px">' + q.sin_respuesta + ' alumno(s) la dejaron sin contestar.</div>';
    return h;
  }

  function respuestaBonita(tipo, v) {
    const t = String(v || '').trim();
    if (!t) return '<span class="suave">—</span>';
    if (tipo === 'numerica') {
      const partes = t.split('|').map((s) => s.trim()).filter(Boolean).map((s) => leerNumero(s, true));
      if (partes.every(Boolean)) return partes.map((x) => latex(x.tex)).join(' o ');
    } else if (tipo === 'conjunto') {
      const c = leerConjunto(t);
      if (c) return latex(c.tex);
    }
    return esc(sinLetra(t));
  }

  // ───────────── Reportes PDF ─────────────
  async function pdf(examenId, codigos, boton) {
    if (!examenId) return;
    if (boton) cargando(boton, true);
    try {
      const d = await P().api('examenReportes', { examen_id: examenId, codigos: codigos || [] }, { espera: 60000 });
      if (!d.reportes.length) { avisar('No hay exámenes enviados para generar el PDF.', 'peligro'); return; }
      const zona = $('zona-impresion');
      zona.innerHTML = d.reportes.map((r) => htmlReporte(d, r)).join('');
      renderMate(zona);
      await esperarImagenes(zona);
      const tituloAnterior = document.title;
      const uno = d.reportes.length === 1;
      document.title = limpiarNombre(uno
        ? 'Resultados - ' + d.reportes[0].alumno.apellidos + ' ' + d.reportes[0].alumno.nombre + ' - ' + d.examen.titulo
        : 'Resultados - ' + d.examen.titulo);
      const restaurar = () => { document.title = tituloAnterior; window.removeEventListener('afterprint', restaurar); };
      window.addEventListener('afterprint', restaurar);
      if (!uno) avisar('Se abrirá un solo PDF con una página por alumno. Para enviarlo por separado usa el botón «PDF» de cada alumno.', '', 6000);
      setTimeout(() => window.print(), uno ? 50 : 600);
    } catch (err) {
      avisar(err.message, 'peligro', 6000);
    } finally { if (boton) cargando(boton, false); }
  }

  const limpiarNombre = (t) => t.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);

  function esperarImagenes(el) {
    return Promise.all(Array.from(el.querySelectorAll('img')).map((img) => img.complete ? null : new Promise((ok) => { img.onload = img.onerror = ok; setTimeout(ok, 4000); })));
  }

  function htmlReporte(d, r) {
    const res = r.resultado;
    const aprobado = res.calificacion >= 6;
    let filas = '', grupo = null, n = 0;
    r.items.forEach((it) => {
      const clave = it.seccion + '¦' + it.grupo;
      if (clave !== grupo) {
        grupo = clave;
        filas += '<tr class="rep-grupo"><td colspan="5">' + esc([it.seccion, it.grupo].filter(Boolean).join(' — ')) + '</td></tr>';
      }
      n++;
      const marca = { CORRECTA: ['✓', 'ok'], INCORRECTA: ['✗', 'mal'], PARCIAL: ['½', 'parcial'], POR_REVISAR: ['…', 'parcial'], SIN_RESPUESTA: ['–', 'mal'] }[it.resultado] || ['', ''];
      const suya = it.respuesta_alumno ? (it.tipo === 'abierta' ? '<div class="pre">' + esc(it.respuesta_alumno) + '</div>' : respuestaBonita(it.tipo, it.respuesta_alumno)) : '<span class="suave">Sin respuesta</span>';
      const correcta = it.tipo === 'abierta' ? '<span class="suave">Calificada por el profesor</span>' : respuestaBonita(it.tipo, it.respuesta_correcta);
      filas += '<tr class="' + marca[1] + '"><td class="rep-n">' + n + '</td><td>' + (it.inciso ? '<b>' + esc(it.inciso) + '</b> ' : '') + esc(it.enunciado) +
        (it.imagen_url ? '<div><img src="' + esc(it.imagen_url) + '" class="rep-img" alt=""></div>' : '') + '</td><td>' + suya + '</td><td>' +
        (it.resultado === 'CORRECTA' ? '<span class="suave">—</span>' : correcta) + '</td>' +
        '<td class="rep-pts"><span class="rep-marca ' + marca[1] + '">' + marca[0] + '</span> ' + fmt(it.puntos) + '/' + fmt(it.puntos_max) + '</td></tr>';
    });
    return '<section class="reporte">' +
      '<header class="rep-cab"><img src="assets/img/logo.png" alt="Colegio La Paz"><div><div class="rep-esc">Colegio La Paz · Bachillerato</div>' +
      '<h1>' + esc(d.examen.titulo) + '</h1><div class="rep-sub">' + esc([d.examen.materia, d.examen.nivel, d.profesor ? 'Profesor(a): ' + d.profesor : ''].filter(Boolean).join(' · ')) + '</div></div></header>' +
      '<div class="rep-alumno"><div><div class="rep-et">Alumno</div><div class="rep-nombre">' + esc(r.alumno.nombre + ' ' + r.alumno.apellidos) + '</div>' +
      '<div class="rep-sub">Presentado el ' + esc(fechaHora(r.enviado)) + ' · Código ' + esc(r.codigo) + '</div></div>' +
      '<div class="rep-cal ' + (aprobado ? 'ok' : 'mal') + '"><div class="rep-et">Calificación</div><div class="rep-num">' + res.calificacion.toFixed(1) + '</div>' +
      '<div class="rep-sub">' + fmt(res.puntos) + ' de ' + fmt(res.puntos_max) + ' puntos · ' + res.porcentaje + '%</div></div></div>' +
      (res.comentario ? '<div class="rep-coment"><div class="rep-et">Comentario del profesor</div>' + esc(res.comentario) + '</div>' : '') +
      (res.estado === 'POR_REVISAR' ? '<div class="rep-aviso">Hay preguntas abiertas pendientes de calificar; la calificación puede cambiar.</div>' : '') +
      '<table class="rep-tabla"><thead><tr><th>#</th><th>Pregunta</th><th>Tu respuesta</th><th>Respuesta correcta</th><th>Puntos</th></tr></thead><tbody>' + filas + '</tbody></table>' +
      '<footer class="rep-pie">Reporte generado el ' + esc(new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })) + ' · Exámenes en línea · Colegio La Paz</footer>' +
      '</section>';
  }
  const fmt = (n) => (Math.round(Number(n) * 10) / 10).toString();

  window.Analisis = { abrir, pdf };
})();
