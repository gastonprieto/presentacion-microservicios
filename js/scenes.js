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

  const life = sim => ({ start: () => sim.start(), stop: () => sim.stop(), sim });

  /* ---------- 0. portada: simulación decorativa de fondo ---------- */

  S.title = slide => {
    const sim = new Sim(slide.querySelector('svg.bg'), {
      clients: 3, servers: 4, rate: 5, colorByClient: true, showHandled: false, serviceTime: 0.6
    });
    return life(sim);
  };

  // Crea un MicroSim sobre <svg class="sim"> y conecta .mstats si existe
  function msetup(slide, opts) {
    const sim = new MicroKit.MicroSim(slide.querySelector('svg.sim'), opts);
    const st = slide.querySelector('.mstats');
    if (st) Widgets.mstats(st, sim, st.dataset.fields.split(','), +(st.dataset.window || 5));
    return sim;
  }

  // Slider de tráfico: <input type=range> + .rate-out
  function rateSlider(slide, sim) {
    const range = slide.querySelector('input[type=range]'), out = slide.querySelector('.rate-out');
    const sync = () => { out.textContent = `${range.value} req/s`; };
    range.addEventListener('input', () => { sim.setRate(+range.value); sync(); });
    sim.on('reset', () => { range.value = sim.o.rate; sync(); });
    sync();
  }

  const SPIKE = sim => { sim.setMix('/pagos', 6); sim.setWork('/pagos', 0.8); sim.setRate(8); };

  /* ---------- 1. una app, una dirección ---------- */

  S.monolith = slide => {
    const sim = msetup(slide, { rate: 3 });
    rateSlider(slide, sim);
    return life(sim);
  };

  /* ---------- 2. se satura una parte, escalás todo ---------- */

  S.scale = slide => {
    const sim = msetup(slide, { rate: 3 });
    on(slide, '[data-act=spike]', () => SPIKE(sim));
    on(slide, '[data-act=add]', () => sim.addCopy());
    on(slide, '[data-act=remove]', () => sim.removeCopy());
    on(slide, '[data-act=reset]', () => sim.reset());
    return life(sim);
  };

  /* ---------- 3. cambiás una parte, deployás todo / falla una parte, cae todo ---------- */

  S.limits = slide => {
    const sim = msetup(slide, { rate: 4, copies: 2 });
    const touched = slide.querySelector('.touched');
    const label = id => (MicroKit.SERVICES.find(s => s.id === id) || { label: id }).label;
    sim.on('deploy', e => { touched.innerHTML = e.touched.map(id => `<b>${label(id)}</b>`).join(' · '); });
    sim.on('reset', () => { touched.textContent = '—'; });
    showMode(slide, 'deploy');
    seg(slide, 'mode', v => { showMode(slide, v); sim.reset(); });
    on(slide, '[data-act=deploy]', () => sim.deploy('monolith'));
    on(slide, '[data-act=crash]', () => sim.crash('pagos'));
    on(slide, '[data-act=recover]', () => sim.recover('pagos'));
    on(slide, '[data-act=reset]', () => sim.reset());
    return life(sim);
  };

  /* ---------- 4. cada parte, su propio servicio ---------- */

  S.split = slide => {
    const sim = msetup(slide, { rate: 4 });
    const btn = slide.querySelector('[data-act=split]');
    on(slide, '[data-act=split]', () => {
      if (sim.o.topology !== 'monolith') return;
      sim.reset({ rate: 4, topology: 'direct' });
      sim.groups.forEach((g, i) => { g.scale = 0; gsap.to(g, { scale: 1, duration: 0.5, delay: 0.12 * i, ease: 'back.out(1.7)' }); });
      btn.disabled = true;
    });
    on(slide, '[data-act=reset]', () => { sim.reset({ rate: 4 }); btn.disabled = false; });
    return life(sim);
  };

  /* ---------- 5. escalar, deployar y fallar por separado ---------- */

  S.gains = slide => {
    const sim = msetup(slide, { rate: 3, topology: 'direct' });
    on(slide, '[data-act=spike]', () => SPIKE(sim));
    on(slide, '[data-act=scale]', () => sim.setReplicas('pagos', sim.replicas('pagos') + 1));
    on(slide, '[data-act=deploy]', () => sim.deploy('ordenes'));
    on(slide, '[data-act=crash]', () => sim.crash('pagos'));
    on(slide, '[data-act=recover]', () => sim.recover('pagos'));
    on(slide, '[data-act=reset]', () => sim.reset());
    return life(sim);
  };

  /* ---------- escenas (pendientes) ---------- */

  S.direct = slide => ({ start() {}, stop() {} });
  S.appweb = slide => ({ start() {}, stop() {} });
  S.cracks = slide => ({ start() {}, stop() {} });

  window.Scenes = S;
})();
