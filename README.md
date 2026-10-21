# De un monolito a muchos servicios · Microservicios

Presentación interactiva (reveal.js + simulaciones en SVG) sobre microservicios: los límites de un monolito (escalar, deployar y fallar todo junto), qué se gana al partirlo en servicios, el costo de que el cliente conozca muchas direcciones y la app web como única dirección (y por qué termina pareciéndose a un monolito). Va antes de la de proxy reverso, pero se puede dar sola.

Teclas: `→` avanzar · `S` notas del orador · `F` pantalla completa · `O` vista general · `-` / `+` velocidad de las simulaciones.

## Probar

Desde `presentaciones-guideline/tools` (después de `npm i`):

```bash
node smoke.js ../../presentacion-microservicios    # escritorio
node mobile.js ../../presentacion-microservicios   # celular
```

Y desde esta carpeta: `node tests/interact.js` (motor y escenas).

Basada en [presentaciones-guideline](../presentaciones-guideline).
