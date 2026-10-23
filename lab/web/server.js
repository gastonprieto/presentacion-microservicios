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

// Orquestar: hace las llamadas de una página y junta las partes. Dos decisiones que también son código:
//   ?serie=1          una llamada detrás de otra (sin esto, todas a la vez: tarda lo del servicio más lento)
//   ?si-falta=fallar  si falta una parte, la página entera falla con 502 (sin esto, sale con el hueco).
//                     En serie corta en la primera falla: las que siguen ni se llaman.
async function orquestar(llamadas, url) {
  const serie = url.searchParams.get('serie') === '1';
  const fallar = url.searchParams.get('si-falta') === 'fallar';
  if (!serie) return Promise.all(llamadas.map(([servicio, path]) => llamar(servicio, path)));
  const partes = [];
  for (const [servicio, path] of llamadas) {
    if (fallar && partes.some((p) => !p.ok)) partes.push({ servicio, ok: false, status: '—', texto: `${servicio}: no se llamó`, ms: 0, salteada: true });
    else partes.push(await llamar(servicio, path));
  }
  return partes;
}

function pagina(res, url, titulo, partes, t0) {
  const fallar = url.searchParams.get('si-falta') === 'fallar';
  const modo = url.searchParams.get('serie') === '1' ? 'en serie' : 'en paralelo';
  const llamadas = partes.filter((p) => !p.salteada).length;
  const ms = Date.now() - t0;
  const cuerpo = partes.map((p) => `  ${p.salteada ? '–' : p.ok ? '✓' : '✗'} ${p.texto}`).join('\n');
  log(`${titulo} (${modo}) → ${partes.map((p) => `${p.servicio} ${p.status} (${p.ms} ms)`).join(', ')} → página en ${ms} ms`);
  const code = fallar && partes.some((p) => !p.ok) ? 502 : 200;
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Servidor': 'app web' });
  if (code === 502) return res.end(`tienda.com · ${titulo}: 502, no pudimos cargar la página (${modo}, ${ms} ms, ${llamadas} llamadas)\n${cuerpo}\n`);
  res.end(`tienda.com · ${titulo} (armada en ${ms} ms con ${llamadas} llamadas ${modo})\n${cuerpo}\n`);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const t0 = Date.now();
  let m;

  // Página de inicio: una llamada por servicio.
  if (url.pathname === '/') {
    const partes = await orquestar([
      ['usuarios', '/usuarios/yo'],
      ['ordenes', '/ordenes/ultimas'],
      ['pagos', '/pagos/medios'],
    ], url);
    return pagina(res, url, 'inicio', partes, t0);
  }

  // Página de una orden: la orden, su envío y su pago.
  if ((m = /^\/orden\/(\d+)$/.exec(url.pathname))) {
    const id = m[1];
    const partes = await orquestar([
      ['ordenes', `/ordenes/${id}`],
      ['ordenes', `/ordenes/envios/${id}`],
      // ✂ Separar Envíos (2/2): …y cambiá la línea de arriba por esta.
      // ['envios', `/ordenes/envios/${id}`],
      ['pagos', `/pagos/orden/${id}`],
    ], url);
    return pagina(res, url, `orden #${id}`, partes, t0);
  }

  // Pagar: una sola llamada, a Pagos. La respuesta dice qué réplica cobró.
  if (url.pathname === '/pagar') {
    const p = await llamar('pagos', `/pagos/cobrar${url.search}`);
    log(`pagar → ${p.quien || 'pagos'} ${p.status} (${p.ms} ms)`);
    res.writeHead(p.status, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Servidor': p.quien || 'app web' });
    return res.end(`tienda.com · pagar: ${p.texto}\n`);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 de la app web. Páginas: /  ·  /orden/7  ·  /pagar   (opciones: ?serie=1  ·  ?si-falta=fallar)\n');
}).listen(3000, () => log(`arranqué; conozco a ${Object.keys(SERVICIOS).join(', ')}`));

process.on('SIGTERM', () => process.exit(0));
