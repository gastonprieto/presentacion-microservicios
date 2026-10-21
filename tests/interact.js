// Pruebas de interacción con Chrome headless: motor MicroKit y escenas.
// Uso: node tests/interact.js [filtro]   (filtro = parte del nombre de la prueba)
// Requiere `npm i` en presentaciones-guideline/tools (usa su puppeteer-core).
const path = require('path');
const puppeteer = require(path.resolve(__dirname, '../../presentaciones-guideline/tools/node_modules/puppeteer-core'));

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const filter = process.argv[2] || '';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

/* ---------- helpers ---------- */

async function open(page, idx = 0, mobile = false) {
  await page.goto(`file://${ROOT}/index.html?mobile=${mobile ? 1 : 0}#/${idx}`);
  await sleep(600);
}

// Va a la slide idx y espera a que su escena exista (section._scene)
async function goto(page, idx) {
  await page.evaluate(i => Reveal.slide(i, 0, 99), idx);
  await page.waitForFunction(i => window.__sec(i)._scene, { timeout: 4000 }, idx);
}

// Ejecuta fn(section, ...args) en la página sobre la slide idx
async function evalScene(page, idx, fn, ...args) {
  await goto(page, idx);
  return page.evaluate(`(${fn})(window.__sec(${idx}), ...${JSON.stringify(args)})`);
}

// Ejecuta fn(svg, ...args) con un <svg> nuevo en la página (para probar motores sin slide)
async function engine(page, fn, ...args) {
  return page.evaluate(`(() => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('style', 'position:fixed;left:0;top:0;width:900px;height:590px;opacity:0;pointer-events:none');
    document.body.appendChild(svg);
    try { return (${fn})(svg, ...${JSON.stringify(args)}); } finally { svg.remove(); }
  })()`);
}

function check(cond, msg) { if (!cond) throw new Error(msg); }

/* ---------- pruebas ---------- */
/* ---------- pruebas ---------- */

test('base: carga sin errores de consola', async (page, errors) => {
  await open(page, 0);
  check(errors.length === 0, `errores: ${errors.join(' | ')}`);
});

/* ---------- motor MicroKit ---------- */

const INV = `w => w.total.sent === w.total.ok + w.total.err + w.inFlight`;
const SPIKE = `{ rate: 8, mix: { '/usuarios': 1, '/ordenes': 1, '/pagos': 6 }, workTime: { '/usuarios': 0.4, '/ordenes': 0.4, '/pagos': 0.8 } }`;

test('micro: monolito atiende', async page => {
  await open(page);
  const r = await engine(page, `svg => {
    const s = new MicroKit.MicroSim(svg, { rate: 3 });
    s.fastForward(10);
    const w = s.window(10);
    return { w, inv: (${INV})(w) };
  }`);
  check(r.w.ok > 20, `ok=${r.w.ok}`);
  check(r.w.err === 0, `err=${r.w.err}`);
  check(r.inv, `invariante: ${JSON.stringify(r.w)}`);
});

test('micro: pico en /pagos satura una copia', async page => {
  await open(page);
  for (const seed of [1, 2, 3]) {
    const r = await engine(page, `(svg, seed) => {
      const s = new MicroKit.MicroSim(svg, Object.assign(${SPIKE}, { copies: 1, seed }));
      s.fastForward(10);
      return s.window(10);
    }`, seed);
    check(r.err > 0, `seed ${seed}: err=${r.err}`);
  }
});

test('micro: más copias absorben el pico, pero cuestan todo', async page => {
  await open(page);
  for (const seed of [1, 2, 3]) {
    const r = await engine(page, `(svg, seed) => {
      const s = new MicroKit.MicroSim(svg, Object.assign(${SPIKE}, { copies: 3, seed }));
      s.fastForward(10);
      return { w: s.window(10), res: s.resources() };
    }`, seed);
    check(r.w.err === 0, `seed ${seed}: err=${r.w.err}`);
    check(r.res === 9, `recursos=${r.res}`);
  }
});

test('micro: mínimo una copia', async page => {
  await open(page);
  const r = await engine(page, `svg => {
    const s = new MicroKit.MicroSim(svg, { rate: 3 });
    s.removeCopy(); s.removeCopy(); s.removeCopy();
    s.fastForward(5);
    const w = s.window(5);
    return { copies: s.copies.length, w, inv: (${INV})(w) };
  }`);
  check(r.copies === 1, `copias=${r.copies}`);
  check(r.inv, `invariante: ${JSON.stringify(r.w)}`);
});

