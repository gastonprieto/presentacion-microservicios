# Presentación: Microservicios — diseño

Fecha: 2026-10-21 · Carpeta: `~/projects/personal/presentacion-microservicios`

## Intención

Una presentación interactiva sobre microservicios que se da **antes de la de proxy reverso** (`../presentacion-proxy-reverso`) y **después de la de load balancer** (`../presentacion-load-balancer`). Forma parte de una serie: load balancer → **microservicios** → proxy reverso → colas de mensajes → eventos con brokers.

Lo que la clase tiene que llevarse: **el cliente, de alguna forma, tiene que comunicarse con una sola dirección.** En esta presentación esa sola dirección la da una **app web que hace de comunicadora**: el cliente le habla solo a ella, y ella llama a los servicios y arma la respuesta. La presentación termina mostrando las grietas de esa solución (código por cada servicio, un deploy de la app web por cada cambio atrás, todo lo transversal cargado en ella, se cae ella y se cae todo) para que la de proxy reverso llegue como "lo mismo, pero con reglas en vez de código".

## Audiencia

Los mismos alumnos de la serie. **Ya vieron load balancer**: saben escalar horizontalmente con un LB adelante, conocen el SPOF, los health checks, el rolling deploy y la sesión compartida. No hace falta volver a explicar nada de eso; se puede usar ("cada servicio puede tener su propio LB").

## Objetivos

- Mostrar por qué se parte un monolito: escalar solo lo que se satura, deployar una parte sin tocar el resto y aislar fallas.
- Mostrar el costo inmediato: el cliente ahora tiene N direcciones.
- Presentar la app web comunicadora como la solución "por ahora" y dejar visibles sus grietas.
- Cerrar con la pregunta que abre proxy reverso.

## No-objetivos

- La comunicación entre servicios (colas, eventos, brokers) no se desarrolla: tiene presentaciones propias. A lo sumo, una mención en notas o en el cierre.
- No entran ni proxy reverso ni API gateway: no se nombran como solución, solo se deja la pregunta abierta.
- Quedan afuera bases de datos por servicio en profundidad, transacciones distribuidas, sagas, service discovery, service mesh y Kubernetes.

## Anti-objetivos (sería un fracaso aunque funcione)

- Que la app web comunicadora quede como "la respuesta correcta" y la de proxy reverso parezca redundante. Las grietas tienen que verse en una demo, no solo leerse en una lista.
- Que se sienta como otra serie: vocabulario, colores, estilo y controles tienen que ser los de las otras presentaciones.
- Que el cierre resuelva lo que le toca a proxy reverso.

## Cómo se hace (decidido)

- Se copia `presentaciones-guideline/template` y se siguen `GUIDELINE.md` y su checklist de la sección 12. Eso implica reveal.js 5.1.0, GSAP 3.12.5 y Chart.js 4.4.1 en `vendor/`, scripts clásicos con globals (sin ES modules), apertura con doble clic y funcionamiento offline.
- Cada slide tiene una idea, kicker + título, la demo a la izquierda y el panel a la derecha, y notas del orador (guion + pregunta para la clase) en todas.
- Hay versión de celular (`html.mobile`, diagramas verticales).
- Las pruebas son `node smoke.js` y `node mobile.js` desde `presentaciones-guideline/tools`, más `tests/interact.js` propio para el motor y las escenas, como en proxy reverso.
- Se publica en GitHub Pages (rama `main`, raíz) en `gastonprieto.github.io/presentacion-microservicios`. El push va por el remote HTTPS.
- El vocabulario es el de la serie: una **tienda**, con los servicios **Usuarios, Órdenes, Pagos** (y **Envíos**, **Stock** como extras). Los colores de ruta salen de proxy reverso: `/usuarios` `#60a5fa`, `/ordenes` `#fb923c`, `/pagos` `#2dd4bf`.
- El dominio que ve el cliente es `tienda.com`, igual que en proxy reverso.

## Recorrido (acordado)

1. **Monolito**: una app, una dirección. Es el punto de partida que ya conocen, con un LB adelante si hace falta.
2. **Los límites del monolito**: escalar todo aunque se sature una sola parte, un deploy que arrastra todo y una falla en Pagos que tumba el catálogo.
3. **Partir en servicios**: cada uno con su responsabilidad, su deploy y su escalado, y opcionalmente su propio LB.
4. **¿Con quién habla el cliente?** Primero el problema crudo, N direcciones. Después la app web comunicadora como solución.
5. **Las grietas de la app web**: aparece un mini-monolito. Cierre con la pregunta hacia proxy reverso.

## Lista de slides (propuesta, decisión del diseño; ~9)

