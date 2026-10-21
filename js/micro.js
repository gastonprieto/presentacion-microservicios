/* Motor de las slides de microservicios: cliente → (LB) → monolito, servicios separados o app web.
   Topologías: 'monolith' (copias iguales con los tres módulos adentro), 'direct' (un host por servicio)
   y 'appweb' (una app web que llama a cada servicio y arma la página).
   Cada grupo (monolito, servicio, app web) tiene workers con `capacity` pedidos en paralelo y una cola de `maxQueue`.
   Usa el Clock y la geometría de NetKit. Expone window.MicroKit = { MicroSim, ROUTE_COLORS, SERVICES }. */
(function () {
  'use strict';

  const { Clock, Speed, svgEl, cubic, curve, edge, pop, C, MOBILE, W, H } = window.NetKit;

  const ROUTE_COLORS = { '/usuarios': '#60a5fa', '/ordenes': '#fb923c', '/pagos': '#2dd4bf', '/ordenes/envios': '#a3e635' };
  const SERVICES = [
    { id: 'usuarios', label: 'Usuarios', icon: '👤', serves: ['/usuarios'] },
    { id: 'ordenes', label: 'Órdenes', icon: '🧾', serves: ['/ordenes'] },
    { id: 'pagos', label: 'Pagos', icon: '💳', serves: ['/pagos'] }
  ];
  const MODULES = SERVICES.map(s => s.id);

  const DEFAULTS = {
    topology: 'monolith', seed: 1, rate: 3, mix: { '/usuarios': 1, '/ordenes': 1, '/pagos': 1 },
    copies: 1, capacity: 3, maxQueue: 6, workTime: { '/usuarios': 0.4, '/ordenes': 0.4, '/pagos': 0.4 },
    services: null, host: 'tienda.com', travel: 0.35, pops: true
  };

  const clone = x => JSON.parse(JSON.stringify(x));

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const svcColor = id => ROUTE_COLORS[(SERVICES.find(s => s.id === id) || {}).serves?.[0]] || (id === 'envios' ? ROUTE_COLORS['/ordenes/envios'] : '#94a3b8');

  class MicroSim {
    constructor(svg, opts) {
      this.svg = svg;
      this.v = MOBILE;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.classList.add('netsim', 'microsim');
      this.clock = new Clock();
      this.clock.onTick = () => this._frame();
      this.listeners = {};
      this.reset(opts);
    }

    on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
    emit(ev, ...a) { (this.listeners[ev] || []).forEach(f => f(...a)); }
    start() { this.clock.start(); }
    stop() { this.clock.stop(); }
    get now() { return this.clock.now; }

    reset(opts) {
      if (opts) {
        const o = Object.assign({}, DEFAULTS, clone(opts));
        o.mix = Object.assign({}, opts.mix ? {} : DEFAULTS.mix, o.mix);
        o.workTime = Object.assign({}, DEFAULTS.workTime, o.workTime);
        o.services = clone(o.services || SERVICES);
        this.base = o;
      }
      this.o = clone(this.base);
      this.gen = (this.gen || 0) + 1;
      this.rand = rng(this.o.seed);
      this.clock.clear();
      this.svg.innerHTML = '';
      this.gLinks = svgEl('g', {}, this.svg);
      this.gNodes = svgEl('g', {}, this.svg);
      this.gPk = svgEl('g', {}, this.svg);
      this.gTop = svgEl('g', {}, this.svg);
      this.c = { sent: 0, ok: 0, err: 0, e404: 0, calls: 0 };
      this.log = [];
      this.flying = new Set();
      this.seq = 0; this.wseq = 0;
      this._build();
      this._schedule();
      this._frame();
      this.emit('reset');
    }

    /* ---------- topología ---------- */

    _build() {
      const v = this.v;
      this.client = v ? { x: W / 2, y: 38, hw: 96, hh: 24 } : { x: 95, y: H / 2, hw: 80, hh: 30 };
      this.client.g = svgEl('g', { class: 'client', transform: `translate(${this.client.x},${this.client.y})` }, this.gNodes);
      this.client.g.style.setProperty('--c', '#7dd3fc');
      svgEl('rect', { class: 'node-box', x: -this.client.hw, y: -this.client.hh, width: this.client.hw * 2, height: this.client.hh * 2, rx: 10 }, this.client.g);
      svgEl('text', { x: 0, y: -3, class: 't-title small', 'text-anchor': 'middle' }, this.client.g).textContent = '💻 Cliente';
      this.client.sub = svgEl('text', { x: 0, y: 13, class: 't-sub', 'text-anchor': 'middle' }, this.client.g);
      this.lb = v ? { x: W / 2, y: 140, hw: 80, hh: 24 } : { x: 330, y: H / 2, hw: 72, hh: 30 };
      this.lb.g = svgEl('g', { class: 'lb' }, this.gNodes);
      svgEl('rect', { class: 'node-box', x: -this.lb.hw, y: -this.lb.hh, width: this.lb.hw * 2, height: this.lb.hh * 2, rx: 10 }, this.lb.g);
      svgEl('text', { x: 0, y: 5, class: 't-title small', 'text-anchor': 'middle' }, this.lb.g).textContent = '⚖ LB';
      this.groups = [];
      if (this.o.topology === 'monolith') {
        this.mono = this._group({ id: 'monolith', kind: 'mono', label: 'Monolito', icon: '🖥', serves: ['/'] }, this.o.copies);
      }
      this._layout(false);
    }

    _group(def, n) {
      const g = Object.assign({ workers: [], rr: 0, deploys: 0 }, def);
      g.el = svgEl('g', { class: `grp ${def.kind}` }, this.gNodes);
      for (let i = 0; i < n; i++) this._addWorker(g, false);
      this.groups.push(g);
      return g;
    }

    _addWorker(g, fresh) {
      const w = { id: ++this.wseq, state: 'up', active: 0, queue: [], epoch: 0, version: g.deploys, x: 0, y: 0, hw: 0, hh: 0, scale: fresh ? 0 : 1 };
      w.g = svgEl('g', { class: g.kind === 'mono' ? 'copy' : 'worker' }, g.el);
      w.box = svgEl('rect', { class: 'node-box', rx: 10 }, w.g);
      w.title = svgEl('text', { class: 't-title small', 'text-anchor': 'middle' }, w.g);
      w.sub = svgEl('text', { class: 't-sub', 'text-anchor': 'middle' }, w.g);
      if (g.kind === 'mono') {
        w.mods = MODULES.map(id => {
          const m = svgEl('g', {}, w.g);
          const r = svgEl('rect', { class: 'mod', rx: 4, fill: svcColor(id) }, m);
          const t = svgEl('text', { class: 't-mod', 'text-anchor': 'middle' }, m);
          t.textContent = SERVICES.find(s => s.id === id).label;
          return { r, t };
        });
      }
      g.workers.push(w);
      return w;
    }

    _removeWorker(g, w) {
      g.workers = g.workers.filter(x => x !== w);
      w.g.remove();
    }

    // Posiciones de cada nodo según la topología (escritorio: horizontal; celular: vertical)
    _layout(animate) {
      const v = this.v, set = (n, t) => {
        if (n.scale === 0) { Object.assign(n, t); gsap.to(n, { scale: 1, duration: 0.45, ease: 'back.out(1.7)' }); }
        else if (animate) gsap.to(n, Object.assign({ duration: 0.45, ease: 'power2.inOut' }, t));
        else Object.assign(n, t);
      };
      if (this.mono) {
        const ws = this.mono.workers, n = ws.length;
        ws.forEach((w, i) => {
          if (v) set(w, { x: W * (i + 0.5) / n, y: 330, hw: Math.min(150, W / n / 2 - 6), hh: 64 });
          else {
            const gap = Math.min(160, (H - 40) / n);
            set(w, { x: 650, y: H / 2 + (i - (n - 1) / 2) * gap, hw: 160, hh: Math.min(62, gap / 2 - 8) });
          }
        });
      }
      this._relink();
    }

    _showLb() { return !!this.mono && this.mono.workers.length > 1; }

    _relink() {
      this.gLinks.innerHTML = '';
      this.links = [];
      const L = (a, b) => this.links.push({ a, b, el: svgEl('path', { class: 'link' }, this.gLinks) });
      if (this.mono) {
        if (this._showLb()) { L(this.client, this.lb); this.mono.workers.forEach(w => L(this.lb, w)); }
        else this.mono.workers.forEach(w => L(this.client, w));
      }
    }

    /* ---------- tráfico ---------- */

    _schedule() {
      if (this.timer) this.clock.cancel(this.timer);
      const r = this.o.rate;
      if (r <= 0) { this.timer = this.clock.after(0.25, () => this._schedule()); return; }
      this.timer = this.clock.after(-Math.log(1 - this.rand()) / r, () => { this._arrive(); this._schedule(); });
    }

    _pickPath() {
      const entries = Object.entries(this.o.mix).filter(e => e[1] > 0);
      const total = entries.reduce((a, e) => a + e[1], 0);
      let u = this.rand() * total;
      for (const [p, w] of entries) { if ((u -= w) < 0) return p; }
      return entries[entries.length - 1][0];
    }

    _arrive() {
      const req = { id: ++this.seq, path: this._pickPath(), t0: this.now };
      this.c.sent++;
      this.flying.add(req);
      if (this.mono) {
        const color = ROUTE_COLORS[req.path] || C.req;
        if (this._showLb()) this._fly(this.client, this.lb, color, () => this._toGroup(req, this.mono, this.lb, color));
        else this._toGroup(req, this.mono, this.client, color);
      }
    }

    // Elige un worker en marcha (round robin) y le manda el pedido desde `from`
    _toGroup(req, g, from, color, cb) {
      const done = cb || (st => this._finish(req, st));
      const ups = g.workers.filter(w => w.state === 'up');
      if (!ups.length) {
        const at = g.workers[0] || from;
        this._fly(from, at, color, () => { this._pop(at, '✕ conexión', C.err); done('conn'); });
        return;
      }
      const w = ups[g.rr++ % ups.length];
      this._fly(from, w, color, () => this._atWorker(req, g, w, done));
    }

    _atWorker(req, g, w, done) {
      if (w.state === 'down') { this._pop(w, '✕ conexión', C.err); done('conn'); return; }
      if (w.active < this.o.capacity) this._work(req, g, w, done);
      else if (w.queue.length < this.o.maxQueue) w.queue.push({ req, done });
      else { this._pop(w, '503', C.err); done(503); }
    }

    _work(req, g, w, done) {
      w.active++;
      const epoch = w.epoch, gen = this.gen;
      const d = (this.o.workTime[req.path] || 0.4) * (0.85 + 0.3 * this.rand());
      this.clock.after(d, () => {
        if (gen !== this.gen) return;
        if (w.epoch !== epoch) return; // el worker se cayó con el pedido adentro: ya se contó como error
        w.active--;
        this._pop(w, '✔', C.ok);
        done(200);
        this._next(g, w);
      });
    }

    _next(g, w) {
      while (w.active < this.o.capacity && w.queue.length && w.state !== 'down') {
        const q = w.queue.shift();
        this._work(q.req, g, w, q.done);
      }
      if (w.state === 'draining' && !w.active && !w.queue.length) this.emit('drained', w);
    }

    _finish(req, status) {
      if (!this.flying.has(req)) return;
      this.flying.delete(req);
      if (status === 200) this.c.ok++;
      else { this.c.err++; if (status === 404) this.c.e404++; }
      this.log.push({ t: this.now, path: req.path, status, svc: req.svc });
      if (this.log.length > 4000) this.log.splice(0, 1500);
    }

    _fly(a, b, color, done, dur) {
      const gen = this.gen;
      const el = svgEl('circle', { r: 6, fill: color, class: 'pk' }, this.gPk);
      this.clock.animate(dur || this.o.travel, p => {
        const P = cubic(edge(a, b, this.v), edge(b, a, this.v), p, this.v);
        el.setAttribute('cx', P.x); el.setAttribute('cy', P.y);
      }, () => { el.remove(); if (gen === this.gen) done(); });
    }

    _pop(n, text, color) {
      if (this.o.pops) pop(this.gTop, n.x, n.y - n.hh - 8, text, color);
    }

    /* ---------- controles ---------- */

    setRate(r) { this.o.rate = r; this._schedule(); }
    setMix(path, weight) { this.o.mix[path] = weight; }
    setWork(path, sec) { this.o.workTime[path] = sec; }

    get copies() { return this.mono ? this.mono.workers : []; }

    addCopy() {
      if (!this.mono || this.mono.workers.length >= 4) return;
      this._addWorker(this.mono, true);
      this._layout(true);
      this.emit('change');
    }

    removeCopy() {
      if (!this.mono) return;
      const ups = this.mono.workers.filter(w => w.state === 'up');
      if (this.mono.workers.length <= 1 || !ups.length) return;
      const w = ups[ups.length - 1];
      this._kill(w);
      this._removeWorker(this.mono, w);
      this._layout(true);
      this.emit('change');
    }

    // Saca de servicio un worker: lo que tenía adentro o en cola falla
    _kill(w) {
      w.epoch++;
      w.active = 0;
      const q = w.queue; w.queue = [];
      q.forEach(x => x.done('conn'));
    }

    _target(id) { return id === 'monolith' ? this.mono : this.groups.find(g => g.id === id); }

    // Deploy gradual con una copia de más: arranca una nueva, saca una vieja cuando terminó lo suyo, y así.
    // Nunca quedan menos workers en marcha que al empezar. Llamarlo de nuevo mientras corre devuelve la misma Promise.
    deploy(id) {
      const g = this._target(id);
      if (!g) return Promise.resolve();
      if (g.deploying) return g.deploying;
      const gen = this.gen, old = g.workers.slice();
      this.emit('deploy', { target: id, touched: g.kind === 'mono' ? MODULES.slice() : [id] });
      g.deploying = new Promise(resolve => {
        const finish = () => {
          if (gen !== this.gen) return resolve();
          g.deploys++;
          g.deploying = null;
          this.emit('change');
          resolve();
        };
        const step = i => {
          if (gen !== this.gen) return resolve();
          const prev = old[i];
          if (!prev) return finish();
          if (!g.workers.includes(prev)) return step(i + 1);
          const nw = this._addWorker(g, true);
          nw.state = 'starting';
          nw.version = g.deploys + 1;
          this._layout(true);
          this.clock.after(1, () => {
            if (gen !== this.gen) return resolve();
            nw.state = g.bug ? 'down' : 'up';
            if (prev.state === 'up') prev.state = 'draining';
            const wait = () => {
              if (gen !== this.gen) return resolve();
              if (prev.state !== 'down' && (prev.active || prev.queue.length)) { this.clock.after(0.1, wait); return; }
              this._removeWorker(g, prev);
              this._layout(true);
              this.clock.after(0.3, () => step(i + 1));
            };
            wait();
          });
        };
        step(0);
      });
      return g.deploying;
    }

    deploying() { return this.groups.some(g => g.deploying); }
    deployCount(id) { const g = this._target(id); return g ? g.deploys : 0; }

    // Falla: en el monolito, un bug en un módulo tira todas las copias (corren el mismo código); si no, solo ese grupo
    crash(id) {
      const g = MODULES.includes(id) && this.mono ? this.mono : this._target(id);
      if (!g || g.bug) return;
      g.bug = id;
      const gen = this.gen;
      g.workers.forEach((w, i) => this.clock.after(0.25 * i, () => {
        if (gen !== this.gen || !g.bug || w.state === 'down') return;
        w.state = 'down';
        this._kill(w);
        this._pop(w, '💥', C.err);
      }));
      this.emit('change');
    }

    recover(id) {
      const g = MODULES.includes(id) && this.mono ? this.mono : this._target(id);
      if (!g || !g.bug) return;
      g.bug = null;
      g.workers.forEach(w => { if (w.state === 'down') w.state = 'up'; });
      this.emit('change');
    }

    upCopies() { return this.mono ? this.mono.workers.filter(w => w.state === 'up').length : 0; }

    resources() {
      return this.groups.reduce((a, g) => a + g.workers.length * (g.kind === 'mono' ? MODULES.length : 1), 0);
    }

    /* ---------- métricas ---------- */

    // ok/err/e404/byPath: lo que terminó en los últimos `sec` segundos. total: acumulado (sent = ok + err + inFlight).
    window(sec) {
      const t0 = this.now - sec, w = { ok: 0, err: 0, e404: 0, byPath: {}, byService: {} };
      for (let i = this.log.length - 1; i >= 0 && this.log[i].t >= t0; i--) {
        const e = this.log[i];
        if (e.status === 200) {
          w.ok++;
          w.byPath[e.path] = (w.byPath[e.path] || 0) + 1;
          if (e.svc) w.byService[e.svc] = (w.byService[e.svc] || 0) + 1;
        } else { w.err++; if (e.status === 404) w.e404++; }
      }
      return Object.assign(w, {
        sent: this.c.sent, inFlight: this.flying.size, resources: this.resources(),
        total: { sent: this.c.sent, ok: this.c.ok, err: this.c.err, e404: this.c.e404, calls: this.c.calls }
      });
    }

    fastForward(sec) {
      const sp = Speed.value;
      Speed.value = 1;
      try { for (let i = 0, n = Math.round(sec / 0.05); i < n; i++) this.clock._tick(0, 50); }
      finally { Speed.value = sp; }
    }

    /* ---------- render ---------- */

    _frame() {
      for (const l of this.links) l.el.setAttribute('d', curve(edge(l.a, l.b, this.v), edge(l.b, l.a, this.v), this.v));
      this.client.sub.textContent = this.o.host;
      this.lb.g.style.display = this._showLb() ? '' : 'none';
      this.groups.forEach(g => g.workers.forEach((w, i) => this._drawWorker(g, w, i)));
      this.emit('tick', this.now);
    }

    _drawWorker(g, w, i) {
      w.g.setAttribute('transform', `translate(${w.x},${w.y}) scale(${w.scale})`);
      w.g.classList.toggle('down', w.state === 'down');
      w.g.classList.toggle('deploying', w.state === 'starting' || w.state === 'draining');
      w.box.setAttribute('x', -w.hw); w.box.setAttribute('y', -w.hh);
      w.box.setAttribute('width', w.hw * 2); w.box.setAttribute('height', w.hh * 2);
      const n = g.workers.length;
      if (g.kind === 'mono') {
        w.title.setAttribute('y', -w.hh + 20);
        w.title.textContent = `${g.icon} ${g.label}${n > 1 ? ` ${i + 1}` : ''}${w.version ? ` · v${w.version + 1}` : ''}`;
        w.sub.setAttribute('y', -w.hh + 36);
        w.sub.textContent = this._status(w);
        const mw = (w.hw * 2 - 24) / 3, my = w.hh - 26;
        w.mods.forEach((m, k) => {
          const x = -w.hw + 8 + k * (mw + 4);
          m.r.setAttribute('x', x); m.r.setAttribute('y', my); m.r.setAttribute('width', mw); m.r.setAttribute('height', 18);
          m.t.setAttribute('x', x + mw / 2); m.t.setAttribute('y', my + 13);
          m.t.textContent = mw < 60 ? m.t.textContent.slice(0, 3) + '.' : SERVICES[k].label;
        });
      }
    }

    _status(w) {
      if (w.state === 'down') return 'caído';
      if (w.state === 'starting') return 'arrancando versión nueva…';
      if (w.state === 'draining') return 'terminando y saliendo…';
      const cap = this.o.capacity;
      return '●'.repeat(Math.min(w.active, cap)) + '○'.repeat(Math.max(0, cap - w.active)) + (w.queue.length ? ` · cola ${w.queue.length}` : '');
    }
  }

  window.MicroKit = { MicroSim, ROUTE_COLORS, SERVICES };
})();
