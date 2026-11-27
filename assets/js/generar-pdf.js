/*
 * Genera PDF reales (sin la ventana de imprimir) del «examen evaluado» de cada alumno
 * y los guarda en la carpeta que elija el docente.
 *
 * Cómo funciona: cada página se arma en HTML (con las fórmulas de KaTeX), se convierte en imagen
 * dentro del navegador y se agrega a un PDF tamaño carta con pdf-lib. Todo ocurre en el equipo del docente.
 */
(function () {
  'use strict';
  const { esc, renderMate, latex, leerNumero, leerConjunto, fechaHora } = window.Comun;

  const ANCHO = 816, ALTO = 1056, MARGEN = 44, PIE = 26, ESCALA = 2; // carta a 96 ppp
  const TIPOS_EXAMEN = { ADMISION: 'Examen de admisión', PERIODO_1: 'Primer periodo', PERIODO_2: 'Segundo periodo', PERIODO_3: 'Tercer periodo', SEMESTRAL: 'Examen semestral', OTRO: '' };

  const CSS = `
.rp-pagina { box-sizing: border-box; width: ${ANCHO}px; height: ${ALTO}px; padding: ${MARGEN}px ${MARGEN}px 0; background: #fff; color: #1f2a3c;
  font-family: "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif; font-size: 13px; line-height: 1.45; position: relative; overflow: hidden; }
.rp-pagina * { box-sizing: border-box; }
.rp-bloque { padding-bottom: 10px; }
.rp-cab { display: flex; gap: 18px; align-items: center; border-bottom: 3px solid #c8102e; padding-bottom: 10px; }
.rp-cab img { height: 60px; width: auto; }
.rp-esc { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: #1b3260; }
.rp-cab h1 { font-family: Georgia, "Times New Roman", serif; font-weight: 400; color: #1b3260; font-size: 23px; margin: 2px 0; line-height: 1.2; }
.rp-sub { font-size: 11.5px; color: #5d6b82; }
.rp-etiqueta { margin-left: auto; align-self: flex-start; background: #1b3260; color: #fff; font-size: 10.5px; font-weight: 600; letter-spacing: .04em; padding: 5px 9px; border-radius: 4px; text-align: center; max-width: 190px; }
.rp-alumno { display: flex; justify-content: space-between; gap: 16px; align-items: stretch; margin-top: 12px; }
.rp-et { font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; color: #5d6b82; }
.rp-nombre { font-family: Georgia, serif; font-size: 20px; color: #1b3260; line-height: 1.2; }
.rp-datos { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 11.5px; color: #5d6b82; margin-top: 4px; }
.rp-cal { text-align: center; border: 2px solid #2e7d4f; border-radius: 8px; padding: 6px 16px; min-width: 150px; }
.rp-cal.mal { border-color: #b3261e; }
.rp-num { font-family: Georgia, serif; font-size: 34px; line-height: 1.05; color: #2e7d4f; }
.rp-cal.mal .rp-num { color: #b3261e; }
.rp-aporta { font-size: 10.5px; color: #1b3260; margin-top: 2px; }
.rp-ficha { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 14px; margin: 10px 0 0; padding: 8px 12px; background: #f6f8fa; border: 1px solid #dde3ea; border-radius: 6px; }
.rp-ficha div { min-width: 0; }
.rp-ficha dt { font-size: 9px; letter-spacing: .07em; text-transform: uppercase; color: #5d6b82; }
.rp-ficha dd { margin: 0; font-size: 12px; font-weight: 600; color: #1f2a3c; }
.rp-coment { background: #eef3fa; border-left: 4px solid #1b3260; padding: 8px 12px; margin-top: 10px; white-space: pre-wrap; }
.rp-aviso { background: #fbf1e4; padding: 6px 10px; margin-top: 8px; font-size: 11.5px; color: #6f4310; }
.rp-leyenda { margin-top: 10px; font-size: 10.5px; color: #7c889b; }
.rp-grupo { background: #e9eef3; color: #1b3260; font-weight: 600; font-size: 12px; padding: 6px 10px; border-radius: 4px; margin: 4px 0 8px; }
.rp-q { border: 1px solid #dde3ea; border-left: 4px solid #c3ccd8; border-radius: 6px; padding: 8px 12px; }
.rp-q.ok { border-left-color: #2e7d4f; } .rp-q.mal { border-left-color: #b3261e; } .rp-q.parcial { border-left-color: #c9822b; }
.rp-q-cab { display: flex; gap: 10px; align-items: flex-start; }
.rp-n { flex: none; min-width: 24px; height: 22px; border-radius: 5px; background: #1b3260; color: #fff; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; padding: 0 4px; }
.rp-enun { flex: 1; font-size: 13.5px; }
.rp-enun .katex { font-size: 1.08em; }
.rp-pts { flex: none; font-weight: 700; font-size: 12px; white-space: nowrap; }
.rp-pts.ok { color: #2e7d4f; } .rp-pts.mal { color: #b3261e; } .rp-pts.parcial { color: #c9822b; }
.rp-img { max-width: 320px; max-height: 170px; margin: 6px 0 0 34px; border: 1px solid #dde3ea; border-radius: 4px; }
.rp-falta-img { margin: 6px 0 0 34px; font-size: 11px; color: #7c889b; font-style: italic; }
.rp-ops { list-style: none; margin: 6px 0 0 34px; padding: 0; }
.rp-ops li { display: flex; align-items: center; gap: 8px; padding: 3px 8px; border-radius: 4px; margin-bottom: 2px; }
.rp-ops li.correcta { background: #e3f2e8; }
.rp-ops li.elegida-mal { background: #fbe9e7; }
.rp-letra { width: 20px; height: 20px; border-radius: 50%; border: 1.5px solid #c3ccd8; display: flex; align-items: center; justify-content: center; font-size: 10.5px; font-weight: 700; color: #5d6b82; flex: none; }
.rp-ops li.correcta .rp-letra { background: #2e7d4f; border-color: #2e7d4f; color: #fff; }
.rp-ops li.elegida-mal .rp-letra { background: #b3261e; border-color: #b3261e; color: #fff; }
.rp-tag { margin-left: auto; font-size: 10.5px; font-weight: 700; white-space: nowrap; }
.rp-tag.ok { color: #2e7d4f; } .rp-tag.mal { color: #b3261e; }
.rp-resp { margin: 6px 0 0 34px; display: flex; flex-wrap: wrap; gap: 6px 22px; font-size: 12.5px; }
.rp-resp b { font-weight: 600; color: #5d6b82; margin-right: 4px; }
.rp-resp .ok { color: #2e7d4f; font-weight: 600; } .rp-resp .mal { color: #b3261e; font-weight: 600; }
.rp-abierta { margin: 6px 0 0 34px; border: 1px dashed #c3ccd8; border-radius: 4px; padding: 6px 10px; white-space: pre-wrap; font-size: 12.5px; }
.rp-suave { color: #7c889b; }
.rp-pie { position: absolute; left: ${MARGEN}px; right: ${MARGEN}px; bottom: 14px; display: flex; justify-content: space-between; font-size: 9.5px; color: #7c889b; border-top: 1px solid #dde3ea; padding-top: 5px; }
`;

  // ───────────── Recursos para incrustar (fuentes de fórmulas, logo, imágenes) ─────────────
  let recursosPromesa = null;
  function aDataURL(blob) {
    return new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = mal; r.readAsDataURL(blob); });
  }
  async function urlADataURL(url) {
    const r = await fetch(url, { mode: 'cors' });
    if (!r.ok) throw new Error('No se pudo cargar ' + url);
    return aDataURL(await r.blob());
  }
  function prepararRecursos() {
    if (!recursosPromesa) {
      recursosPromesa = (async () => {
        let css = await (await fetch('vendor/katex/katex.min.css')).text();
        const fuentes = Array.from(new Set((css.match(/fonts\/[A-Za-z0-9_-]+\.woff2/g) || [])));
        const datos = {};
        await Promise.all(fuentes.map(async (f) => { try { datos[f] = await urlADataURL('vendor/katex/' + f); } catch (e) { /* se queda sin esa fuente */ } }));
        css = css.replace(/src:url\((fonts\/[A-Za-z0-9_-]+\.woff2)\) format\("woff2"\)[^;}]*/g, (m, f) => (datos[f] ? 'src:url(' + datos[f] + ') format("woff2")' : m));
        const logo = await urlADataURL('assets/img/logo.png').catch(() => '');
        if (!document.getElementById('rp-css')) {
          const st = document.createElement('style'); st.id = 'rp-css'; st.textContent = CSS; document.head.appendChild(st);
        }
        return { css: css + CSS, logo, imagenes: {} };
      })();
    }
    return recursosPromesa;
  }
  async function imagenIncrustada(rec, url) {
    if (!url) return '';
    if (url in rec.imagenes) return rec.imagenes[url];
    try { rec.imagenes[url] = await urlADataURL(url); } catch (e) { rec.imagenes[url] = ''; }
    return rec.imagenes[url];
  }

  let pdfLibPromesa = null;
  function cargarPdfLib() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    if (!pdfLibPromesa) {
      pdfLibPromesa = new Promise((ok, mal) => {
        const s = document.createElement('script');
        s.src = 'vendor/pdf-lib/pdf-lib.min.js';
        s.onload = () => ok(window.PDFLib);
        s.onerror = () => mal(new Error('No se pudo cargar el generador de PDF.'));
        document.head.appendChild(s);
      });
    }
    return pdfLibPromesa;
  }

  // ───────────── Contenido del examen evaluado ─────────────
  function fechaCorta(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return iso || '';
    const [a, m, dd] = iso.split('-').map(Number);
    return new Date(a, m - 1, dd).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  const sinLetra = (t) => String(t || '').replace(/^[A-H]\)\s*/, '');
  const fmt = (n) => (Math.round(Number(n) * 10) / 10).toString();
  function respuestaBonita(tipo, v) {
    const t = String(v || '').trim();
    if (!t) return '<span class="rp-suave">Sin respuesta</span>';
    if (tipo === 'numerica') {
      const partes = t.split('|').map((s) => s.trim()).filter(Boolean).map((s) => leerNumero(s, true));
      if (partes.every(Boolean)) return partes.map((x) => latex(x.tex)).join(' o ');
    } else if (tipo === 'conjunto') {
      const c = leerConjunto(t);
      if (c) return latex(c.tex);
    }
    return esc(sinLetra(t));
  }

  async function bloquesReporte(d, r, rec, etiqueta) {
    const res = r.resultado;
    const aprobado = res.calificacion >= 6;
    const tipo = TIPOS_EXAMEN[d.examen.tipo_examen] || '';
    const dx = d.examen.datos || {};
    const valor = dx.valor_porcentaje !== '' && dx.valor_porcentaje != null ? Number(dx.valor_porcentaje) : null;
    const totalPts = r.items.reduce((s, it) => s + Number(it.puntos_max || 0), 0);
    const ficha = [
      ['Docente', dx.docente || d.profesor], ['Materia', dx.materia || d.examen.materia], ['Periodo', dx.periodo || tipo],
      ['Semestre', dx.semestre], ['Fecha de aplicación', fechaCorta(dx.fecha_aplicacion)], ['Grupo', r.alumno.grupo],
      ['Valor del examen', valor != null ? valor + '%' : ''], ['Valor de los reactivos', fmt(totalPts) + ' puntos'],
      ['Duración', dx.duracion_min ? dx.duracion_min + ' min' : '']
    ].filter((f) => f[1]);
    const bloques = [];
    bloques.push('<div class="rp-cab">' + (rec.logo ? '<img src="' + rec.logo + '" alt="">' : '') +
      '<div><div class="rp-esc">Colegio La Paz · Bachillerato</div><h1>' + esc(d.examen.titulo) + '</h1>' +
      '<div class="rp-sub">' + esc([dx.periodo || tipo, dx.semestre ? 'Semestre ' + dx.semestre : '', dx.materia || d.examen.materia].filter(Boolean).join(' · ')) + '</div></div>' +
      (etiqueta ? '<div class="rp-etiqueta">' + esc(etiqueta) + '</div>' : '') + '</div>' +
      '<div class="rp-alumno"><div><div class="rp-et">Alumno</div><div class="rp-nombre">' + esc(r.alumno.nombre + ' ' + r.alumno.apellidos) + '</div>' +
      '<div class="rp-datos">' +
      '<span>Presentado: ' + esc(fechaHora(r.enviado)) + '</span><span>Código: ' + esc(r.codigo) + '</span>' +
      (r.alumno.escuela ? '<span>Escuela de procedencia: ' + esc(r.alumno.escuela) + '</span>' : '') + '</div></div>' +
      '<div class="rp-cal ' + (aprobado ? '' : 'mal') + '"><div class="rp-et">Calificación</div><div class="rp-num">' + res.calificacion.toFixed(1) + '</div>' +
      '<div class="rp-sub">' + fmt(res.puntos) + ' de ' + fmt(res.puntos_max) + ' puntos · ' + res.porcentaje + '%</div>' +
      (valor != null ? '<div class="rp-aporta">Aporta <b>' + fmt(res.calificacion / 10 * valor) + '%</b> de ' + fmt(valor) + '%</div>' : '') + '</div></div>' +
      '<dl class="rp-ficha">' + ficha.map((f) => '<div><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd></div>').join('') + '</dl>' +
      (res.comentario ? '<div class="rp-coment"><div class="rp-et">Comentario del profesor</div>' + esc(res.comentario) + '</div>' : '') +
      (res.estado === 'POR_REVISAR' ? '<div class="rp-aviso">Hay preguntas abiertas pendientes de calificar; la calificación puede cambiar.</div>' : '') +
      '<div class="rp-leyenda">✓ correcta · ✗ incorrecta · Las opciones se muestran en su orden original.</div>');
    let grupoAnt = null, n = 0;
    for (const it of r.items) {
      n++;
      const clave = it.seccion + '¦' + it.grupo;
      let h = '';
      if (clave !== grupoAnt) { grupoAnt = clave; h += '<div class="rp-grupo">' + esc([it.seccion, it.grupo].filter(Boolean).join(' — ')) + '</div>'; }
      const est = { CORRECTA: 'ok', INCORRECTA: 'mal', PARCIAL: 'parcial', POR_REVISAR: 'parcial', SIN_RESPUESTA: 'mal' }[it.resultado] || '';
      const marca = { ok: '✓', mal: '✗', parcial: '½' }[est] || '';
      h += '<div class="rp-q ' + est + '"><div class="rp-q-cab"><span class="rp-n">' + n + '</span><div class="rp-enun">' +
        (it.inciso ? '<b>' + esc(it.inciso) + '</b> ' : '') + esc(it.enunciado) + '</div><div class="rp-pts ' + est + '">' + marca + ' ' + fmt(it.puntos) + '/' + fmt(it.puntos_max) + '</div></div>';
      if (it.imagen_url) {
        const src = await imagenIncrustada(rec, it.imagen_url);
        h += src ? '<img class="rp-img" src="' + src + '" alt="">' : '<div class="rp-falta-img">(Esta pregunta tiene una figura; consúltala en el examen en línea.)</div>';
      }
      if (it.tipo === 'opcion' && it.opciones && it.opciones.length) {
        h += '<ul class="rp-ops">' + it.opciones.map((o, i) => {
          const l = String.fromCharCode(65 + i);
          const correcta = l === it.letra_correcta, elegida = l === it.letra_alumno;
          const clase = correcta ? 'correcta' : (elegida ? 'elegida-mal' : '');
          const tag = elegida ? (correcta ? '<span class="rp-tag ok">Tu respuesta ✓</span>' : '<span class="rp-tag mal">Tu respuesta ✗</span>') : (correcta ? '<span class="rp-tag ok">Correcta</span>' : '');
          return '<li class="' + clase + '"><span class="rp-letra">' + l.toLowerCase() + '</span><span>' + esc(o) + '</span>' + tag + '</li>';
        }).join('') + (it.letra_alumno ? '' : '<li><span class="rp-suave">No contestó esta pregunta.</span></li>') + '</ul>';
      } else if (it.tipo === 'abierta') {
        h += '<div class="rp-abierta">' + (it.respuesta_alumno ? esc(it.respuesta_alumno) : '<span class="rp-suave">Sin respuesta</span>') + '</div>';
      } else {
        const bien = it.resultado === 'CORRECTA';
        h += '<div class="rp-resp"><span><b>Tu respuesta:</b><span class="' + (bien ? 'ok' : 'mal') + '">' + respuestaBonita(it.tipo, it.respuesta_alumno) + '</span></span>' +
          (bien ? '' : '<span><b>Respuesta correcta:</b><span class="ok">' + respuestaBonita(it.tipo, it.respuesta_correcta) + '</span></span>') + '</div>';
      }
      bloques.push(h + '</div>');
    }
    return bloques;
  }

  // ───────────── Paginación y conversión ─────────────
  function paginar(bloques) {
    const medidor = document.createElement('div');
    medidor.className = 'rp-pagina';
    medidor.style.cssText = 'position:absolute;left:-20000px;top:0;height:auto;overflow:visible;';
    document.body.appendChild(medidor);
    medidor.innerHTML = bloques.map((b) => '<div class="rp-bloque">' + b + '</div>').join('');
    renderMate(medidor);
    const disponible = ALTO - MARGEN - PIE - 14;
    const paginas = [];
    let actual = [], usado = 0;
    Array.from(medidor.children).forEach((el) => {
      const alto = el.getBoundingClientRect().height;
      if (actual.length && usado + alto > disponible) { paginas.push(actual); actual = []; usado = 0; }
      actual.push(el.outerHTML);
      usado += alto;
    });
    if (actual.length) paginas.push(actual);
    medidor.remove();
    return paginas;
  }

  async function paginaAJpeg(rec, html) {
    const cont = document.createElement('div');
    cont.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    const st = document.createElement('style');
    st.textContent = rec.css;
    cont.appendChild(st);
    const pag = document.createElement('div');
    pag.className = 'rp-pagina';
    pag.innerHTML = html;
    cont.appendChild(pag);
    const xhtml = new XMLSerializer().serializeToString(cont);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + ANCHO + '" height="' + ALTO + '"><foreignObject x="0" y="0" width="100%" height="100%">' + xhtml + '</foreignObject></svg>';
    const img = new Image();
    await new Promise((ok, mal) => {
      img.onload = ok;
      img.onerror = () => mal(new Error('No se pudo dibujar una página del PDF.'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
    if (img.decode) { try { await img.decode(); } catch (e) { /* ya cargó */ } }
    const c = document.createElement('canvas');
    c.width = ANCHO * ESCALA; c.height = ALTO * ESCALA;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const datos = c.toDataURL('image/jpeg', 0.9);
    return Uint8Array.from(atob(datos.split(',')[1]), (ch) => ch.charCodeAt(0));
  }

  /** PDF del examen evaluado de un alumno. d = respuesta de examenReportes; r = un reporte. */
  async function examenEvaluado(d, r, etiqueta) {
    const rec = await prepararRecursos();
    const PDFLib = await cargarPdfLib();
    const paginas = paginar(await bloquesReporte(d, r, rec, etiqueta));
    const doc = await PDFLib.PDFDocument.create();
    doc.setTitle('Examen evaluado · ' + r.alumno.nombre + ' ' + r.alumno.apellidos + ' · ' + d.examen.titulo);
    doc.setAuthor('Colegio La Paz');
    doc.setCreator('Exámenes en línea · Colegio La Paz');
    const nombre = r.alumno.nombre + ' ' + r.alumno.apellidos;
    const dxp = d.examen.datos || {};
    const pieIzq = [nombre, d.examen.titulo, dxp.semestre ? 'Semestre ' + dxp.semestre : ''].filter(Boolean).join(' · ');
    for (let i = 0; i < paginas.length; i++) {
      const pie = '<div class="rp-pie"><span>' + esc(pieIzq) + '</span><span>Página ' + (i + 1) + ' de ' + paginas.length + '</span></div>';
      const jpg = await doc.embedJpg(await paginaAJpeg(rec, paginas[i].join('') + pie));
      const p = doc.addPage([612, 792]);
      p.drawImage(jpg, { x: 0, y: 0, width: 612, height: 792 });
    }
    return doc.save();
  }

  // ───────────── Guardar ─────────────
  const nombreArchivo = (t) => String(t).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);

  function descargar(bytes, nombre) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    a.download = nombreArchivo(nombre).replace(/\.pdf$/i, '') + '.pdf';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  /** Pide al docente una carpeta de su computadora (Chrome/Edge). Devuelve null si el navegador no lo permite. */
  async function elegirCarpeta() {
    if (!window.showDirectoryPicker) return null;
    return window.showDirectoryPicker({ id: 'examenes-clp', mode: 'readwrite', startIn: 'documents' });
  }

  async function guardarEn(carpeta, subcarpeta, nombre, bytes) {
    if (!carpeta) { descargar(bytes, nombre); return; }
    let dir = carpeta;
    if (subcarpeta) dir = await carpeta.getDirectoryHandle(nombreArchivo(subcarpeta), { create: true });
    const fh = await dir.getFileHandle(nombreArchivo(nombre).replace(/\.pdf$/i, '') + '.pdf', { create: true });
    const w = await fh.createWritable();
    await w.write(new Blob([bytes], { type: 'application/pdf' }));
    await w.close();
  }

  window.GenPDF = { examenEvaluado, descargar, elegirCarpeta, guardarEn, nombreArchivo, TIPOS_EXAMEN };
})();