test('micro: deploy del monolito toca todo y no corta', async page => {
  await open(page);
  const r = await engine(page, `svg => {
    const s = new MicroKit.MicroSim(svg, { copies: 3 });
    let touched = null, min = Infinity;
    s.on('deploy', e => { touched = e.touched; });
    s.on('tick', () => { min = Math.min(min, s.upCopies()); });
    s.deploy('monolith');
    s.fastForward(8);
    return { touched, min, count: s.deployCount('monolith'), deploying: s.deploying(), up: s.upCopies(), w: s.window(8) };
  }`);
  check(JSON.stringify(r.touched) === '["usuarios","ordenes","pagos"]', `touched=${JSON.stringify(r.touched)}`);
  check(r.min >= 2, `mínimo de copias arriba=${r.min}`);
  check(r.count === 1 && !r.deploying && r.up === 3, `count=${r.count} deploying=${r.deploying} up=${r.up}`);
  check(r.w.err === 0, `err=${r.w.err}`);
});

test('micro: deploy repetido se ignora', async page => {
  await open(page);
  const r = await engine(page, `svg => {
    const s = new MicroKit.MicroSim(svg, { copies: 2 });
    const a = s.deploy('monolith'), b = s.deploy('monolith');
    s.fastForward(8);
    return { same: a === b, count: s.deployCount('monolith'), copies: s.copies.length };
  }`);
  check(r.same, 'devolvió otra Promise');
  check(r.count === 1 && r.copies === 2, `count=${r.count} copias=${r.copies}`);
});

test('micro: deploy sobrevive a stop/start', async page => {
  await open(page);
  const r = await engine(page, `svg => {
    const s = new MicroKit.MicroSim(svg, { copies: 2 });
    s.deploy('monolith');
    s.fastForward(1); s.stop(); s.start(); s.fastForward(8); s.stop();
    return { deploying: s.deploying(), up: s.upCopies() };
  }`);
  check(!r.deploying && r.up === 2, `deploying=${r.deploying} up=${r.up}`);
});

test('micro: reset aborta deploy', async page => {
  await open(page);
  const r = await engine(page, `svg => {
    const s = new MicroKit.MicroSim(svg, { copies: 2 });
    s.deploy('monolith');
    s.fastForward(1);
    s.reset();
    s.fastForward(8);
    return { deploying: s.deploying(), ghosts: svg.querySelectorAll('.copy.deploying').length, copies: s.copies.length, count: s.deployCount('monolith') };
  }`);
  check(!r.deploying && r.ghosts === 0 && r.copies === 2 && r.count === 0, JSON.stringify(r));
});

test('micro: falla de pagos tira todas las copias', async page => {
  await open(page);
  const r = await engine(page, `svg => {
    const s = new MicroKit.MicroSim(svg, { copies: 3 });
    s.fastForward(2);
    s.crash('pagos');
    s.fastForward(4);
    const a = { up: s.upCopies(), w: s.window(3) };
    s.recover('pagos');
    s.fastForward(4);
    return { a, b: s.window(3), inv: (${INV})(s.window(3)) };
  }`);
  check(r.a.up === 0, `copias arriba=${r.a.up}`);
  check(r.a.w.ok === 0 && r.a.w.err > 0, `ok=${r.a.w.ok} err=${r.a.w.err}`);
  check(r.b.ok > 0, `después de recuperar ok=${r.b.ok}`);
  check(r.inv, 'invariante');
});

test('micro: direct escala solo pagos', async page => {
  await open(page);
  for (const seed of [1, 2, 3]) {
    const r = await engine(page, `(svg, seed) => {
      const s = new MicroKit.MicroSim(svg, Object.assign(${SPIKE}, { topology: 'direct', seed }));
      s.setReplicas('pagos', 3);
      s.fastForward(10);
      return { w: s.window(10), res: s.resources() };
    }`, seed);
    check(r.w.err === 0, `seed ${seed}: err=${r.w.err}`);
    check(r.res === 5, `recursos=${r.res}`);
  }
});

