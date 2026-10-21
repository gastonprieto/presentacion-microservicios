# Presentación de microservicios — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la presentación interactiva "De un monolito a muchos servicios" (9-10 slides con demos) que precede a proxy reverso, y agregar a proxy reverso un puente liviano. Todo queda local para que el autor lo revise.

**Architecture:** Se copia `presentaciones-guideline/template`, que trae reveal.js, NetKit (`js/sim.js`), widgets, `main.js` y el tema. Se suma un motor propio, `js/micro.js` (`window.MicroKit`), con una sola clase `MicroSim` y tres topologías: `monolith` (cliente → LB → copias del monolito con módulos adentro), `direct` (cliente → un host por servicio) y `appweb` (cliente → app web → servicios). Las escenas de `js/scenes.js` usan `MicroSim` y el widget `Widgets.mstats`. Las pruebas de motor y escenas van en `tests/interact.js`, con el mismo arnés que proxy reverso.

**Tech Stack:** reveal.js 5.1.0, GSAP 3.12.5 y Chart.js 4.4.1 (en `vendor/`), SVG, JS clásico con globals, puppeteer-core (desde `presentaciones-guideline/tools`) y Chrome del sistema.

**Spec:** `docs/superpowers/specs/2026-10-21-microservicios-design.md`

## Global Constraints

- Se abre con doble clic: sin build, sin CDN y sin ES modules (`type="module"` falla con `file://`). Orden de scripts: reveal → notes → gsap → chart → `sim.js` → `micro.js` → `widgets.js` → `scenes.js` → `main.js`.
- Todo el texto visible y las notas van en español. Cada slide lleva kicker + `<h2>` + `<aside class="notes">` con guion y una "Pregunta para la clase:".
- Vocabulario de la serie: host `tienda.com`, servicios `Usuarios 👤`, `Órdenes 🧾`, `Pagos 💳` y el extra `Envíos 📦`. Colores de ruta: `/usuarios` `#60a5fa`, `/ordenes` `#fb923c`, `/pagos` `#2dd4bf`, `/ordenes/envios` `#a3e635`.
- Lienzo reveal de 1280×720 y panel de 566px de alto: no puede desbordar. Los botones van en `.actions`, nunca en `.controls`.
- Hay dos versiones, escritorio y `html.mobile` (`?mobile=1`). Todo cambio visual se prueba en las dos.
- Un deploy **nunca** se muestra como caída: es gradual, copia por copia, y siempre queda al menos una copia atendiendo. Las fallas (`crash`) **sí** son caídas reales.
- Esta presentación no nombra "proxy reverso" ni "API gateway" en slides visibles. El cierre es una pregunta.
- **No publicar**: no se crea el repo remoto, no hay `git push` y no se activa Pages. El último paso es abrir `index.html` local para que el autor lo revise.
- Commits chicos, uno por tarea, con mensajes en español como en proxy reverso.

## Review Focus

- **Velocidad 🐢/🐇 o pausa al cambiar de slide durante un deploy o un split:** el deploy tiene que terminar igual al volver y nunca dejar todas las copias abajo. → prueba `micro: deploy sobrevive a stop/start` (Tarea 3).
- **Doble clic en un botón de acción (deploy, crash, split) mientras la anterior sigue en curso:** se ignora, sin estados duplicados. → prueba `micro: deploy repetido se ignora` (Tarea 3) y `micro: split repetido se ignora` (Tarea 4).
- **Reset (↺) a mitad de un script async:** no quedan timers ni nodos fantasmas. → prueba `micro: reset aborta deploy` (Tarea 3).
- **Quitar copias o réplicas hasta el mínimo:** nunca baja de 1 y el invariante de conteo sigue valiendo. → prueba `micro: mínimo una copia` (Tarea 2).
- **Celular, slides con fan-out (7, 8):** el diagrama vertical no se superpone y los botones responden al toque. → revisión de capturas de `mobile.js` (Tarea 8).

---

### Tarea 1: Base del proyecto

**Files:**
- Create: todo `presentaciones-guideline/template/*` copiado a `presentacion-microservicios/` (conservando `docs/`)
- Create: `tests/interact.js`, con el arnés copiado de `presentacion-proxy-reverso/tests/interact.js` líneas 1-46 y el runner final (desde `evaluateOnNewDocument` hasta el final), sin las pruebas de RouteKit
- Modify: `index.html`, `CLAUDE.md`; Create: `README.md`

