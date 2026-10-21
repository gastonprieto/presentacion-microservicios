/* Una función por slide interactiva. Cada una recibe el <section> y devuelve { start, stop }.
   main.js las crea la primera vez que se visita la slide y las pausa al salir.
   Para una slide nueva: <section data-scene="nombre"> en index.html + S.nombre = slide => { … } acá. */
(function () {
  'use strict';

  const { Sim, Clock, svgEl, cubic, curve, edge, pop, C } = window.NetKit;
  const S = {};

  /* ---------- helpers ---------- */

  // Crea la Sim sobre <svg class="sim"> y conecta los widgets que haya en la slide:
  // .stats (data-fields, data-window), .strip, canvas.chart, canvas.histo
  function setup(slide, opts) {
    const sim = new Sim(slide.querySelector('svg.sim'), opts);
    const st = slide.querySelector('.stats');
    if (st) Widgets.stats(st, sim, st.dataset.fields ? st.dataset.fields.split(',') : null, +(st.dataset.window || 5));
    const strip = slide.querySelector('.strip');
    if (strip) Widgets.strip(strip, sim);
    const cv = slide.querySelector('canvas.chart');
    if (cv) Widgets.chart(cv, sim);
    const hist = slide.querySelector('canvas.histo');
    if (hist) Widgets.histogram(hist, sim);
    return sim;
  }

  function on(slide, sel, fn) {
    slide.querySelectorAll(sel).forEach(b => b.addEventListener('click', e => { fn(b, e); b.blur(); }));
  }

  // Control segmentado: <div class="seg" data-group="x"><button data-v="a">…
  function seg(slide, group, fn) {
    const root = slide.querySelector(`.seg[data-group="${group}"]`);
    root.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      root.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      b.blur();
      fn(b.dataset.v);
    }));
  }

  // Muestra solo los elementos [data-mode] que coinciden
  function showMode(slide, mode) {
    slide.querySelectorAll('[data-mode]').forEach(el => { el.hidden = el.dataset.mode !== mode; });
  }

  const life = sim => ({ start: () => sim.start(), stop: () => sim.stop() });

  /* ---------- 1. portada: simulación decorativa de fondo ---------- */

  S.title = slide => {
    const sim = new Sim(slide.querySelector('svg.bg'), {
      clients: 3, servers: 4, rate: 5, colorByClient: true, showHandled: false, serviceTime: 0.6
    });
    return life(sim);
  };

  /* ---------- 2. demo: Sim + slider de tráfico + ＋/－ servidores + gráfico y contadores ---------- */

  S.demo = slide => {
    const PER_SERVER = 5; // capacity / serviceTime = 4 / 0.8
    const sim = setup(slide, {
      servers: 1, rate: 3, capacity: 4, serviceTime: 0.8, queueMax: 8, arrival: 'poisson'
    });
    const out = slide.querySelector('.srv-out');
    const range = slide.querySelector('input[type=range]');
    const rateOut = slide.querySelector('.rate-out');
    const util = slide.querySelector('.util-out');
    const sync = () => {
      const n = sim.activeServers(), r = +range.value, cap = n * PER_SERVER;
      const u = Math.round((r / cap) * 100);
      rateOut.textContent = `${r} req/s`;
      out.innerHTML = `<b>${n}</b> servidor${n > 1 ? 'es' : ''} · cap. ≈ <b>${cap}</b> req/s`;
      util.textContent = `${u}%`;
      util.className = 'util-out ' + (u < 70 ? 'ok' : u <= 100 ? 'warn' : 'bad');
    };
    range.addEventListener('input', () => { sim.setRate(+range.value); sync(); });
    on(slide, '[data-act=add]', () => { sim.addServer(); sync(); });
    on(slide, '[data-act=remove]', () => { sim.removeServer(); sync(); });
    on(slide, '[data-act=reset]', () => {
      range.value = 3;
      sim.reset(Object.assign({}, sim.o, { rate: 3, servers: 1 }));
      sync();
    });
    sync();
    return life(sim);
  };

  /* ---------- 3. modos: control segmentado que reconfigura la Sim + texto por modo ---------- */

  S.modes = slide => {
    const opts = mode => ({
      servers: 3, rate: 6, capacity: 4, serviceTime: 0.2, arrival: 'poisson', slowThreshold: 2.5,
      db: { mode } // 'single' | 'cache'
    });
    const sim = setup(slide, opts('single'));
    showMode(slide, 'single');
    seg(slide, 'mode', v => { showMode(slide, v); sim.reset(opts(v)); });
    return life(sim);
  };

  /* ---------- esqueleto: escena manual con Clock (sin Sim) ----------
     Para dibujos que la Sim no cubre. Usar con <section data-scene="manual"> y un <svg class="sim">.
     Coordenadas en NetKit.W × NetKit.H; en celular (NetKit.MOBILE) conviene un layout propio. */

  S.manual = slide => {
    const svg = slide.querySelector('svg.sim');
    svg.setAttribute('viewBox', `0 0 ${NetKit.W} ${NetKit.H}`);
    svg.classList.add('netsim');
    const clock = new Clock();
    const M = NetKit.MOBILE;
    const a = { x: M ? 200 : 150, y: M ? 60 : NetKit.H / 2, hw: 50, hh: 26 };
    const b = { x: M ? 200 : NetKit.W - 150, y: M ? NetKit.H - 60 : NetKit.H / 2, hw: 50, hh: 26 };

    const build = () => {
      clock.clear();
      svg.innerHTML = '';
      svgEl('path', { class: 'link', d: curve(edge(a, b, M), edge(b, a, M), M) }, svg);
      [a, b].forEach((n, i) => {
        const g = svgEl('g', { class: 'srv', transform: `translate(${n.x},${n.y})` }, svg);
        svgEl('rect', { class: 'node-box', x: -n.hw, y: -n.hh, width: n.hw * 2, height: n.hh * 2, rx: 10 }, g);
        svgEl('text', { x: 0, y: 5, class: 't-title', 'text-anchor': 'middle' }, g).textContent = i ? 'B' : 'A';
      });
      // un paquete de A a B cada 0,6 s (tiempo de simulación: respeta pausa y velocidad global)
      clock.every(0.6, () => {
        const pk = svgEl('circle', { r: 5.5, fill: C.req, class: 'pk' }, svg);
        clock.animate(0.8, p => {
          const P = cubic(edge(a, b, M), edge(b, a, M), p, M);
          pk.setAttribute('cx', P.x); pk.setAttribute('cy', P.y);
        }, () => { pop(svg, b.x, b.y - b.hh - 8, '✔', C.ok); pk.remove(); });
      });
    };

    on(slide, '[data-act=reset]', build);
    build();
    return { start: () => clock.start(), stop: () => clock.stop() };
  };

  window.Scenes = S;
})();
