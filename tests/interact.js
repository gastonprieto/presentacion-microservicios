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