**Interfaces:**
- Produces: un `index.html` con 10 `<section>` (índices 0-9), con los títulos de la tabla de abajo. Las slides 1-8 llevan `data-scene` con nombres fijos: `monolith`, `scale`, `limits`, `split`, `gains`, `direct`, `appweb`, `cracks`. Por ahora son placeholders con kicker, título y notas; las escenas en `scenes.js` arrancan como `S.x = slide => ({ start(){}, stop(){} })`.

| idx | data-scene | kicker · título |
|---|---|---|
| 0 | `title` (del template) | "De un monolito a muchos servicios" |
| 1 | `monolith` | Punto de partida · Una app, una dirección |
| 2 | `scale` | Límite · Se satura una parte, escalás todo |
| 3 | `limits` | Límite · Cambiás una parte, deployás todo |
| 4 | `split` | Partir · Cada parte, su propio servicio |
| 5 | `gains` | Ganancia · Escalar, deployar y fallar por separado |
| 6 | `direct` | El costo · El cliente conoce tres direcciones |
| 7 | `appweb` | Una sola dirección · Una app web que habla por todos |
| 8 | `cracks` | Grietas · La app web se volvió un mini-monolito |
| 9 | — | Cierre · Lo que nos llevamos |

- [ ] **Paso 1:** copiar el template (`cp -R presentaciones-guideline/template/. presentacion-microservicios/`), `git init`, commit "Commit inicial" vacío y después commit "Base de la presentación desde el template".
- [ ] **Paso 2:** `index.html` con las 10 secciones de la tabla, `<title>Microservicios</title>` y el `<script src="js/micro.js">` en su orden (por ahora un archivo con `window.MicroKit = {}`). Borrar las slides y escenas de ejemplo, incluida `S.manual`. `CLAUDE.md`: tema y audiencia ("alumnos que ya vieron load balancing; precede a proxy reverso"), con la sección Arquitectura apuntando a `MicroKit`. `README.md` con la estructura del de proxy reverso, sin la línea "Verla:".
- [ ] **Paso 3:** `tests/interact.js` con la prueba `base: carga sin errores de consola` (copiada).
- [ ] **Paso 4:** correr `node tests/interact.js`, `cd ../presentaciones-guideline/tools && node smoke.js ../../presentacion-microservicios && node mobile.js ../../presentacion-microservicios`. Esperado: todo pasa y salen 10 capturas.
- [ ] **Paso 5:** commit "Esqueleto de slides".

### Tarea 2: MicroKit, topología monolito y escalado

**Files:**
- Modify: `js/micro.js`
- Test: `tests/interact.js` (sección `/* ---------- motor MicroKit ---------- */`)

**Interfaces:**
- Consumes: `window.NetKit` = `{ Clock, Speed, svgEl, cubic, curve, edge, pop, C, MOBILE, W, H }`. El patrón es el de `RouteKit` en `presentacion-proxy-reverso/js/route.js`: hay que leerlo y copiar `rng`, `_fly`, `_pop`, `on/emit`, `reset`, `window` y `fastForward`.
- Produces: `window.MicroKit = { MicroSim, ROUTE_COLORS, SERVICES }`
  - `new MicroSim(svg, opts)`. Los `opts` y sus defaults son `{ topology: 'monolith', seed: 1, rate: 3, mix: { '/usuarios': 1, '/ordenes': 1, '/pagos': 1 }, copies: 1, capacity: 2, maxQueue: 6, workTime: { '/usuarios': 0.4, '/ordenes': 0.4, '/pagos': 0.4 }, services: null, host: 'tienda.com', travel: 0.35 }`.
  - `SERVICES`: `[{ id:'usuarios', label:'Usuarios', icon:'👤', serves:['/usuarios'] }, { id:'ordenes', label:'Órdenes', icon:'🧾', serves:['/ordenes'] }, { id:'pagos', label:'Pagos', icon:'💳', serves:['/pagos'] }]`.
  - `setRate(r)`, `setMix(path, weight)`, `setWork(path, sec)`, `addCopy()`, `removeCopy()` (con mínimo 1), `resources() → number`. En el monolito, los recursos son copias × 3 (cada copia carga los 3 módulos).
  - `window(sec) → { sent, ok, err, inFlight, byPath: {path: n} }` con el invariante `sent === ok + err + inFlight`. Un pedido que llega a una copia con la cola llena (`> maxQueue`) es `err` (503).
  - `fastForward(sec)`, `reset(opts)`, `start()`, `stop()`, `on('tick'|'reset'|'change', fn)`, `gen` (se incrementa en cada reset).
  - Dibujo: el monolito es una caja con los 3 módulos como franjas de color adentro. Una copia se ve como otra caja igual, y el LB aparece solo si `copies > 1`.