test('micro: deploy de un servicio no toca a los otros', async page => {
  await open(page);
  const r = await engine(page, `svg => {
    const s = new MicroKit.MicroSim(svg, { topology: 'direct' });
    let touched = null;
    s.on('deploy', e => { touched = e.touched; });
    s.deploy('ordenes');
    s.fastForward(6);
    return { touched, o: s.deployCount('ordenes'), u: s.deployCount('usuarios'), err: s.window(6).err };
  }`);
  check(JSON.stringify(r.touched) === '["ordenes"]', `touched=${JSON.stringify(r.touched)}`);
  check(r.o === 1 && r.u === 0, `ordenes=${r.o} usuarios=${r.u}`);
  check(r.err === 0, `err=${r.err}`);
});

test('micro: falla de pagos no tira al resto', async page => {
  await open(page);
  const r = await engine(page, `svg => {
    const s = new MicroKit.MicroSim(svg, { topology: 'direct' });
    s.crash('pagos');
    s.fastForward(1);
    const t0 = s.log.length;
    s.fastForward(5);
    const errPaths = [...new Set(s.log.slice(t0).filter(e => e.status !== 200).map(e => e.path))];
    return { w: s.window(5), errPaths };
  }`);
  check(r.w.byService.usuarios > 0 && r.w.byService.ordenes > 0, `byService=${JSON.stringify(r.w.byService)}`);
  check(r.w.err > 0 && r.errPaths.join() === '/pagos', `errores en ${r.errPaths}`);
});

test('micro: split rompe al cliente viejo', async page => {
  await open(page);
  const r = await engine(page, `svg => {
    const s = new MicroKit.MicroSim(svg, { topology: 'direct' });
    s.split('envios');
    s.fastForward(5);
    const a = s.window(5);
    s.updateClient();
    s.fastForward(1);
    s.fastForward(4);
    return { a, b: s.window(4), inv: (${INV})(s.window(4)) };
  }`);
  check(r.a.e404 > 0, `antes de actualizar e404=${r.a.e404}`);
  check(r.b.e404 === 0 && r.b.byService.envios > 0, `después: e404=${r.b.e404} envios=${r.b.byService.envios}`);
  check(r.inv, 'invariante');
});

test('micro: split repetido se ignora', async page => {
  await open(page);
  const r = await engine(page, `svg => {
    const s = new MicroKit.MicroSim(svg, { topology: 'direct' });
    s.split('envios'); s.split('envios');
    return s.groups.filter(g => g.id === 'envios').length;
  }`);
  check(r === 1, `servicios envios=${r}`);
});

test('micro: appweb arma la página con tres llamadas', async page => {
  await open(page);
  const r = await engine(page, `svg => {
    const s = new MicroKit.MicroSim(svg, { topology: 'appweb' });
    s.fastForward(10);
    const w = s.window(10);
    return { w, inv: (${INV})(w) };
  }`);
  check(r.w.ok > 10, `ok=${r.w.ok}`);
  const pages = r.w.total.ok + r.w.total.err;
  check(Math.abs(r.w.total.calls - 3 * pages) <= 3 * (r.w.inFlight + 1), `calls=${r.w.total.calls} páginas=${pages} enVuelo=${r.w.inFlight}`);
  check(r.inv, `invariante: ${JSON.stringify(r.w)}`);
});

test('micro: se cae la app web, cae todo', async page => {
  await open(page);
  const r = await engine(page, `svg => {
    const s = new MicroKit.MicroSim(svg, { topology: 'appweb' });
    s.fastForward(2);
    s.crash('appweb');
    s.fastForward(4);
    const svcsUp = s.groups.filter(g => g.kind === 'svc').every(g => g.workers.every(w => w.state === 'up'));
    return { w: s.window(3), svcsUp };
  }`);
  check(r.w.ok === 0 && r.w.err > 0, `ok=${r.w.ok} err=${r.w.err}`);
  check(r.svcsUp, 'algún servicio quedó caído');
});

test('micro: separar envíos obliga a deployar la app web', async page => {
  await open(page);
  const r = await engine(page, `svg => {
    const s = new MicroKit.MicroSim(svg, { topology: 'appweb' });
    let touched = null;
    s.on('deploy', e => { touched = e.touched; });
    s.fastForward(2);
    s.split('envios');
    s.fastForward(6);
    return { count: s.deployCount('appweb'), code: s.appwebCode(), touched, w: s.window(7) };
  }`);
  check(r.count === 1, `deploys de la app web=${r.count}`);
  check(r.code.length === 4, `código=${JSON.stringify(r.code)}`);
  check(JSON.stringify(r.touched) === '["appweb"]', `touched=${JSON.stringify(r.touched)}`);
  check(r.w.err === 0 && r.w.e404 === 0, `err=${r.w.err} e404=${r.w.e404}`);
});

