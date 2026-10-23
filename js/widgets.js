/* Widgets HTML que leen una Sim: contadores, gráfico en vivo y barra de disponibilidad. */
(function () {
  'use strict';

  const fmtLat = v => (v == null ? '—' : v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(1)} s`);

  const LABELS = {
    sent: 'Enviadas', ok: 'OK', slow: 'Lentas', err: 'Errores',
    p50: 'Latencia p50', p95: 'Latencia p95', p99: 'Latencia p99',
    errPct: '% error (5 s)', rps: 'Respuestas/s'
  };

  // Ejecuta fn cada `every` segundos de tiempo de simulación
  function throttle(sim, every, fn) {
    let last = -Infinity;
    sim.on('tick', now => { if (now - last >= every) { last = now; fn(); } });
    sim.on('reset', () => { last = -Infinity; fn(true); });
  }

  function stats(el, sim, fields, win = 5) {
    fields = fields || ['sent', 'ok', 'slow', 'err', 'p95', 'errPct'];
    el.innerHTML = fields
      .map(f => `<div class="stat s-${f}"><b data-f="${f}">0</b><span>${LABELS[f]}</span></div>`)
      .join('');
    const cells = {};
    fields.forEach(f => { cells[f] = el.querySelector(`[data-f="${f}"]`); });
    const update = () => {
      const w = sim.window(win);
      const v = Object.assign({}, sim.stats, {
        p50: fmtLat(w.p50), p95: fmtLat(w.p95), p99: fmtLat(w.p99), errPct: `${w.errPct.toFixed(0)}%`, rps: w.rps.toFixed(1)
      });
      fields.forEach(f => { cells[f].textContent = v[f]; });
    };
    throttle(sim, 0.25, update);
    update();
  }

  function chart(canvas, sim) {
    const N = 60;
    const blank = () => Array(N).fill(null);
    const ch = new Chart(canvas, {
      type: 'line',
      data: {
        labels: Array(N).fill(''),
        datasets: [
          {
            label: 'Latencia p95 (s)', data: blank(), yAxisID: 'y',
            borderColor: '#facc15', backgroundColor: 'rgba(250,204,21,.12)',
            fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2, spanGaps: true
          },
          {
            label: '% errores', data: blank(), yAxisID: 'y1',
            borderColor: '#f87171', backgroundColor: 'rgba(248,113,113,.12)',
            fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2, spanGaps: true
          }
        ]
      },
      options: {
        animation: false, responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#cbd5e1', boxWidth: 10, boxHeight: 10, font: { size: 12 } } } },
        scales: {
          x: { display: false },
          y: {
            position: 'left', min: 0, suggestedMax: 3,
            ticks: { color: '#facc15', font: { size: 11 }, callback: v => `${v}s` },
            grid: { color: 'rgba(148,163,184,.12)' }
          },
          y1: {
            position: 'right', min: 0, max: 100,
            ticks: { color: '#f87171', font: { size: 11 }, callback: v => `${v}%` },
            grid: { display: false }
          }
        }
      }
    });
    const [lat, err] = ch.data.datasets;
    throttle(sim, 0.5, isReset => {
      if (isReset) { lat.data = blank(); err.data = blank(); ch.update('none'); return; }
      const w = sim.window(3);
      lat.data.push(w.p95); lat.data.shift();
      err.data.push(w.n ? w.errPct : null); err.data.shift();
      ch.update('none');
    });
    return ch;
  }

  // Histograma de latencias (requests exitosas de los últimos `win` s) con marcas de p50 / p95 / p99
  function histogram(canvas, sim, win = 30) {
    const BIN = 0.2, MAX = 5;
    const nb = Math.round(MAX / BIN);
    const centers = Array.from({ length: nb }, (_, i) => +(i * BIN + BIN / 2).toFixed(3));
    const marks = [['p50', '#4ade80'], ['p95', '#facc15'], ['p99', '#f87171']];
    let pct = {};

    const markers = {
      id: 'pmarks',
      afterDatasetsDraw(chart) {
        const { ctx, chartArea: a, scales: { x } } = chart;
        ctx.save();
        ctx.font = '700 12px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'center';
        marks.forEach(([k, color], i) => {
          const v = pct[k];
          if (v == null) return;
          const px = x.getPixelForValue(Math.min(v, MAX));
          ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2;
          ctx.setLineDash([5, 4]);
          ctx.beginPath(); ctx.moveTo(px, a.top + 14 + i * 14); ctx.lineTo(px, a.bottom); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillText(k, px, a.top + 10 + i * 14);
        });
        ctx.restore();
      }
    };

    const ch = new Chart(canvas, {
      type: 'bar',
      data: {
        datasets: [{
          data: centers.map(c => ({ x: c, y: 0 })),
          backgroundColor: 'rgba(56,189,248,.65)', borderRadius: 2,
          barPercentage: 1, categoryPercentage: 1
        }]
      },
      options: {
        animation: false, responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: {
            type: 'linear', min: 0, max: MAX, offset: false,
            ticks: { color: '#94a3b8', stepSize: 1, callback: v => `${v}s` },
            grid: { color: 'rgba(148,163,184,.08)' },
            title: { display: true, text: 'latencia', color: '#64748b', font: { size: 11 } }
          },
          y: {
            beginAtZero: true, ticks: { color: '#64748b', precision: 0 },
            grid: { color: 'rgba(148,163,184,.12)' },
            title: { display: true, text: 'requests', color: '#64748b', font: { size: 11 } }
          }
        }
      },
      plugins: [markers]
    });

    throttle(sim, 0.5, isReset => {
      const counts = Array(nb).fill(0);
      if (!isReset) {
        const from = sim.now - win;
        for (let i = sim.log.length - 1; i >= 0; i--) {
          const e = sim.log[i];
          if (e.t < from) break;
          if (e.status !== 'err') counts[Math.min(nb - 1, Math.floor(e.lat / BIN))]++;
        }
      }
      const w = sim.window(win);
      pct = isReset ? {} : { p50: w.p50, p95: w.p95, p99: w.p99 };
      ch.data.datasets[0].data = centers.map((c, i) => ({ x: c, y: counts[i] }));
      ch.update('none');
    });
    return ch;
  }

  function strip(el, sim) {
    const N = 80;
    throttle(sim, 0.5, isReset => {
      if (isReset) { el.innerHTML = ''; return; }
      const w = sim.window(0.5);
      const i = document.createElement('i');
      i.className = w.n === 0 ? 'idle' : w.err === 0 ? 'up' : w.err === w.n ? 'down' : 'partial';
      el.appendChild(i);
      while (el.children.length > N) el.firstChild.remove();
    });
  }

  // Contadores de MicroSim: ok/err/calls en la ventana; resources, upCopies y deploys del estado actual
  const MLABELS = {
    ok: 'OK (5 s)', err: 'Errores (5 s)', resources: 'Recursos', upCopies: 'Copias arriba', deploys: 'Deploys',
    calls: 'Llamadas (5 s)', lat: 'Página (5 s)', partial: 'Con hueco (5 s)'
  };
  function mstats(el, sim, fields, win = 5) {
    el.innerHTML = `<div class="stats">${fields.map(f => `<div class="stat s-${f}"><b data-f="${f}">0</b><span>${MLABELS[f]}</span></div>`).join('')}</div>`;
    const update = () => {
      const w = sim.window(win);
      const v = {
        ok: w.ok, err: w.err, resources: sim.resources(), upCopies: sim.upCopies(),
        deploys: sim.groups.reduce((a, g) => a + g.deploys, 0), calls: w.calls,
        lat: fmtLat(w.pageLat), partial: w.partial
      };
      fields.forEach(f => { el.querySelector(`[data-f="${f}"]`).textContent = v[f]; });
    };
    throttle(sim, 0.25, update);
    sim.on('change', update);
    update();
  }

  const SVC_LABEL = { usuarios: 'Usuarios', ordenes: 'Órdenes', pagos: 'Pagos', envios: 'Envíos' };
  const SVC_COLOR = { usuarios: '#60a5fa', ordenes: '#fb923c', pagos: '#2dd4bf', envios: '#a3e635' };

  // Última página que armó la app web, llamada por llamada: una barra por servicio sobre el mismo eje de tiempo
  function pageTimeline(el, sim) {
    const draw = p => {
      if (!p) { el.innerHTML = '<div class="tl-empty">esperando la primera página…</div>'; return; }
      const span = Math.max(p.t1 - p.t0, 0.001);
      el.innerHTML = p.spans.map(s => {
        const left = (s.t0 - p.t0) / span * 100, width = ((s.t1 ?? p.t1) - s.t0) / span * 100;
        const bad = s.status !== 200;
        return `<div class="tl-row"><span>${SVC_LABEL[s.id] || s.id}</span><div class="tl-track"><i style="left:${left}%;width:${width}%;background:${bad ? '#f87171' : SVC_COLOR[s.id]}"></i></div></div>`;
      }).join('') + `<div class="tl-total">página en <b>${fmtLat(span)}</b></div>`;
    };
    sim.on('page', draw);
    sim.on('reset', () => draw(null));
    draw(sim.lastPage);
  }

  // Lo que ve el cliente en la última página: cada sección llegó, faltó, o la página entera falló
  function pageView(el, sim) {
    const draw = p => {
      if (!p) { el.innerHTML = '<div class="tl-empty">esperando la primera página…</div>'; return; }
      if (p.status === 502) { el.innerHTML = '<div class="pv-fail">502 · No pudimos cargar la página</div>'; return; }
      el.innerHTML = Object.entries(p.parts).map(([id, st]) => st === 200
        ? `<div class="pv-part" style="--c:${SVC_COLOR[id]}">✓ ${SVC_LABEL[id] || id}</div>`
        : `<div class="pv-part missing">✗ ${SVC_LABEL[id] || id}: no disponible</div>`).join('');
    };
    sim.on('page', draw);
    sim.on('reset', () => draw(null));
    draw(sim.lastPage);
  }

  window.Widgets = { mstats, stats, chart, histogram, strip, fmtLat, pageTimeline, pageView };
})();
