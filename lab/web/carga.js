// Generador de carga: manda pedidos con N conexiones en paralelo y muestra
// cuántos atendió cada servidor, los códigos de respuesta y p50/p95/p99.
//   node carga.js <url> [-c concurrencia] [-n pedidos] [-d segundos]
// Con -d corre esa cantidad de segundos e imprime una línea por segundo.
const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith('http'));
const opt = (k, def) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : def; };
const C = opt('-c', 10);
const D = opt('-d', 0);
const N = D ? Infinity : opt('-n', 200);
if (!url) { console.error('uso: node carga.js <url> [-c 10] [-n 200 | -d 30]'); process.exit(1); }

const total = { ok: 0, s5xx: 0, otros: 0, err: 0, lat: [], porServidor: {} };
let seg = { ok: 0, s5xx: 0, err: 0, porServidor: {} };
let enviados = 0;
const t0 = Date.now();
const fin = D ? t0 + D * 1000 : Infinity;

async function uno() {
  const t = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    await r.text();
    const s = r.headers.get('x-servidor') || 'LB';
    total.lat.push(Date.now() - t);
    for (const o of [total, seg]) o.porServidor[s] = (o.porServidor[s] || 0) + 1;
    if (r.status < 400) { total.ok++; seg.ok++; } else if (r.status >= 500) { total.s5xx++; seg.s5xx++; } else total.otros++;
  } catch {
    total.err++; seg.err++;
  }
}

async function bucle() {
  while (enviados < N && Date.now() < fin) { enviados++; await uno(); }
}

const fmt = (p) => Object.entries(p).sort().map(([k, v]) => `${k}:${v}`).join('  ') || '-';
const tic = D && setInterval(() => {
  const s = Math.round((Date.now() - t0) / 1000);
  console.log(`t=${String(s).padStart(3)}s  ok ${String(seg.ok).padStart(4)}  5xx ${String(seg.s5xx).padStart(3)}  sin conexión ${String(seg.err).padStart(3)}  │ ${fmt(seg.porServidor)}`);
  seg = { ok: 0, s5xx: 0, err: 0, porServidor: {} };
}, 1000);

console.log(`→ ${url} · ${C} en paralelo · ${D ? D + ' s' : N + ' pedidos'}`);
Promise.all(Array.from({ length: C }, bucle)).then(() => {
  clearInterval(tic);
  const l = total.lat.sort((a, b) => a - b);
  const p = (q) => l.length ? l[Math.min(l.length - 1, Math.floor(q * l.length))] : '-';
  console.log('\nPor servidor:   ' + fmt(total.porServidor));
  console.log(`Respuestas:     ok ${total.ok} · 5xx ${total.s5xx} · 4xx ${total.otros} · sin conexión ${total.err}`);
  console.log(`Latencia (ms):  p50 ${p(0.5)} · p95 ${p(0.95)} · p99 ${p(0.99)} · máx ${l.at(-1) ?? '-'}`);
});