- [ ] **Paso 1: escribir las pruebas que fallan**
  - `micro: monolito atiende` → con `rate:3`, `fastForward(10)`, `window(10)`: `ok > 20`, `err === 0` y se cumple el invariante.
  - `micro: pico en /pagos satura una copia` → con `rate:8`, `mix {'/pagos':6,...1,1}`, `workTime['/pagos']=0.8` y `copies:1`: `err > 0`.
  - `micro: más copias absorben el pico, pero cuestan todo` → igual que la anterior pero con `copies:3`: `err === 0` y `resources() === 9`.
  - `micro: mínimo una copia` → `removeCopy()` ×3 desde 1: hay 1 copia y se cumple el invariante después de `fastForward(5)`.
- [ ] **Paso 2:** `node tests/interact.js micro:` → FAIL (`MicroSim is not a constructor`).
- [ ] **Paso 3:** implementar la topología `monolith` en `js/micro.js`. Cada copia tiene `capacity` slots de trabajo concurrentes y una cola FIFO; el LB reparte round robin entre las copias `up`. Calibrar los números del pico para que las pruebas 2 y 3 pasen con 3 semillas distintas (1, 2, 3).
- [ ] **Paso 4:** `node tests/interact.js micro:` → PASS.
- [ ] **Paso 5:** commit "Motor MicroKit: monolito y escalado por copias".

### Tarea 3: deploy gradual y caída en el monolito

**Files:** Modify `js/micro.js`; Test `tests/interact.js`

**Interfaces:**
- Produces:
  - `deploy(target) → Promise<void>`. En `monolith`, `target` es `'monolith'`: saca de a una copia (estado `deploying`, el LB no le manda, 1.5 s simulados por copia) y la vuelve a poner. Emite `'deploy'` con `{ target, touched }`, donde `touched` es la lista de módulos redeployados (`['usuarios','ordenes','pagos']` en el monolito). Mientras haya un deploy en curso, otro `deploy()` devuelve la misma Promise.
  - `deploying() → boolean`, `deployCount(target) → number`.
  - `crash(target)` / `recover(target)`. En `monolith`, `crash('pagos')` deja **todas** las copias en `down`, porque todas corren el mismo código, y los pedidos dan `err`. `recover` las levanta.
  - `upCopies() → number`.

- [ ] **Paso 1: pruebas que fallan**
  - `micro: deploy del monolito toca todo y no corta` → `copies:3`, se lanza `deploy('monolith')` y `fastForward(8)`. Muestreando `upCopies()` en cada tick: mínimo ≥ 2. Además `touched` del evento = los 3 módulos y `deployCount('monolith') === 1`.
  - `micro: deploy repetido se ignora` → dos `deploy('monolith')` seguidos dan la misma Promise y `deployCount === 1`.
  - `micro: deploy sobrevive a stop/start` → `deploy`, `stop()`, `start()`, `fastForward(8)`: termina y `upCopies() === copies`.
  - `micro: reset aborta deploy` → `deploy` y después `reset()`: `deploying() === false` y no hay elementos `.copy.deploying` en el SVG.
  - `micro: falla de pagos tira todas las copias` → `copies:3`, `crash('pagos')` y `fastForward(4)`: `upCopies() === 0` y en `window(3)` hay `ok === 0` y `err > 0`. Después de `recover('pagos')`, `fastForward(4)` da `ok > 0`.
- [ ] **Paso 2:** correr → FAIL.
- [ ] **Paso 3:** implementar. Los scripts async comparan `this.gen` antes y después de cada `await` (patrón de `Sim` en NetKit).
- [ ] **Paso 4:** correr → PASS.
- [ ] **Paso 5:** commit "MicroKit: deploy gradual y caída del monolito".

### Tarea 4: topología direct (servicios separados, N direcciones)

**Files:** Modify `js/micro.js`; Test `tests/interact.js`

