// Un servicio de tienda.com. Usuarios, Órdenes, Pagos y Envíos son este mismo código con
// otra configuración: cada uno es un programa aparte, con su capacidad, su deploy y sus réplicas.
//   NOMBRE        nombre del servicio
//   PREFIJO       rutas que atiende (lo demás → 404 del servicio)
//   NO_ATIENDE    rutas que dejó de atender (por ejemplo, Órdenes después de separar Envíos)
//   WORK_MS       lo que tarda cada pedido
const http = require('node:http');
const os = require('node:os');

const VERSION = process.env.VERSION || 'v1';
const NOMBRE = process.env.NOMBRE;
const PREFIJO = process.env.PREFIJO;
const NO_ATIENDE = process.env.NO_ATIENDE || '';
const WORK_MS = Number(process.env.WORK_MS || 100);
const WORKERS = Number(process.env.WORKERS || 4);
const COLA = Number(process.env.COLA || 10);
const ARRANQUE_MS = Number(process.env.ARRANQUE_MS || 5000); // lo que tarda en arrancar (cargar código, conectarse, etc.)
const replica = os.hostname().slice(0, 6);
let enCurso = 0;
const espera = [];

const log = (...a) => console.log(`[${NOMBRE} ${replica}]`, ...a);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

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
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Servidor': `${NOMBRE} ${replica}` });
  res.end(texto + '\n');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;
  if (path === '/health') return responder(res, 200, 'ok');
  const mio = path.startsWith(PREFIJO) && !(NO_ATIENDE && path.startsWith(NO_ATIENDE));
  if (!mio) {
    log(`404 ${path}: no es mío`);
    return responder(res, 404, `404 de ${NOMBRE}: no conozco ${path}`);
  }

  const lugar = ocupar();
  if (!lugar) {
    log(`503 ${path}: ${WORKERS} ocupados y ${COLA} en cola`);
    return responder(res, 503, `${NOMBRE} ${replica}: saturado (503)`);
  }
  const t0 = Date.now();
  await lugar;
  await dormir(WORK_MS);
  liberar();
  // 🐛 El mismo bug que en el monolito: una tarjeta rara tira el proceso sin responder…
  // pero acá el proceso es sólo Pagos.
  if (url.searchParams.get('tarjeta') === 'rota') throw new Error(`${NOMBRE}: tarjeta inesperada`);
  log(`${req.method} ${path} · ${Date.now() - t0} ms · en curso ${enCurso}/${WORKERS} · en cola ${espera.length}`);
  responder(res, 200, `${NOMBRE}: ${path} · ${VERSION}, réplica ${replica} · ${Date.now() - t0} ms`);
});
log(`arrancando… (${ARRANQUE_MS / 1000} s)`);
setTimeout(() => server.listen(3000, () => log(`arranqué ${VERSION}: atiendo ${PREFIJO}${NO_ATIENDE ? ' salvo ' + NO_ATIENDE : ''}`)), ARRANQUE_MS);

process.on('SIGTERM', () => process.exit(0));