/* ---------- escenas ---------- */

const click = (sec, sel) => { const b = sec.querySelector(sel); if (!b) throw new Error('no existe ' + sel); b.click(); };

test('escena 2: el pico da errores y la copia los baja', async page => {
  await open(page);
  const r = await evalScene(page, 2, `sec => {
    const sim = sec._scene.sim;
    (${click})(sec, '[data-act=spike]');
    sim.fastForward(6);
    const a = sim.window(6).err;
    (${click})(sec, '[data-act=add]'); (${click})(sec, '[data-act=add]');
    sim.fastForward(1);
    sim.fastForward(4);
    return { a, b: sim.window(4).err, res: sim.resources(), stat: sec.querySelector('.mstats [data-f=resources]').textContent };
  }`);
  check(r.a > 0, `errores en el pico=${r.a}`);
  check(r.b === 0, `errores con 3 copias=${r.b}`);
  check(r.res === 9 && r.stat === '9', `recursos=${r.res} widget=${r.stat}`);
});

test('escena 3: deploy y falla', async page => {
  await open(page);
  const r = await evalScene(page, 3, `sec => {
    const sim = sec._scene.sim;
    (${click})(sec, '[data-act=deploy]');
    sim.fastForward(10);
    const count = sim.deployCount('monolith'), touched = sec.querySelector('.touched').textContent;
    (${click})(sec, '.seg [data-v=falla]');
    (${click})(sec, '[data-act=crash]');
    sim.fastForward(2);
    return { count, touched, up: sim.upCopies() };
  }`);
  check(r.count === 1, `deploys=${r.count}`);
  check(/Usuarios.*Órdenes.*Pagos/.test(r.touched), `touched=${r.touched}`);
  check(r.up === 0, `copias arriba=${r.up}`);
});

test('escena 4: partir cambia la topología', async page => {
  await open(page);
  const r = await evalScene(page, 4, `sec => {
    const sim = sec._scene.sim;
    const before = sim.o.topology;
    (${click})(sec, '[data-act=split]');
    sim.fastForward(3);
    const after = { topo: sim.o.topology, svcs: sim.groups.filter(g => g.kind === 'svc').length, ok: sim.window(2).ok };
    (${click})(sec, '[data-act=reset]');
    return { before, after, back: sim.o.topology };
  }`);
  check(r.before === 'monolith' && r.back === 'monolith', `antes=${r.before} después de ↺=${r.back}`);
  check(r.after.topo === 'direct' && r.after.svcs === 3 && r.after.ok > 0, JSON.stringify(r.after));
});

test('escena 5: falla aislada', async page => {
  await open(page);
  const r = await evalScene(page, 5, `sec => {
    const sim = sec._scene.sim;
    (${click})(sec, '[data-act=crash]');
    sim.fastForward(1);
    sim.fastForward(5);
    const w = sim.window(5);
    (${click})(sec, '[data-act=scale]');
    return { w, reps: sim.replicas('pagos') };
  }`);
  check(r.w.byService.usuarios > 0 && r.w.byService.ordenes > 0, JSON.stringify(r.w.byService));
  check(r.w.err > 0, `err=${r.w.err}`);
  check(r.reps === 2, `réplicas de pagos=${r.reps}`);
});

test('escena 6: separar sin actualizar da errores', async page => {
  await open(page);
  const r = await evalScene(page, 6, `sec => {
    const sim = sec._scene.sim;
    (${click})(sec, '[data-act=split]');
    sim.fastForward(5);
    const a = sim.window(5).e404;
    (${click})(sec, '[data-act=update]');
    sim.fastForward(1);
    sim.fastForward(4);
    return { a, b: sim.window(4).e404, hosts: sec.querySelector('svg.sim').textContent.includes('envios.tienda.com') };
  }`);
  check(r.a > 0, `404 antes de actualizar=${r.a}`);
  check(r.b === 0, `404 después=${r.b}`);
  check(r.hosts, 'falta la dirección de envíos');
});

test('escena 7: el código de la app web se ve', async page => {
  await open(page);
  const r = await evalScene(page, 7, `sec => sec.querySelector('.code').textContent`);
  check(/usuarios/.test(r) && /ordenes/.test(r) && /pagos/.test(r), `código=${r}`);
});

