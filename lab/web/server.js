// La app web de tienda.com: el cliente le habla sólo a ella, y ella llama a cada servicio
// y arma la página. Todo lo que sabe de los servicios está escrito acá, en código: dónde
// está cada uno y qué llamadas hace cada página. Un cambio atrás = cambiar esto y deployarla.
const http = require('node:http');
const dns = require('node:dns').promises;

// Direcciones internas de los servicios (sólo la app web las conoce).
const SERVICIOS = {
  usuarios: 'usuarios:3000',
  ordenes: 'ordenes:3000',
  pagos: 'pagos:3000',
  // ✂ Separar Envíos (1/2): descomentá esta línea…
  // envios: 'envios:3000',
};

const log = (...a) => console.log('[app web]', ...a);

const MOTIVOS = {
  ENOTFOUND: 'no hay ninguna réplica levantada',
  ECONNREFUSED: 'conexión rechazada: está caído o arrancando',
  UND_ERR_SOCKET: 'cortó la conexión sin responder',
  ECONNRESET: 'cortó la conexión sin responder',
  TimeoutError: 'no contestó a tiempo',
};

// Llama a un servicio. Si tiene varias réplicas, las reparte en round robin: también
// eso lo hace la app web con código.
const turno = {};
async function llamar(servicio, path) {
  const t0 = Date.now();
  const [host, port] = SERVICIOS[servicio].split(':');
  try {
    const ips = await dns.lookup(host, { all: true });
    const ip = ips[(turno[servicio] = (turno[servicio] || 0) + 1) % ips.length].address;
    const r = await fetch(`http://${ip}:${port}${path}`, { signal: AbortSignal.timeout(3000) });
    const texto = (await r.text()).trim();
    return { servicio, ok: r.ok, status: r.status, texto, quien: r.headers.get('x-servidor'), ms: Date.now() - t0 };
  } catch (e) {
    const codigo = e.code || e.cause?.code || e.name;
    const motivo = MOTIVOS[codigo] || codigo;
    return { servicio, ok: false, status: 502, texto: `⚠ ${servicio} no respondió (${motivo})`, ms: Date.now() - t0 };
  }
}

function pagina(res, titulo, partes, t0) {
  const cuerpo = partes.map((p) => `  ${p.ok ? '✓' : '✗'} ${p.texto}`).join('\n');
  log(`${titulo} → ${partes.map((p) => `${p.servicio} ${p.status} (${p.ms} ms)`).join(', ')} → página en ${Date.now() - t0} ms`);
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Servidor': 'app web' });
  res.end(`tienda.com · ${titulo} (armada en ${Date.now() - t0} ms con ${partes.length} llamadas)\n${cuerpo}\n`);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const t0 = Date.now();
  let m;

  // Página de inicio: tres llamadas en paralelo, una por servicio.
  if (url.pathname === '/') {
    const partes = await Promise.all([
      llamar('usuarios', '/usuarios/yo'),
      llamar('ordenes', '/ordenes/ultimas'),
      llamar('pagos', '/pagos/medios'),
    ]);
    return pagina(res, 'inicio', partes, t0);
  }

  // Página de una orden: la orden, su envío y su pago.
  if ((m = /^\/orden\/(\d+)$/.exec(url.pathname))) {
    const id = m[1];
    const partes = await Promise.all([
      llamar('ordenes', `/ordenes/${id}`),
      llamar('ordenes', `/ordenes/envios/${id}`),
      // ✂ Separar Envíos (2/2): …y cambiá la línea de arriba por esta.
      // llamar('envios', `/ordenes/envios/${id}`),
      llamar('pagos', `/pagos/orden/${id}`),
    ]);
    return pagina(res, `orden #${id}`, partes, t0);
  }

  // Pagar: una sola llamada, a Pagos. La respuesta dice qué réplica cobró.
  if (url.pathname === '/pagar') {
    const p = await llamar('pagos', `/pagos/cobrar${url.search}`);
    log(`pagar → ${p.quien || 'pagos'} ${p.status} (${p.ms} ms)`);
    res.writeHead(p.status, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Servidor': p.quien || 'app web' });
    return res.end(`tienda.com · pagar: ${p.texto}\n`);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 de la app web. Páginas: /  ·  /orden/7  ·  /pagar\n');
}).listen(3000, () => log(`arranqué; conozco a ${Object.keys(SERVICIOS).join(', ')}`));

process.on('SIGTERM', () => process.exit(0));