**Interfaces:**
- Produces:
  - `topology:'direct'`: el cliente llama a `usuarios.tienda.com`, `ordenes.tienda.com` y `pagos.tienda.com`, con una flecha por host (etiqueta con el host). Cada servicio tiene `replicas` (default 1) y, si tiene más de 1, su propio mini-LB.
  - `setReplicas(id, n)` con mínimo 1. `resources()` = suma de réplicas.
  - `deploy(id)`: gradual, solo ese servicio, con `touched = [id]`. `crash(id)` / `recover(id)`: solo ese servicio.
  - `split('envios')`: crea el servicio Envíos (`envios.tienda.com`) y desde ese momento `/ordenes/envios` (que entra al mix con peso 1) ya no lo atiende Órdenes. Un cliente con `clientVersion === 1` sigue llamando a `ordenes.tienda.com/ordenes/envios`, que da `err` (404, pop sobre Órdenes). `updateClient()` pasa a `clientVersion 2` y desde ahí va a `envios.tienda.com`. `split` repetido no hace nada.
  - `window()` agrega `byService` y `e404`.

- [ ] **Paso 1: pruebas que fallan**
  - `micro: direct escala solo pagos` → mismo pico que en la Tarea 2, con `setReplicas('pagos',3)`: `err === 0` y `resources() === 5` (contra 9 del monolito).
  - `micro: deploy de un servicio no toca a los otros` → `deploy('ordenes')`: `touched` es `['ordenes']` y `deployCount('usuarios') === 0`.
  - `micro: falla de pagos no tira al resto` → `crash('pagos')` y `fastForward(5)`: `byService.usuarios > 0`, `byService.ordenes > 0` y hay `err` solo en `/pagos`.
  - `micro: split rompe al cliente viejo` → `split('envios')` y `fastForward(5)`: `e404 > 0`. Después `updateClient()`, `fastForward(1)` (para vaciar los que estaban en vuelo) y en `window(4)` hay `e404 === 0` y `byService.envios > 0`.
  - `micro: split repetido se ignora` → dos `split` dejan un solo servicio `envios`.
- [ ] **Paso 2:** correr → FAIL. **Paso 3:** implementar. **Paso 4:** correr → PASS.
- [ ] **Paso 5:** commit "MicroKit: servicios separados con una dirección cada uno".

### Tarea 5: topología appweb (una sola dirección, con código)

**Files:** Modify `js/micro.js`; Test `tests/interact.js`

**Interfaces:**
- Produces:
  - `topology:'appweb'`: el cliente llama solo a `tienda.com`, donde está el nodo App web 🖥. Cada pedido del cliente es `GET /` (una página) y la app web hace `fanout` (default `['usuarios','ordenes','pagos']`) llamadas en paralelo. Cuando vuelven todas, responde al cliente: `ok` si todas dieron ok, `err` (502 desde la app web) si alguna falló. En `window()`, `sent/ok/err` cuentan pedidos del cliente y `calls` cuenta las llamadas internas.
  - El panel muestra `appwebCode() → string[]`, las líneas del "código" de la app web (una por servicio, por ejemplo `GET ordenes.interno/ordenes`).
  - `crash('appweb')`: los pedidos del cliente dan `err` (error de conexión) aunque los servicios estén `up`.
  - `split('envios')` en appweb: agrega Envíos, suma una línea a `appwebCode()` y lanza automáticamente `deploy('appweb')` (gradual, 2 instancias de la app web, nunca las dos abajo). Emite `'deploy'` con `touched: ['appweb']`. El cliente no ve errores.
  - `appwebInstances` (default 2): la app web corre en 2 instancias detrás de un LB, como en la clase de load balancer.

- [ ] **Paso 1: pruebas que fallan**
  - `micro: appweb arma la página con tres llamadas` → `fastForward(10)`: `ok > 10`, `calls ≈ 3 × (ok + err)` (±3 por los que están en vuelo) y se cumple el invariante.
  - `micro: se cae la app web, cae todo` → `crash('appweb')`, `fastForward(4)` y `window(3)`: `ok === 0`, `err > 0`. Todos los servicios siguen `up`.
  - `micro: separar envíos obliga a deployar la app web` → `split('envios')` y `fastForward(6)`: `deployCount('appweb') === 1`, `appwebCode().length === 4`, `e404 === 0` y `err === 0`.
- [ ] **Paso 2:** correr → FAIL. **Paso 3:** implementar. **Paso 4:** correr → PASS.
- [ ] **Paso 5:** commit "MicroKit: app web comunicadora con fan-out".

