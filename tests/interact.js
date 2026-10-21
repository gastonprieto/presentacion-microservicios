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

/* ---------- escenas ---------- */

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
