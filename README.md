# De un monolito a muchos servicios · Microservicios

Presentación interactiva (reveal.js + simulaciones en SVG) sobre microservicios: los límites de un monolito (escalar, deployar y fallar todo junto), qué se gana al partirlo en servicios, el costo de que el cliente conozca muchas direcciones y la app web como única dirección: un orquestador que decide el orden de las llamadas y qué hacer cuando falta una parte (y por qué termina pareciéndose a un monolito). Va antes de la de proxy reverso, pero se puede dar sola.

**Verla:** https://gastonprieto.github.io/presentacion-microservicios/ (en el celular se ve como documento vertical).

Teclas: `→` avanzar · `S` notas del orador · `F` pantalla completa · `O` vista general · `-` / `+` velocidad de las simulaciones.

## Probar

Desde `presentaciones-guideline/tools` (después de `npm i`):

```bash
node smoke.js ../../presentacion-microservicios    # escritorio
node mobile.js ../../presentacion-microservicios   # celular
```

Y desde esta carpeta: `node tests/interact.js` (motor y escenas).

Basada en [presentaciones-guideline](../presentaciones-guideline).

## Laboratorio con Docker

Lo mismo que muestran las simulaciones, con servicios reales y el mismo tienda.com armado de dos formas:

1. **Monolito**: un solo programa con los módulos Usuarios, Órdenes y Pagos (`lab/monolito/server.js`), con copias detrás de un load balancer (HAProxy, como en la clase de load balancing).
2. **Partido en servicios**: Usuarios, Órdenes, Pagos y Envíos como programas separados (`lab/servicio/server.js` con distinta configuración), y una **app web** (`lab/web/server.js`) que es la única dirección del cliente: llama a cada servicio con código y arma la página.

Hace falta Docker con Compose.

```bash
docker compose up -d --build        # levanta todo (las apps tardan 5 s en arrancar, como una app real)
docker compose logs -f monolito     # en otra terminal: qué copia atiende cada pedido
docker compose logs -f web usuarios ordenes pagos   # qué llamadas hace la app web por cada página
docker compose --profile envios down   # al terminar
```

| Dirección | Qué es | Slides |
|---|---|---|
| `localhost:8000` | tienda.com versión **monolito** (LB → copias del monolito) | Una app, una dirección · Se satura una parte · Cambiás/Falla una parte |
| `localhost:8404` | panel del LB: qué copias del monolito están vivas (se refresca solo) | ídem |
| `localhost:8101` · `8102` · `8103` | **Usuarios**, **Órdenes** y **Pagos** directos, cada uno en su dirección | Escalar, deployar y fallar por separado · El cliente conoce tres direcciones |
| `localhost:8107` | **Envíos**, cuando se separa (perfil `envios`) | El cliente conoce tres direcciones |
| `localhost:8080` | tienda.com versión **app web**: la única dirección del cliente | Una app web que orquesta · El orquestador decide el orden (`?serie=1`) · Cuando falta una parte (`?si-falta=fallar`) · El orquestador se volvió un mini-monolito |

Rutas: los servicios (y el monolito) atienden `/usuarios/…`, `/ordenes/…` (incluye `/ordenes/envios/…`) y `/pagos/…`. La app web tiene páginas: `/` (inicio: usuario, últimas órdenes y medios de pago), `/orden/7` (la orden, su envío y su pago) y `/pagar`.

Cada app atiende 4 pedidos en paralelo, deja esperar 10 más y al resto le responde **503**. Usuarios tarda 50 ms, Órdenes 100 ms y Pagos 300 ms, igual en el monolito que en los servicios. Pagos tiene un bug: `?tarjeta=rota` tira el proceso sin responder.

### Generador de carga

```bash
docker compose run --rm carga http://lb:8000/pagos/cobrar -c 30 -n 300   # 300 pedidos, 30 en paralelo
```

Muestra cuántos atendió cada copia o réplica, los códigos de respuesta y p50/p95/p99. Corre dentro de la red de Docker: las URLs son `http://lb:8000/…` o `http://web:3000/…`, no `localhost`.

### Recorrido

**1. Una app, una dirección.** Todo entra por el mismo lugar y lo atiende el mismo programa:

```bash
curl localhost:8000/usuarios/1
curl localhost:8000/ordenes/7
curl localhost:8000/pagos/cobrar     # "monolito v1, copia 0c2864": los tres los atendió la misma copia
```