### Tarea 6: slides 1-3 (monolito y sus límites)

**Files:** Modify `index.html` (secciones 1-3), `js/scenes.js`, `js/widgets.js`, `css/theme.css` si hace falta; Test `tests/interact.js`

**Interfaces:**
- Consumes: `MicroSim` de las Tareas 2 y 3.
- Produces:
  - `Widgets.mstats(el, sim, fields, windowSec)`, con los campos `ok`, `err`, `resources`, `upCopies`, `deploys` y `calls`. Es el modelo de `Widgets.rstats` de proxy reverso.
  - El helper `msetup(slide, opts)` en `scenes.js`, que crea `MicroSim` sobre `svg.sim` y conecta `.mstats`.

Contenido por slide (los textos finales los afina el implementador, con este sentido):
- **1 `monolith`**: slider de tráfico. Lead: "Una sola app hace todo: usuarios, órdenes y pagos. El cliente conoce una sola dirección: **tienda.com**." Notas: es el punto de partida que ya conocen. Pregunta: "¿qué pasa si solo pagos recibe mucho tráfico?"
- **2 `scale`**: botón "⚡ Pico en /pagos" (`setMix('/pagos',6)` + `setRate(8)`), "＋ Copia", "－ Copia" y ↺. `.mstats` con `ok,err,resources`. Fragmentos: "Cada copia carga **los tres módulos**, aunque solo pagos esté saturado." Pregunta: "¿cuánto de lo que agregamos está ocioso?"
- **3 `limits`**: `seg` con los modos `deploy` / `falla`. En deploy, el botón "🚀 Cambiar algo de Pagos" llama a `deploy('monolith')` y se ven las copias reiniciándose una por una, con el texto "se redeployaron: Usuarios, Órdenes, Pagos". En falla, "💥 Bug en Pagos" (`crash('pagos')`) y "↺ Recuperar". El título cambia con el modo: "Cambiás una parte, deployás todo" / "Falla una parte, cae todo". Notas: aclarar que el deploy es gradual (lo vieron con el LB) y que el costo es el riesgo y la coordinación, no la caída.

- [ ] **Paso 1: pruebas de escena que fallan**
  - `escena 2: el pico da errores y la copia los baja` → `evalScene(2)`: clic en pico, `fastForward(6)` y `err > 0`. Después, clic en "＋ Copia" ×2, `fastForward(1)` (para vaciar las colas) y en `window(4)` hay `err === 0` y `resources === 9`.
  - `escena 3: deploy y falla` → en modo deploy, con un clic en el botón, `fastForward(8)` termina con `deployCount('monolith') === 1`. En modo falla, el clic deja `upCopies() === 0`.
- [ ] **Paso 2:** correr → FAIL. **Paso 3:** implementar. **Paso 4:** correr → PASS.
- [ ] **Paso 5:** `node smoke.js` y `node mobile.js` sin errores. Revisar las capturas de las slides 1-3 (paneles sin desborde).
- [ ] **Paso 6:** commit "Slides del monolito y sus límites".

### Tarea 7: slides 4-5 (partir y ganar)

**Files:** Modify `index.html` (4-5), `js/scenes.js`; Test `tests/interact.js`

- **4 `split`**: arranca en `monolith`. El botón "✂ Partir" anima la caja: las franjas se separan en 3 nodos y se hace `reset({topology:'direct'})` con transición GSAP. Fragmentos: "Cada servicio: **su código, su deploy, su escalado**", "Cada uno puede tener su propio load balancer". Pregunta: "¿qué se compartía antes y ahora no?"
- **5 `gains`**: `direct` con los botones "＋ Pagos" (réplicas), "🚀 Deploy Órdenes", "💥 Falla Pagos"/"↺" y "⚡ Pico en /pagos". `.mstats` con `ok,err,resources`. Notas: repetir las demos de las slides 2 y 3 y comparar los recursos (5 contra 9).

- [ ] **Paso 1: pruebas que fallan**
  - `escena 4: partir cambia la topología` → el clic deja `sim.o.topology === 'direct'` y 3 servicios.
  - `escena 5: falla aislada` → con un clic en "Falla Pagos", `fastForward(5)` da `byService.usuarios > 0`.
- [ ] **Pasos 2-4:** FAIL, implementar y PASS. **Paso 5:** smoke + mobile y revisar las capturas 4-5. **Paso 6:** commit "Slides de partir en servicios".