| # | Kicker · Título | Demo | Qué se toca |
|---|---|---|---|
| 0 | Portada · "De un monolito a muchos servicios" | fondo animado, como en las otras | — |
| 1 | Punto de partida · "Una app, una dirección" | cliente → `tienda.com` (monolito con módulos Usuarios/Órdenes/Pagos adentro) | slider de tráfico |
| 2 | Límite · "Se satura una parte, escalás todo" | pico solo en `/pagos`; para atenderlo hay que clonar el monolito entero | botón "＋ copia" que agrega un monolito completo; contador de recursos usados |
| 3 | Límite · "Cambiás una parte, deployás todo" / "Falla una parte, cae todo" | modos: un cambio en Órdenes redeploya el monolito entero copia por copia (con riesgo: un bug llega a todas); un bug en Pagos tira todas las copias | `seg` deploy / falla |
| 4 | Partir · "Cada parte, su propio servicio" | el monolito se parte en Usuarios, Órdenes y Pagos | botón "✂ Partir" (animación) |
| 5 | Ganancia · "Escalar, deployar y fallar por separado" | misma demo que 2 y 3, ahora por servicio: escalar solo Pagos, deployar Órdenes, tirar Pagos y que el resto siga | botones por servicio |
| 6 | El costo · "El cliente conoce tres direcciones" | el cliente con `usuarios.tienda.com`, `ordenes…` y `pagos…`; mover o partir un servicio rompe al cliente (errores en rojo) | botón "✂ Separar Envíos de Órdenes": el cliente viejo falla |
| 7 | Una sola dirección · "Una app web que habla por todos" | cliente → App web (`tienda.com`) → servicios; un pedido de página dispara varias llamadas que vuelven y se arman | slider de tráfico; ver las llamadas en abanico |
| 8 | Grietas · "La app web se volvió un mini-monolito" | sobre la demo 7: "✂ Separar Envíos" ahora exige cambiar y deployar la app web (costo visible: código nuevo + deploy gradual, sin caída); tirar la app web tumba todo aunque los servicios estén sanos | botones separar / tirar app web; fragmentos: código por servicio, auth/TLS repetidos acá, SPOF |
| 9 | Cierre · "Lo que nos llevamos" | resumen + pregunta: "¿y si en vez de código hubiera reglas?" | — |

La slide 8 es a propósito el espejo de "El cliente conoce una sola dirección" de proxy reverso (que también tiene el botón "✂ Separar Envíos de Órdenes"). La misma acción, que acá cuesta un deploy de la app web, allá es agregar una regla.

## Deploys y fallas (acordado)

La clase ya vio rolling deploy, así que **un deploy no se muestra como caída**. Lo que se muestra es **costo y riesgo**: para cambiar algo de Pagos hay que redeployar la app entera (todos los módulos, en todas las copias, de forma gradual), y si el cambio trae un bug, el bug llega a todas las copias. En la slide 8 vale lo mismo para la app web: separar Envíos obliga a cambiar, probar y deployar la app web, aunque el cliente no se entere. Lo que hay que mostrar es el trabajo y el riesgo.

**Las fallas sí son caídas reales.** Un bug de Pagos que cuelga el proceso tira todas las copias del monolito, porque todas corren el mismo código, y el LB no tiene a dónde mandar. Si se cae la app web comunicadora, se cae todo aunque los servicios estén sanos.

Títulos ajustados: slide 3 pasa a "Cambiás una parte, deployás todo" / "Falla una parte, cae todo".

## Continuidad con proxy reverso (acordado: continua, pero cada una usable sola)

- **Esta presentación** cierra con la pregunta ("¿y si en vez de código hubiera reglas?") sin nombrar el proxy reverso ni depender de él. Sirve sola.
- **Proxy reverso** se toca poco, sin que dependa de haber visto esta (decisión del diseño):
  - En las notas de la portada y de "El cliente conoce una sola dirección" se agrega un puente opcional del estilo "si vienen de microservicios: es lo que hacía la app web comunicadora, pero sin código por servicio". Las notas actuales siguen valiendo para quien llega directo desde load balancer.
  - En la slide "El cliente conoce una sola dirección" se agrega un fragmento que se explica solo: "Partir Envíos fue agregar una regla, sin escribir código ni deployar nada adelante".
  - No se tocan las demos ni el orden de las slides.
- El cambio en proxy reverso va en su propio repo, con commit, pruebas (`smoke`, `mobile`, `tests/interact.js`) y deploy propios, **después** de publicar esta.

## Repo y publicación (decisión del diseño)

El repo `gastonprieto/presentacion-microservicios` se crea con `gh` al construir: público, Pages desde `main` raíz, push por HTTPS. **Antes de publicar, el autor la revisa local** (abrir `index.html` en Chrome); no se crea el repo remoto ni se hace push hasta su OK. Lo mismo para el cambio en proxy reverso.

## Lo que queda a criterio del que construye

- Si el motor sale de `sim.js` del template, de proxy reverso o de una escena manual (`S.manual`). Lo razonable es partir del motor de proxy reverso, que ya dibuja servicios distintos con rutas por color.
- Calibrar números (tasas, capacidades y tiempos) para que cada efecto se vea siempre.
- Textos finales de las slides y notas, dentro del tono de la serie.
- Fusionar o partir slides (2 y 3, o 4 y 5) si una queda pobre o el panel desborda.
- Si conviene una slide final "Playground" como en load balancer.

## Criterio de terminado

- Las slides de la tabla con sus demos funcionando en escritorio y celular.
- `smoke.js`, `mobile.js` y `tests/interact.js` en verde, y capturas revisadas.
- Publicada en GitHub Pages.
