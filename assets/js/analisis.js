/* Análisis de resultados por pregunta y por alumno + reportes PDF para enviar a cada alumno. */
(function () {
  'use strict';
  const { esc, formato, bloqueCodigo, renderMate, latex, leerNumero, leerConjunto, avisar, cargando, fechaHora } = window.Comun;
  const P = () => window.Panel;
  const $ = (id) => document.getElementById(id);
  const sinLetra = (t) => String(t || '').replace(/^[A-H]\)\s*/, '');
  const color = (pct) => (pct < 40 ? 'malo' : pct < 70 ? 'regular' : 'bueno');

  // ───────────── Análisis ─────────────
  async function abrir(examenId, grupo) {
    if (!examenId) return;
    P().abrirCajon('Análisis', 'Cargando…');
    $('cajon').classList.add('ancho');
    try {
      const d = await P().api('examenAnalisis', { examen_id: examenId, grupo: grupo || '' });
      pintar(d, 'numero');
    } catch (err) {
      $('caj-cuerpo').innerHTML = '<div class="mensaje error">' + esc(err.message) + '</div>';
    }
  }
  // Quitar el ancho al cerrar
  new MutationObserver(() => { if ($('cajon').hidden) $('cajon').classList.remove('ancho'); }).observe($('cajon'), { attributes: true, attributeFilter: ['hidden'] });

  function pintar(d, orden) {
    const r = d.resumen;
    $('caj-titulo').textContent = 'Análisis · ' + d.examen.titulo + (d.grupo ? ' · ' + d.grupo : '');
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
      h += '<details class="an-preg"><summary><span class="num">' + q.n + '</span><span class="an-enun">' + (q.inciso ? '<b>' + esc(q.inciso) + '</b> ' : '') + formato(q.enunciado) + '</span>' +
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
      '<div style="display:flex;gap:8px"><button class="btn secundario" id="an-evid">📁 Evidencias</button><button class="btn" id="an-pdfs">📄 PDF de cada alumno</button></div>';
    $('an-pdfs').addEventListener('click', () => pdf(d.examen.examen_id, null, $('an-pdfs'), d.grupo));
    $('an-evid').addEventListener('click', () => abrirEvidencias(d.examen.examen_id));
  }

  function detallePregunta(q) {
    let h = '<div class="an-enun-completo">' + formato(q.enunciado) + '</div>';
    if (q.tipo === 'opcion') {
      const correcta = String(q.respuesta).charAt(0);
      const total = q.total || 1;
      h += '<div class="an-dist">' + q.opciones.map((o, i) => {
        const l = String.fromCharCode(65 + i);
        const nVotos = q.distribucion[l] || 0;
        const pct = Math.round((nVotos / total) * 100);
        return '<div class="an-op' + (l === correcta ? ' correcta' : '') + '"><span class="an-op-txt">' + (l === correcta ? '✓ ' : '') + formato(o) + '</span>' +
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
      if (q.tipo === 'abierta' || q.tipo === 'codigo') h += '<div class="pequeno suave">Promedio: ' + q.promedio_puntos + ' de ' + q.puntos + ' puntos.</div>';
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

  // ───────────── PDF del examen evaluado (archivos reales) ─────────────
  /**
   * codigos = [uno]   → descarga el PDF de ese alumno.
   * codigos = null    → pide una carpeta y guarda un PDF por alumno (del grupo indicado o de todos).
   * Importante: se llama directo desde el clic, para que el navegador permita abrir el selector de carpeta.
   */
  async function pdf(examenId, codigos, boton, grupo) {
    if (!examenId) return;
    const uno = codigos && codigos.length === 1;
    let carpeta = null;
    if (!uno) {
      try { carpeta = await window.GenPDF.elegirCarpeta(); } catch (e) { return; } // canceló
    }
    if (boton) cargando(boton, true, uno ? '' : 'Generando…');
    try {
      const d = await P().api('examenReportes', { examen_id: examenId, codigos: codigos || [], grupo: grupo || '' }, { espera: 90000 });
      if (!d.reportes.length) { avisar('No hay exámenes enviados para generar el PDF.', 'peligro'); return; }
      if (uno) {
        const r = d.reportes[0];
        const bytes = await window.GenPDF.examenEvaluado(d, r);
        window.GenPDF.descargar(bytes, 'Examen evaluado - ' + r.alumno.apellidos + ' ' + r.alumno.nombre + ' - ' + d.examen.titulo);
        avisar('PDF listo: ' + r.alumno.nombre + ' ' + r.alumno.apellidos, 'ok');
        return;
      }
      let i = 0;
      for (const r of d.reportes) {
        i++;
        avisar('Generando PDF ' + i + ' de ' + d.reportes.length + '…', '', 60000);
        const bytes = await window.GenPDF.examenEvaluado(d, r);
        await window.GenPDF.guardarEn(carpeta, d.examen.titulo + (r.alumno.grupo ? ' - ' + r.alumno.grupo : ''),
          r.alumno.apellidos + ' ' + r.alumno.nombre + ' (' + r.resultado.calificacion.toFixed(1) + ')', bytes);
      }
      avisar(carpeta ? 'Listo: ' + d.reportes.length + ' PDF guardados en «' + carpeta.name + '», una subcarpeta por grupo.' : 'Listo: se descargaron ' + d.reportes.length + ' PDF.', 'ok', 8000);
    } catch (err) {
      avisar(err.message, 'peligro', 7000);
    } finally { if (boton) cargando(boton, false); }
  }

  // ───────────── Evidencias: calificación más alta, media y más baja por grupo ─────────────
  function elegirEvidencias(lista) {
    const ord = lista.slice().sort((a, b) => b.calificacion - a.calificacion || (a.apellidos + a.nombre).localeCompare(b.apellidos + b.nombre, 'es'));
    if (!ord.length) return [];
    const alta = ord[0], baja = ord[ord.length - 1];
    const prom = ord.reduce((s, r) => s + r.calificacion, 0) / ord.length;
    const candidatos = ord.length > 2 ? ord.slice(1, -1) : ord;
    const media = candidatos.slice().sort((a, b) => Math.abs(a.calificacion - prom) - Math.abs(b.calificacion - prom))[0];
    const sel = [{ tipo: 'alta', r: alta, titulo: 'Calificación más alta' }];
    if (ord.length > 2) sel.push({ tipo: 'media', r: media, titulo: 'Calificación media' });
    if (ord.length > 1) sel.push({ tipo: 'baja', r: baja, titulo: 'Calificación más baja' });
    sel.promedio = prom;
    return sel;
  }

  function abrirEvidencias(examenId) {
    const A = P().A;
    const conRes = A.datos.examenes.filter((x) => A.datos.resultados.some((r) => r.examen_id === x.examen_id));
    if (!conRes.length) { avisar('Todavía no hay exámenes con resultados.', 'peligro'); return; }
    const sel = $('ev-examen');
    sel.innerHTML = conRes.map((x) => '<option value="' + esc(x.examen_id) + '">' + esc(x.titulo) + '</option>').join('');
    sel.value = examenId && conRes.some((x) => x.examen_id === examenId) ? examenId : conRes[0].examen_id;
    $('msg-ev').innerHTML = '';
    $('ev-aviso-nav').hidden = !!window.showDirectoryPicker;
    pintarEvidencias();
    $('m-evid').hidden = false;
  }

  function gruposDe(examenId) {
    const res = P().A.datos.resultados.filter((r) => r.examen_id === examenId);
    const g = {};
    res.forEach((r) => { (g[r.grupo || 'Sin grupo'] = g[r.grupo || 'Sin grupo'] || []).push(r); });
    return g;
  }

  function pintarEvidencias() {
    const g = gruposDe($('ev-examen').value);
    const nombres = Object.keys(g).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
    $('ev-grupos').innerHTML = nombres.map((n) => {
      const ev = elegirEvidencias(g[n]);
      return '<label class="ev-grupo"><input type="checkbox" data-ev-grupo="' + esc(n) + '" checked>' +
        '<div><b>' + esc(n) + '</b> <span class="suave pequeno">· ' + g[n].length + ' alumno' + (g[n].length === 1 ? '' : 's') + ' · promedio ' + ev.promedio.toFixed(1) + '</span>' +
        '<div class="ev-sel">' + ev.map((e) => '<span class="ev-' + e.tipo + '">' + e.titulo.replace('Calificación ', '') + ': <b>' + esc(e.r.nombre + ' ' + e.r.apellidos) + '</b> (' + e.r.calificacion.toFixed(1) + ')</span>').join('') + '</div>' +
        (g[n].length < 3 ? '<div class="pequeno texto-aviso">Con menos de 3 alumnos no hay calificación media distinta.</div>' : '') + '</div></label>';
    }).join('');
  }
  $('ev-examen').addEventListener('change', pintarEvidencias);

  $('ev-ok').addEventListener('click', async () => {
    const examenId = $('ev-examen').value;
    const grupos = Array.from($('ev-grupos').querySelectorAll('[data-ev-grupo]:checked')).map((x) => x.dataset.evGrupo);
    if (!grupos.length) { $('msg-ev').innerHTML = '<div class="mensaje error">Elige al menos un grupo.</div>'; return; }
    let carpeta = null;
    try { carpeta = await window.GenPDF.elegirCarpeta(); } catch (e) { return; } // canceló el selector
    const btn = $('ev-ok');
    cargando(btn, true, 'Generando…');
    $('msg-ev').innerHTML = '';
    try {
      const g = gruposDe(examenId);
      const plan = [];
      grupos.forEach((n) => elegirEvidencias(g[n]).forEach((e) => plan.push({ grupo: n, e })));
      const d = await P().api('examenReportes', { examen_id: examenId, codigos: Array.from(new Set(plan.map((x) => x.e.r.codigo))) }, { espera: 90000 });
      const porCodigo = {};
      d.reportes.forEach((r) => { porCodigo[r.codigo] = r; });
      let i = 0;
      const orden = { alta: '1', media: '2', baja: '3' };
      for (const x of plan) {
        i++;
        $('msg-ev').innerHTML = '<div class="mensaje info">Generando ' + i + ' de ' + plan.length + '…</div>';
        const r = porCodigo[x.e.r.codigo];
        if (!r) continue;
        const bytes = await window.GenPDF.examenEvaluado(d, r, 'Evidencia · ' + x.e.titulo + ' del grupo ' + x.grupo);
        await window.GenPDF.guardarEn(carpeta, 'Evidencias - ' + d.examen.titulo + ' - ' + x.grupo,
          orden[x.e.tipo] + ' ' + x.e.titulo + ' - ' + r.alumno.apellidos + ' ' + r.alumno.nombre + ' (' + r.resultado.calificacion.toFixed(1) + ')', bytes);
      }
      $('msg-ev').innerHTML = '<div class="mensaje info">✓ Listo: ' + plan.length + ' PDF ' + (carpeta ? 'guardados en «' + esc(carpeta.name) + '», en una subcarpeta «Evidencias…» por grupo.' : 'descargados.') + '</div>';
      avisar('Evidencias guardadas ✓', 'ok');
    } catch (err) {
      $('msg-ev').innerHTML = '<div class="mensaje error">' + esc(err.message) + '</div>';
    } finally { cargando(btn, false); }
  });

  window.Analisis = { abrir, pdf, evidencias: abrirEvidencias, elegirEvidencias };
})();
