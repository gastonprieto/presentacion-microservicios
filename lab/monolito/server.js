// El monolito de tienda.com: Usuarios, Órdenes y Pagos son módulos del mismo programa.
// Comparten el proceso y la capacidad: WORKERS pedidos en paralelo y una cola de COLA;
// si se llena, 503 para cualquier ruta (aunque el que la llenó sea un solo módulo).
const http = require('node:http');
const os = require('node:os');

const VERSION = process.env.VERSION || 'v1';
const WORKERS = Number(process.env.WORKERS || 4);
const COLA = Number(process.env.COLA || 10);
const ARRANQUE_MS = Number(process.env.ARRANQUE_MS || 5000); // lo que tarda en arrancar (cargar código, conectarse, etc.)
const copia = os.hostname().slice(0, 6);
let enCurso = 0;
const espera = [];

const log = (...a) => console.log(`[monolito ${copia}]`, ...a);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Módulo Usuarios ----------
const usuarios = {
  ms: 50,
  atender: (path) => `Usuarios: datos de ${path}`,
};

// ---------- Módulo Órdenes ----------
const ordenes = {
  ms: 100,
  atender: (path) => (path.startsWith('/ordenes/envios') ? `Órdenes: seguimiento del envío ${path}` : `Órdenes: listado de ${path}`),
};

// ---------- Módulo Pagos ----------
const pagos = {
  ms: 300,
  atender: (path, query) => {
    // 🐛 Bug: una tarjeta rara tira una excepción que nadie atrapa y tira el proceso
    // entero, con los tres módulos adentro, sin llegar a responder.
    if (query.get('tarjeta') === 'rota') throw new Error('Pagos: tarjeta inesperada');
    return `Pagos: cobro procesado en ${path}`;
  },
};

const MODULOS = { usuarios, ordenes, pagos };

function ocupar() {
  if (enCurso < WORKERS) { enCurso++; return Promise.resolve(); }
  if (espera.length >= COLA) return null;
  return new Promise((resolve) => espera.push(resolve));
}
function liberar() {
  const siguiente = espera.shift();
  if (siguiente) siguiente(); else enCurso--;
}

function responder(res, code, texto) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Servidor': `monolito ${copia}` });
  res.end(texto + '\n');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') return responder(res, 200, 'ok');
  const modulo = MODULOS[url.pathname.split('/')[1]];
  if (!modulo) return responder(res, 404, `monolito: no conozco ${url.pathname}`);

  const lugar = ocupar();
  if (!lugar) {
    log(`503 ${url.pathname}: ${WORKERS} ocupados y ${COLA} en cola (lo comparten los tres módulos)`);
    return responder(res, 503, `monolito ${copia}: saturado (503)`);
  }
  const t0 = Date.now();
  await lugar;
  await dormir(modulo.ms);
  liberar();
  const texto = modulo.atender(url.pathname, url.searchParams);
  log(`${req.method} ${url.pathname} · ${Date.now() - t0} ms · en curso ${enCurso}/${WORKERS} · en cola ${espera.length}`);
  responder(res, 200, `${texto} · monolito ${VERSION}, copia ${copia} · ${Date.now() - t0} ms`);
});
log(`arrancando… (${ARRANQUE_MS / 1000} s)`);
setTimeout(() => server.listen(3000, () => log(`arranqué ${VERSION} con los módulos ${Object.keys(MODULOS).join(', ')}`)), ARRANQUE_MS);

process.on('SIGTERM', () => process.exit(0));