### Tarea 8: slides 6-9 (N direcciones, app web, grietas y cierre)

**Files:** Modify `index.html` (6-9), `js/scenes.js`; Test `tests/interact.js`

- **6 `direct`**: muestra los 3 hosts en el cliente (`.hint`: "el cliente conoce **3 direcciones**"). Botones "✂ Separar Envíos de Órdenes" (`split`) y "📲 Actualizar el cliente" (`updateClient`), más ↺. Fragmentos: "Mover o partir un servicio **rompe a los clientes** hasta que se actualicen", "Todos los servicios quedan **expuestos** a internet". Pregunta: "¿y si el cliente pudiera hablar con una sola dirección?"
- **7 `appweb`**: el cliente → App web (`tienda.com`) → 3 servicios, con slider de tráfico. Box "Código de la app web" con `appwebCode()`. Lead: "El cliente le habla solo a la app web. Ella llama a cada servicio y arma la respuesta."
- **8 `cracks`**: igual que la 7 más "✂ Separar Envíos" (se ve la línea nueva de código, el banner "deploy de la app web" y las instancias reiniciándose de a una, sin errores en el cliente) y "💥 Tirar la app web". Fragmentos: "Cada servicio nuevo = **código nuevo + deploy** de la app web", "Auth, TLS y límites: **todo acá**, para todos", "Si se cae la app web, **se cae todo**". Notas: "¿no se parece a lo que teníamos al principio?" (mini-monolito).
- **9 cierre**: es estática. Tiene 3-4 puntos de "lo que nos llevamos" y la pregunta final en grande: "¿Y si en vez de **código** hubiera **reglas**?". Las notas mencionan que la comunicación entre servicios (colas, eventos) tiene sus propias clases.

- [ ] **Paso 1: pruebas que fallan**
  - `escena 6: separar sin actualizar da errores` → el clic en separar y `fastForward(5)` dan `e404 > 0`. Con el clic en actualizar, `fastForward(1)` y `window(4)`: `e404 === 0`.
  - `escena 8: separar cuesta un deploy, tirar corta todo` → separar y `fastForward(6)`: `deployCount('appweb') === 1` y `err === 0`. Tirar y `fastForward(3)`: en `window(2)` hay `ok === 0`.
  - `slides: ninguna visible nombra proxy reverso` → en el texto de `.slides section` (sin `aside.notes`) no aparece `/proxy|gateway/i`.
- [ ] **Pasos 2-4:** FAIL, implementar y PASS.
- [ ] **Paso 5:** suite completa (`node tests/interact.js`, `smoke.js`, `mobile.js`). Revisar **todas** las capturas, escritorio y celular, con foco en el fan-out vertical de las slides 7-8 en el celular.
- [ ] **Paso 6:** commit "Slides de N direcciones, app web y cierre".

### Tarea 9: puente en proxy reverso (otro repo, local)

**Files:** Modify `../presentacion-proxy-reverso/index.html` (notas de la portada, notas y `ul.points` de la sección `data-scene="door"`)

- [ ] **Paso 1:** en las notas de la portada, después de la pregunta actual, agregar: "Si vienen de microservicios: ahí la app web hacía de única dirección, pero con código por cada servicio. Hoy vemos cómo hacerlo con reglas." No borrar nada de lo existente.
- [ ] **Paso 2:** en `door`, agregar un `<li class="fragment">` al final de `ul.points`: "Partir Envíos fue <b>agregar una regla</b>: sin escribir código ni deployar nada adelante." Sumar una línea equivalente a sus notas.
- [ ] **Paso 3:** `node tests/interact.js` en proxy reverso, más `smoke.js` y `mobile.js` sobre ella. Todo pasa y el panel de `door` no desborda (revisar la captura).
- [ ] **Paso 4:** commit en proxy reverso: "Puente opcional desde la presentación de microservicios". **Sin push.**

### Tarea 10: revisión local

- [ ] **Paso 1:** `open -a "Google Chrome" ~/projects/personal/presentacion-microservicios/index.html` y `open -a "Google Chrome" ~/projects/personal/presentacion-proxy-reverso/index.html#/3`.
- [ ] **Paso 2:** avisar al autor y esperar su revisión. Crear el repo, hacer push o activar Pages queda para después de su OK, como pedido aparte.
