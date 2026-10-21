# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Presentación interactiva en español (reveal.js + GSAP + Chart.js) sobre microservicios (de un monolito a servicios separados, y cómo hace el cliente para hablar con todos) para alumnos que ya vieron load balancing. Precede a la de proxy reverso (`../presentacion-proxy-reverso`), pero tiene que poder darse sola: ninguna slide visible nombra "proxy" ni "gateway". Todo el contenido visible y las notas del orador están en español. Basada en el template de `presentaciones-guideline` (ver su `GUIDELINE.md` para el detalle de patrones y decisiones).

## Comandos

- No hay build ni linter. Se abre `index.html` directo (`open -a "Google Chrome" index.html#/1` abre la slide 2; el hash es 0-based).
- Pruebas con Chrome headless (desde la carpeta `tools/` de `presentaciones-guideline`, después de `npm i`): `node smoke.js <esta carpeta>` recorre la versión de escritorio (errores de consola y paneles que desbordan) y `node mobile.js <esta carpeta>` emula un iPhone (versión móvil, scroll horizontal, botones que no reciben el toque). Ambos dejan capturas en `tools/png/` y salen con código ≠ 0 si algo falla. Además, desde esta carpeta: `node tests/interact.js [filtro]` (motor MicroKit y escenas).
- Deploy: GitHub Pages sirve la rama `main` desde la raíz. Un push a `main` publica. **No publicar sin que el autor la revise local primero.**
- `vendor/` tiene versiones fijas descargadas (reveal.js 5.1.0, GSAP 3.12.5, Chart.js 4.4.1). No usar CDN: la presentación tiene que funcionar offline.

## Restricciones que no son obvias

- Scripts clásicos con globals (`window.NetKit`, `Widgets`, `Scenes`), **no ES modules**: los módulos fallan por CORS al abrir con `file://`. El orden de los `<script>` en `index.html` importa.
- reveal.js escala un lienzo fijo de 1280×720. El panel derecho de cada demo tiene 566px de alto (`.demo`); al agregar controles hay que verificar que no desborde (achicar `.chart-box` o el texto).
- No usar la clase `.controls`: choca con las flechas de navegación de reveal.js y las oculta. Los botones van en `.actions`.
- `<aside class="notes">` son las notas del orador (tecla `S`) y quedan públicas en la página.
- Hay dos versiones de la misma página. Un script en el `<head>` agrega `html.mobile` en teléfonos (user agent `Mobi|iPhone|iPod` o pantalla < 600px; se fuerza con `?mobile=1` / `?mobile=0`). En móvil **no se inicializa reveal.js**: las secciones se muestran apiladas con scroll nativo. Los estilos de `reveal.css` siguen cargados, así que las reglas `html.mobile …` de `css/theme.css` tienen que anularlos (posición, display, fragmentos y `pointer-events`; sin esto último ningún botón responde). Cualquier cambio visual hay que probarlo en las dos versiones.

## Arquitectura

**Ciclo de vida** (`js/main.js`): cada `<section data-scene="x">` se asocia a `Scenes.x(section)`, que se llama de forma lazy la primera vez que se visita la slide y devuelve `{ start, stop }`. Al cambiar de slide (o al ocultar la pestaña) se para la escena anterior, así que sólo corre la simulación visible. En móvil lo mismo lo hace un `IntersectionObserver` sobre cada sección (la portada no anima). Las slides sin `data-scene` son estáticas. `main.js` también monta el control global de velocidad (🐢/🐇, teclas `-`/`+`, persistido en localStorage).

**Motor** (`js/sim.js`, `window.NetKit`):
- `Clock`: reloj propio colgado de `gsap.ticker`. Todo el tiempo de simulación avanza con `now += dt × Speed.value`, por eso pausar o cambiar la velocidad no altera la dinámica. Las animaciones GSAP sueltas (pops, rebotes) no dependen de este reloj.
- `Sim`: topología clientes → LB opcional → servidores (→ Redis si `sessions: 'shared'`; → capa de datos si `db: { mode: 'single' | 'cache' }`), dibujada en un SVG con viewBox 900×590 (horizontal). En móvil el lienzo es 400×440 y el diagrama es vertical (`sim.v`); `cubic`/`curve`/`edge` reciben el flag de orientación y una escena puede forzar el horizontal con `orient: 'h'`. Las opciones están en `DEFAULTS` y `DB_DEFAULTS`. API pública: `setRate`, `setUp`/`toggleServer`, `addServer`/`removeServer`, `setHealthChecks`, `drain`, `deployServer`, `until`, `banner`, `window(sec)`.
- `reset(opts)` borra el SVG, los timers y el estado, y emite `'reset'`. Los scripts async de las escenas comparan `sim.gen` antes y después de cada `await` para abortar si hubo un reset.
- La latencia registrada en `sim.log` es tiempo en el servidor (cola + proceso + consulta a la DB); el viaje animado de los puntos no cuenta.

**Motor de microservicios** (`js/micro.js`, `window.MicroKit`): `MicroSim(svg, opts)` con tres topologías (`opts.topology`): `monolith` (cliente → LB si hay más de una copia → copias con los tres módulos), `direct` (el cliente conoce un host por servicio) y `appweb` (cliente → app web con 2 instancias → servicios; cada página son N llamadas en paralelo). Todo nodo es un grupo con workers (`capacity` en paralelo y cola de `maxQueue`, si se llena da 503). API: `setRate`, `setMix`, `setWork`, `addCopy`/`removeCopy`, `setReplicas`, `deploy(id)` (gradual con una copia de más: nunca baja la cantidad en marcha; repetido devuelve la misma Promise), `crash`/`recover` (en el monolito, un bug de un módulo tira todas las copias), `split('envios')` (en `direct` rompe al cliente viejo hasta `updateClient()`; en `appweb` agrega una línea a `appwebCode()` y deploya la app web), `resources`, `upCopies`, `deployCount`, `window(sec)` (ok/err/e404/byService en la ventana; acumulados en `total`, con `total.sent = ok + err + inFlight`) y `fastForward(sec)` para las pruebas. Eventos: `tick`, `reset`, `change`, `deploy`.

**Widgets** (`js/widgets.js`): leen la `Sim` suscribiéndose a `'tick'`/`'reset'`. `Widgets.mstats` muestra los contadores de un `MicroSim` (`.mstats` con `data-fields`: ok, err, resources, upCopies, deploys, calls) y lo conecta `msetup()` de `scenes.js`. Un canvas con otro propósito tiene que usar otra clase.

**Escenas** (`js/scenes.js`): una por slide interactiva, con los helpers `msetup`, `rateSlider`, `codeBox`, `on`, `seg`, `showMode` y `life` (que expone `sim` para las pruebas en `section._scene.sim`). La portada usa la `Sim` de NetKit como fondo decorativo.