test('escena 8: separar cuesta un deploy, tirar corta todo', async page => {
  await open(page);
  const r = await evalScene(page, 8, `sec => {
    const sim = sec._scene.sim;
    sim.fastForward(2);
    (${click})(sec, '[data-act=split]');
    sim.fastForward(6);
    const a = { count: sim.deployCount('appweb'), err: sim.window(6).err, code: sec.querySelector('.code').textContent };
    (${click})(sec, '[data-act=crash]');
    sim.fastForward(3);
    return { a, ok: sim.window(2).ok };
  }`);
  check(r.a.count === 1 && r.a.err === 0, JSON.stringify(r.a));
  check(/envios/.test(r.a.code), `código=${r.a.code}`);
  check(r.ok === 0, `ok con la app web caída=${r.ok}`);
});

test('slides: ninguna visible nombra proxy ni gateway', async page => {
  await open(page);
  const t = await page.evaluate(() => [...document.querySelectorAll('.slides > section')].map(s => {
    const c = s.cloneNode(true);
    c.querySelectorAll('aside.notes').forEach(n => n.remove());
    return c.textContent;
  }).join(' '));
  const m = t.match(/proxy|gateway/i);
  check(!m, `aparece "${m && m[0]}"`);
});

test('micro: lo que estaba en proceso al caer termina como error', async page => {
  await open(page);
  const r = await engine(page, `svg => {
    const out = {};
    for (const [topo, target] of [['monolith', 'pagos'], ['appweb', 'pagos']]) {
      const s = new MicroKit.MicroSim(svg, { topology: topo, rate: 6 });
      s.fastForward(2);
      s.crash(target);
      s.setRate(0);
      s.fastForward(10);
      const w = s.window(30);
      out[topo] = { inFlight: w.inFlight, err: w.total.err, active: s.groups.flatMap(g => g.workers).reduce((a, x) => a + x.active, 0) };
    }
    return out;
  }`);
  for (const [k, v] of Object.entries(r)) check(v.inFlight === 0 && v.active === 0 && v.err > 0, `${k}: ${JSON.stringify(v)}`);
});

test('micro: quitar una copia ocupada no deja pedidos colgados', async page => {
  await open(page);
  const r = await engine(page, `svg => {
    const s = new MicroKit.MicroSim(svg, { rate: 8, copies: 3 });
    s.fastForward(2);
    s.removeCopy(); s.removeCopy();
    s.setRate(0);
    s.fastForward(10);
    return s.window(30).inFlight;
  }`);
  check(r === 0, `en vuelo=${r}`);
});

test('escena 7: cuenta las llamadas internas', async page => {
  await open(page);
  const r = await evalScene(page, 7, `sec => {
    const sim = sec._scene.sim;
    sim.fastForward(5);
    return { w: sim.window(5).calls, txt: sec.querySelector('.mstats [data-f=calls]').textContent };
  }`);
  check(r.w > 0 && /^\d+$/.test(r.txt) && +r.txt > 0, JSON.stringify(r));
});

test('celular: las direcciones no se pisan con cuatro servicios', async page => {
  await open(page, 0, true);
  const r = await engine(page, `svg => {
    const s = new MicroKit.MicroSim(svg, { topology: 'direct' });
    s.split('envios');
    s.fastForward(1);
    const b = [...svg.querySelectorAll('.t-host')].map(t => t.getBBox());
    const hits = [];
    for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
      const A = b[i], B = b[j];
      if (A.x < B.x + B.width && B.x < A.x + A.width && A.y < B.y + B.height && B.y < A.y + A.height) hits.push([i, j]);
    }
    const out = b.filter(x => x.x < 0 || x.x + x.width > 400).length;
    return { n: b.length, hits, out };
  }`);
  check(r.n === 4 && !r.hits.length && !r.out, JSON.stringify(r));
});

/* ---------- runner ---------- */

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  let fails = 0, ran = 0;
  for (const t of tests.filter(t => t.name.includes(filter))) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.evaluateOnNewDocument(() => {
      window.__sec = i => document.querySelectorAll('.reveal .slides > section')[i];
    });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    ran++;
    try {
      await t.fn(page, errors);
      check(errors.length === 0, `errores de consola: ${errors.join(' | ')}`);
      console.log(`  ok   ${t.name}`);
    } catch (e) {
      fails++;
      console.log(`  FAIL ${t.name}\n       ${e.message.split('\n')[0]}`);
    }
    await page.close();
  }
  console.log(`${ran - fails}/${ran} ok`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})();

module.exports = { open, goto, evalScene, engine, check, sleep };