**2. Se satura una parte, escalás todo.** Un pico sólo en `/pagos` llena el monolito, y como la capacidad es compartida, rebota también a quien sólo quería ver su usuario. Para atenderlo hay que clonar el monolito entero.

```bash
docker compose run --rm carga http://lb:8000/pagos/cobrar -c 30 -n 300 &
curl localhost:8000/usuarios/1          # durante el pico: 503, aunque nadie le pidió nada a Usuarios
docker compose up -d --scale monolito=3
docker compose run --rm carga http://lb:8000/pagos/cobrar -c 30 -n 300   # ahora 0 errores, con tres copias de TODO
```

En el panel (`localhost:8404`) aparecen las tres copias: cada una carga Usuarios, Órdenes y Pagos.

**3a. Cambiás una parte, deployás todo.** Un cambio en Pagos es una versión nueva del monolito entero. En `docker-compose.yml` subí `VERSION` del `monolito` a `v2` y aplicalo:

```bash
docker compose up -d --scale monolito=3
curl localhost:8000/usuarios/1     # "monolito v2": Usuarios también salió de nuevo, aunque no cambió
```

(Compose reemplaza las tres copias a la vez, así que hay unos segundos sin servicio. En producción sería gradual, con rolling deploy como en load balancing: el punto es **qué** se redeploya, no la caída.)

**3b. Falla una parte, cae todo.** El bug de Pagos tira la copia que lo recibe. El LB reintenta el mismo pedido en otra copia (como haría cualquier cliente), y como todas corren el mismo código, se caen todas:

```bash
curl 'localhost:8000/pagos/cobrar?tarjeta=rota'      # 503 del LB: no queda ninguna copia viva
for i in $(seq 8); do curl -s -o /dev/null -w "usuarios %{http_code}\n" localhost:8000/usuarios/1; sleep 1; done
#  → 503 durante ~7 s (lo que tardan en reiniciarse y arrancar), aunque el bug era de Pagos
```

En el panel se ven las tres copias en rojo a la vez.

**4 y 5. Partir en servicios: escalar, deployar y fallar por separado.** Las mismas pruebas, servicio por servicio:

```bash
# Pico en Pagos: Pagos se satura, Usuarios ni se entera
docker compose run --rm carga http://web:3000/pagar -c 30 -n 300 &
curl localhost:8101/usuarios/1                       # 200
docker compose up -d --scale pagos=3                 # réplicas sólo de Pagos
docker compose run --rm carga http://web:3000/pagar -c 30 -n 300   # se reparte entre 3 réplicas de Pagos

# Deploy: subí VERSION de pagos a v2 en docker-compose.yml
docker compose up -d pagos                           # sólo se recrea Pagos; Usuarios y Órdenes siguen igual
curl localhost:8080/                                 # Pagos v2, los demás v1

# Bug en Pagos: se cae Pagos y nada más
curl 'localhost:8080/pagar?tarjeta=rota'             # 502: pagos cortó la conexión sin responder
curl localhost:8080/                                 # Usuarios ✓ Órdenes ✓ Pagos ✗ (caído o arrancando)
curl localhost:8101/usuarios/1                       # 200
```

Con varias réplicas, cada una de Pagos tiene su propia dirección (8103 a 8106; ver `docker compose ps pagos`): si el cliente hablara directo, tendría que conocerlas todas.

**6. El cliente conoce tres direcciones.** Sin app web, el cliente tiene escrita la dirección de cada servicio. Separar Envíos de Órdenes lo rompe hasta que se actualice:

```bash
curl localhost:8102/ordenes/envios/7                # lo atiende Órdenes
docker compose --profile envios up -d envios        # aparece Envíos en :8107
# en docker-compose.yml, descomentá NO_ATIENDE en ordenes (Órdenes deja de atender envíos)
docker compose up -d ordenes
curl localhost:8102/ordenes/envios/7                # 404: el cliente viejo quedó roto
curl localhost:8107/ordenes/envios/7                # 📲 "actualizar el cliente": recién ahora anda
```

**7. Una app web que orquesta.** El cliente le habla sólo a `localhost:8080`. La app web es el **orquestador**: por cada página hace una llamada por servicio, en paralelo, y espera a todas:

```bash
curl localhost:8080/
curl localhost:8080/orden/7
docker compose logs web --tail 2     # "inicio → usuarios 200 (52 ms), ordenes 200 (104 ms), pagos 200 (305 ms) → página en 308 ms"
```

En `lab/web/server.js` está todo lo que la app web sabe de los servicios: la lista `SERVICIOS` con la dirección interna de cada uno y, por cada página, qué llamadas hace. Reparte entre réplicas con código también.

**8. El orquestador decide el orden.** Las mismas llamadas, una detrás de otra con `?serie=1`. En paralelo la página tarda lo de Pagos, el más lento; en serie tarda la suma:

```bash
curl localhost:8080/             # "armada en 308 ms con 3 llamadas en paralelo"
curl 'localhost:8080/?serie=1'   # "armada en 473 ms con 3 llamadas en serie": 50 + 100 + 300 ms
```

**9. Cuando falta una parte.** Con Órdenes caído, la app web decide: por defecto la página sale con el hueco; con `?si-falta=fallar` falla entera, aunque Usuarios y Pagos estén sanos. En serie, además, corta en la primera falla y ni llama a los que siguen:

```bash
docker compose stop ordenes
curl -i localhost:8080/                              # 200, con "✗ ordenes no respondió"
curl -i 'localhost:8080/?si-falta=fallar'            # 502: no pudimos cargar la página
curl -i 'localhost:8080/?serie=1&si-falta=fallar'    # 502 en 60 ms: "– pagos: no se llamó"
docker compose start ordenes
```

Las dos decisiones son la función `orquestar` de `lab/web/server.js`: código de la app web, no de los servicios.

**10. El orquestador se volvió un mini-monolito.** Con Envíos separado (paso 6), la página de la orden se rompe aunque el cliente no hizo nada:

```bash
curl localhost:8080/orden/7      # ✗ 404 de Órdenes: la app web sigue llamando a Órdenes por los envíos
```

Para arreglarlo hay que cambiar el código de la app web (las dos marcas `✂ Separar Envíos` en `lab/web/server.js`: descomentar `envios` en `SERVICIOS` y cambiar la llamada) y **deployarla**:

```bash
docker compose up -d --build web
curl localhost:8080/orden/7      # ✓ Envíos
```

El cliente no se enteró, pero el equipo de la app web tuvo que trabajar y deployar por un cambio de otro equipo.

### Romper cosas

En una terminal dejá pedidos continuos a las dos versiones:

```bash
while true; do curl -s -o /dev/null -w "monolito %{http_code}   " localhost:8000/usuarios/1; curl -s localhost:8080/ | tr '\n' ' ' | cut -c1-160; echo; sleep 1; done
```

| Qué romper | Comando | Qué se ve | Volver |
|---|---|---|---|
| Bug en Pagos (monolito) | `curl 'localhost:8000/pagos/cobrar?tarjeta=rota'` | Todas las copias se caen: `/usuarios` da 503 unos 7 s | se reinician solas |
| Bug en Pagos (servicios) | `curl 'localhost:8080/pagar?tarjeta=rota'` | Sólo la sección de Pagos falla unos 5 s; Usuarios y Órdenes siguen | se reinicia solo |
| Un servicio | `docker compose stop ordenes` | La página de inicio sale igual, con Órdenes ✗ (no hay ninguna réplica levantada): la app web decide qué mostrar cuando falta una parte; con `?si-falta=fallar` da 502 (paso 9) | `docker compose start ordenes` |
| La app web | `docker compose stop web` | `localhost:8080` da `Failed to connect` aunque los servicios están perfectos (`curl localhost:8101/usuarios/1` → 200) | `docker compose start web` |
| El LB del monolito | `docker compose stop lb` | `localhost:8000` da `Failed to connect` aunque las copias del monolito están vivas | `docker compose start lb` |
| Saturar Pagos | `docker compose run --rm carga http://web:3000/pagar -c 30 -n 300` | 503 de Pagos; Usuarios y Órdenes no se enteran | `docker compose up -d --scale pagos=3` |
| Deploy de la app web | `docker compose up -d --build web` con pedidos corriendo | Con una sola instancia se corta un instante. Con varias detrás de un LB sería gradual y sin cortes, pero el trabajo de cambiarla y deployarla queda | — |

En el laboratorio los servicios tienen puertos publicados para poder probar el paso 6. En la versión con app web no harían falta: sólo ella necesita verlos.
