---
name: deploy
description: El circuito completo para publicar Heladera - puertas deterministas, auditorías de agentes 3+3 en loop, deploy con verificación en el aire. Usar SIEMPRE que haya que deployar; nunca `firebase deploy` a mano.
---

# Deployar Heladera

Nunca se deploya directo. El circuito tiene una mitad determinista (scripts) y una mitad de criterio
(agentes), y las dos tienen que aprobar. El orden importa: lo barato primero.

## 1. Puertas deterministas

```bash
npm run verificar
```

Corre TODAS las puertas deterministas del release, de lo barato a lo caro; la lista vigente vive en el propio
`scripts/verificar-release.mjs` (los `puerta('…')`, en orden) y acá no se copia: enumerarla ya envejeció dos
veces. Lo único que conviene saber de memoria es por dónde EMPIEZA: la config del `.env`, el único input del
build que no está en git — no lo ve el `git diff` que auditan los agentes ni la revisión de nadie (D24, «el
punto ciego de las dos mitades»). Si algo falla, se arregla ANTES de gastar agentes en auditar.

## 2. El circuito de auditorías (dos consultoras ciegas, en loop)

Invocar el workflow del repo:

```
Workflow({ name: 'auditoria-release', args: { alcance: '<qué se libera, en una frase>' } })
```

- **Empresa A**: tres auditores independientes (UI, UX, arquitectura) auditan el alcance y firman `pasa`.
- **Empresa B**: otra consultora con los mismos tres lentes audita LO MISMO, **a ciegas** — nadie de B ve el
  informe de A (leerlo los anclaría: corregirían un texto en vez de mirar el código). B sabe que A existe y
  que su trabajo es encontrar lo que a A se le escapó; el desafío es estructural, no editorial.
- **Root cause — un analista por hallazgo, en paralelo** (regla del dueño: un agente por bug, una tarea por
  agente). Cada analista verifica SU hallazgo contra el código (refutarlo es un resultado válido: los falsos
  positivos y lo cubierto por decisiones.md mueren acá, con evidencia), encuentra la CAUSA RAÍZ — no el
  síntoma — la clasifica contra las enfermedades conocidas, y escribe la receta exacta. No edita nada.
- **Cirugía — un cirujano por hallazgo real, EN SERIE** (no se pisan en los mismos archivos). Cada cirujano
  re-verifica que su hallazgo siga vigente, aplica el arreglo mínimo de la receta bajo la disciplina de
  abajo, y cuando es código escribe el test que fija SU bug y lo corre antes de reportar.
- **Puertas**: un agente corre `npm run verificar` al final y reporta verde/rojo.
- El workflow devuelve `{ aprobado }`, o el parte de la cirugía: cada hallazgo de la tanda cae en exactamente
  una de tres canastas — `arreglos` (se operó), `descartados` (su analista lo refutó) o `sinDiagnostico` (se
  cayó la corrida de su analista: nadie lo adjudicó, vuelve como `pendientes` de la próxima vuelta) — más
  `puertas`. **El loop: tras una corrida con cirugía, revisar el diff de los arreglos (el cliente, con la
  disciplina en la mano) y re-correr el circuito COMPLETO (sin `pendientes`) como vuelta de confirmación.
  Termina únicamente cuando las seis firmas den `pasa` sin hallazgos.** Con `args.pendientes` (hallazgos ya
  adjudicados de una vuelta anterior) se saltea la auditoría y se va directo a root cause + cirugía — la
  auditoría no se re-paga.
- Un hallazgo **real que el dueño decide aceptar** (el patrón «límite conocido, sin arreglo por ahora» de D23)
  no se lava como falso: se escribe la decisión en `docs/diseno/decisiones.md` — con eso deja de ser hallazgo,
  porque lo decidido no se relitiga — y se avisa por `aclaraciones` como decisión del dueño.

**La disciplina del que arregla** (regla del dueño: la vara no se baja — el que arregla mejora). En el
bautismo del circuito, casi cada tanda de arreglos metió 1–2 bugs nuevos que la vuelta siguiente cazó, y
eran SIEMPRE las mismas enfermedades. Antes de re-correr el circuito, cada arreglo pasa por esta lista:

1. **¿Enumera algo que puede envejecer?** (archivos, exclusiones, headers, flags, íconos…) → derivarlo de la
   fuente de verdad, no re-listarlo. Pasó 4 veces.
2. **¿Duplica un criterio que ya vive en otro lado?** (un mapeo, una regex, una política) → extraer y
   compartir. Pasó 4 veces.
3. **¿Falla ABIERTO?** Un catch que traga, un loop que corre cero veces, un `some()` sin exigir cantidad:
   toda verificación tiene que fallar cerrado y no poder aprobar en vacío. Pasó 3 veces.
4. **¿Asume una semántica que no verificó?** (glob, headers, matchBase, cleanUrls…) → verificarla
   empíricamente ANTES de codear contra ella (canal de preview, el fuente de la herramienta, un test).
   Pasó 3 veces. **Y vale igual para lo que el circuito IMPRIME, no solo para lo que ejecuta**: todo comando
   que salga en pantalla se corre contra el `firebase-tools` instalado antes de escribirlo — un string no lo
   compila tsc, no lo corre ningún test y el ensayo general recorre el camino feliz, así que una rama de fallo
   hecha solo de texto se descubriría rota recién en producción. Pasó: `hosting:rollback` no existe y era la
   única salida que prometían los mensajes post-publicación (lo custodia
   `tests/unit/comandos-firebase.test.ts`, que barre lo impreso y lo compara con el registro real).
5. **¿El arreglo tiene SU test?** Un arreglo sin test de su propio bug no vuelve al circuito — el bug de la
   heurística de íconos y el del traductor de globs se habrían visto con un test con los nombres REALES.
6. **¿Los mensajes dicen la verdad completa?** (el blanco real, lo que corrió y lo que no, la salida del
   error) — releerlos como el operador asustado que los va a leer.

Y antes de gastar una vuelta entera de seis firmas: releer el propio diff de arreglos con esta lista en la
mano, como un auditor más. La vuelta del circuito confirma; no debería descubrir.

Por defecto el alcance es el working tree contra HEAD; para auditar commits ya hechos, pasar
`ref: 'A..B'` en los args.

## 3. Humo local, commit y aprobación del dueño

Antes de pedir el ok: si el cambio es visible, **mirarlo corriendo sobre el dist local** (config
`heladera-nube` de launch.json en el Browser pane) — es la información que el dueño necesita para decidir, y el
humo barato va ANTES de tocar producción, no después. **Ojo: `heladera-nube` habla con la base REAL de la
familia** — probar sin ensuciar (una lista de prueba propia, no «Casa»), y limpiar lo que se cree. Lo que
este humo NO cubre: `heladera-nube` es `vite preview` sobre `dist/`, muestra el artefacto pero no aplica
nada de `firebase.json` — la ENTREGA (caché, `ignore`, `rewrites`) se ensaya en el canal de preview del
paso 4, no acá. Commitear solo cuando el dueño lo dice, y **deployar solo con su aprobación explícita** — el
circuito verde no reemplaza su "dale, deployá". Presentarle el resultado del circuito (qué pasó, qué se
arregló) antes.

**Y cuando lo dice, el commit se arma nombrando los archivos: `git add <archivo> <archivo>…`, nunca
`git add -A` ni `git add .`.** El alcance de la release es el working tree, pero en el árbol puede haber
cosas que NO son de la release: material de consulta de una investigación, un `firestore.rules` restaurado a
mano durante un rollback (paso 4), sobras de una sesión de agente. Ninguna puerta mira el árbol y las auditorías
leen un diff, así que un archivo sin trackear llega hasta acá con las seis firmas en verde: `-A` lo mete en
el historial para siempre sin que nadie lo haya decidido. Después del `add`, `git status --short` otra vez y
mirar **lo que quedó afuera**: cada línea que sobra es una decisión —va, no va, o se saca del árbol—, no un
resto que se ignora.

## 4. Deploy con verificación en el aire

```bash
npm run deploy -- --dale
```

Sin `--dale` el script verifica todo y **se planta antes de publicar**: el flag es la palabra del dueño
codificada — se pasa únicamente después de su ok del paso 3, nunca "para probar". El script vuelve a correr
las puertas, publica **firestore (reglas + índices) y hosting juntos** —deployar solo hosting dejaba al
circuito ciego a la deriva de reglas: código nuevo contra reglas viejas es, en producción y con todo en
verde, la pantalla «Esta lista no es tuya… todavía.» (así se ve una denegación de LECTURA desde D22)—,
y compara **todo lo publicado** byte a byte contra `dist/` (la lista sale de recorrer `dist/`, no de una
enumeración) más el handler de auth respondiendo.

**Publicar índices no es del todo idempotente.** El paso irreversible publica `firestore.indexes.json` tal
cual: **crea** lo que el archivo declara y producción no tiene, y lo que producción tiene y el archivo **no**
declara lo lista en pantalla y ofrece borrarlo —«Would you like to delete these indexes? …»— en medio del
deploy. Si la pregunta aparece, la respuesta es **No**, que además es el default (Enter alcanza). Y ojo con
quién corre el deploy: firebase-tools se pone no interactivo si `stdin` no es un TTY **o si detecta un agente
de IA** (`CLAUDECODE` entre otros: `lib/env.js`), y ahí no pregunta ni borra nada — imprime un bullet de
`firestore` diciendo cuántos índices o field overrides del proyecto no están en el archivo y que para
borrarlos haría falta `--force`. Ese bullet se pierde fácil en el ruido del deploy y es la única señal de que
producción y el archivo divergieron.

Un «sí» borra de producción lo que falte en el archivo —el `fieldOverride` de `acceso.uid`, por ejemplo, si
alguien lo sacó en un merge o limpiando ruido—, y de eso depende «Tus listas» (D22/D23): sin él `misListas()`
tira `failed-precondition` y quien entra con su cuenta desde otro teléfono ve cero listas. No se vuelve con un
rollback de hosting ni con `hosting:clone`: se vuelve dejando el override en `firestore.indexes.json` y
corriendo `npx firebase deploy --only firestore`. Que el archivo declare lo que el código necesita lo custodia
`tests/unit/indices-firestore.test.ts` (deriva las queries de `src/db/firestore.ts`); lo que producción tenga
de más no lo custodia nadie — solo ese bullet.

**Caso especial — índices nuevos de collection group**: tardan minutos en construirse. Si la release agrega
uno del que el código nuevo depende, el orden es: (1) el «dale» del dueño primero (esto ya toca producción);
(2) `npx firebase deploy --only firestore --project <id de .firebaserc>` — **una de las dos excepciones
PLANIFICADAS al «nunca firebase deploy a mano»** — la otra es el setup inicial del proyecto, una sola vez y
antes de que exista circuito que correr: README «Nivel B — Firestore real», paso 6 — (los runbooks de
emergencia de abajo sancionan las restantes: ahí el comando que el script imprime en pantalla manda), y
publica también las reglas: si las nuevas le niegan algo al código
viejo todavía servido, minimizar la ventana haciendo el paso 4 apenas el índice esté; (3) sondear con
`npx firebase firestore:indexes --project <id>` comparando contra `firestore.indexes.json` (o en la consola:
Firestore → Índices, estado Building/Enabled) hasta que el índice esté; (4) `npm run deploy -- --dale`
(republica firestore sin cambios y suma hosting).

**Si el deploy corta A LA MITAD**: la CLI publica en **tres tiempos**, no en dos, y cada uno deja su línea en
pantalla — primero los índices y fieldOverrides de firestore (`deployed indexes … successfully`), después las
reglas (`released rules …`), y recién al final el hosting (`releasing new version…`). La **última línea que
salió** es la que dice qué tocó producción; el script imprime la misma escalera al cortar:

- **ninguna de las tres**: no se publicó nada. Corregir la causa y volver a correr.
- **`deployed indexes` sin `released rules`**: reglas y código servidos siguen siendo los viejos, pero el juego
  de índices **ya se movió**. Si la release agregó índices, están construyéndose (ver el «Caso especial» de
  acá arriba); si sacó alguno y se contestó que sí al prompt de borrado, producción lo perdió — y el
  fieldOverride de collection group de `acceso.uid` es de lo que depende entrar con la cuenta desde otro
  teléfono (D23), también para el código viejo que se sigue sirviendo. Abandonar la release acá **no** deja
  producción intacta: comparar `npx firebase firestore:indexes --project <id>` contra `firestore.indexes.json`
  y republicar con `npx firebase deploy --only firestore` lo que falte.
- **`released rules` sin `releasing new version`**: quedaron reglas nuevas con código viejo (lo de abajo).
- **`releasing new version` ya salió**: el corte fue en el último tramo y puede haber quedado todo publicado;
  no adivinar — `node scripts/deploy.mjs --solo-verificar`: si sale verde salió TODO (cada publicable con
  sus headers, el deep link, los ignorados y el handler); si sale rojo corta en el PRIMER archivo que no
  cuadre y lo nombra, así que dice hasta dónde llegó, no el inventario del daño. Y hasta
  resolverlo, **no rebuildear** (lo de la sección de acá abajo): el build pisa el `dist/` contra el que ese
  comando compara.

En el tercer escalón, si esta release **endureció** reglas, la familia está
bloqueada AHORA: si lo endurecido son lecturas ven la pantalla «Esta lista no es tuya… todavía.» y piden una
invitación (~3,5 s después del corte, y los teléfonos con la app cerrada, al abrirla); si son escrituras, un
toast. Primero parar el sangrado — restaurar el `firestore.rules` que producción tenía hasta
recién, el del último deploy (no necesariamente el del commit anterior: una release agrupa commits;
`git log --oneline -- firestore.rules` para ubicar candidatos), y
`npx firebase deploy --only firestore` (segundos, deja todo coherente en la versión vieja) — y después
converger con calma re-corriendo `npm run deploy -- --dale`. Pero **antes de esa convergencia hay que
devolver `firestore.rules` al de la release**: el paso 1 buildea y el paso 4 publica lo que hay en el working
tree, así que re-deployar con el archivo restaurado publica **código nuevo contra reglas viejas**, que es el
fallo simétrico y esta vez sin ninguna línea en pantalla que lo anuncie. Guardar una copia del archivo
**antes** de pisarlo; si el de la release estaba commiteado alcanza `git checkout HEAD -- firestore.rules`
(ojo: `git checkout -- firestore.rules` NO sirve, porque `git checkout <sha> -- firestore.rules` dejó el viejo
también en el índice y esa forma restaura del índice). Si las reglas no cambiaron o solo aflojan,
alcanza con re-correr `npm run deploy -- --dale` directo (republicar es idempotente).

**Si falla DESPUÉS de publicar** (verificación en el aire en rojo): el script ya lo dice en pantalla, pero el
orden es — (0) **hasta resolverlo, no rebuildear**: cualquier cosa que corra `vite build` pisa `dist/`
—`npm run verificar` sin flags y `npm run build`, entre otras—, y `dist/` es el único ancla contra el que
`--solo-verificar` compara lo que está sirviendo producción (cada build lleva un sello `__BUILD__` nuevo, así
que ese dist ya no es EL del deploy y la comparación pierde sentido: el primer archivo ni siquiera da DIFIERE,
da 404, porque el chunk cambió de hash). Para re-auditar el artefacto sin rebuildear va
`npm run verificar -- --solo-dist`; re-deployar con `npm run deploy -- --dale` sí rebuildea, pero republica, y
ahí el ancla vuelve; (1) un archivo DIFIERE — o un 404 sobre un archivo nuevo, que es la otra cara — puede ser
propagación de CDN (un edge todavía sirve la release vieja): esperar un minuto y
`node scripts/deploy.mjs --solo-verificar`; (2) si el DIFIERE persiste, volver a la versión anterior desde la
**consola de Firebase** (Hosting → el sitio → historial de versiones → «⋮» de la versión anterior →
«Rollback»), que es el camino autoritativo e inmediato — por CLI, con el id de versión que sale de esa misma
pantalla, `npx firebase hosting:clone <id>@<versionId> <id>:live` (el `<id>` de `.firebaserc`: el sitio
default de hosting se llama igual que el proyecto; ojo que **`hosting:rollback` NO existe en
firebase-tools**). OJO con lo que se lleva: el rollback restaura el manifiesto **completo** de esa versión, no
solo lo que falló, así que puede volver a publicar lo que el `ignore` de `firebase.json` saca HOY del
release (hoy, los sourcemaps: llevan el fuente entero en `sourcesContent`, con los nombres adentro — el
incidente que fundó este circuito, D24). Es contención **temporal**, para que la familia tenga la app en pie;
no es el destino: apenas esté en pie, converger hacia adelante y volver a publicar por el circuito, no
quedarse en la versión vieja. Y si la release tocó `firestore.rules` o índices, el rollback solo NO alcanza:
restaurar el `firestore.rules` del último deploy (el que producción tenía;
`git log --oneline -- firestore.rules` para ubicarlo) y
`npx firebase deploy --only firestore`, o quedan reglas nuevas contra código viejo; (3) después de volver
atrás, re-correr `--solo-verificar` va a dar DIFIERE contra el dist nuevo: producción quedó **a propósito**
en la versión anterior — es el caso **(b)** de los tres que el script nombra en pantalla, con su salida — y
el arreglo sigue por el **paso 1 de esta skill** (`npm run verificar`), no por el punto (1) de esta lista —
y si en (2) se restauró `firestore.rules`,
**devolverlo antes de volver al paso 1**: el paso 1 buildea y el paso 4 publica lo que hay en el working tree,
así que volver al circuito con el archivo restaurado publica **código nuevo contra reglas viejas**. Guardar la
copia **antes** de pisarlo; si el de la release estaba commiteado alcanza `git checkout HEAD -- firestore.rules`
(ojo: `git checkout -- firestore.rules` NO sirve, porque `git checkout <sha> -- firestore.rules` dejó el viejo
también en el índice y esa forma restaura del índice). Un «DIFIERE» de `--solo-verificar` tras un rebuild
local tampoco es un incidente (el sello `__BUILD__` cambia el bundle en cada build): es el caso **(a)**.

**Si lo que falla son los headers de caché**: los headers viajan con la release de hosting, así que la vuelta
atrás del punto (2) de arriba también restaura los anteriores; si el problema es la config nueva, arreglar
`firebase.json` y volver por el paso 1.

**Si salta el candado del espejo** («FUGA: dist/<x> NO debía publicarse y … lo está sirviendo tal cual,
AHORA»): es el único fallo cuya consecuencia es una **fuga de datos de la familia** — hoy los ignorados son
los `.map`, y su `sourcesContent` lleva el fuente entero con comentarios y nombres adentro (el incidente
fundacional de D24). El orden es contener, converger, diagnosticar: (1) **contener**, no diagnosticar —
borrar de `dist/` ese archivo y los demás ignorados (si el espejo se corrió, no es el único servido) y
`npx firebase deploy --only hosting --project <id de .firebaserc>` (segundos; excepción de emergencia
sancionada al «nunca a mano»: las reglas no se tocan, se acaban de publicar). Si el blanco era un canal de preview (`--base`), el corte es borrar el canal
(`npx firebase hosting:channel:delete <canal> --project <id> --force`) y no publicar nada al canal vivo;
(2) **converger**: para los `.map`, `sourcemap: false` en el `build` de `vite.config.ts` y
`npm run deploy -- --dale` — borrarlos del dist a mano no alcanza, el deploy rebuildea y los regenera;
(3) volver a la versión anterior **no** es la salida: puede estar sirviendo los mismos archivos (le pasó a
esta app, D24); (4) **recién después, el diagnóstico**: el espejo del ignore (`scripts/dist-publicado.mjs`) y
el `listFiles` real de firebase-tools divergieron — firebase-tools está con caret y pudo cambiar en un
`npm i`; comparar contra la versión instalada y arreglar el espejo CON test antes de volver a publicar.

**Si lo que no responde es `/__/auth/handler`**: NO es motivo de rollback — `/__/` lo sirve la plataforma de
Firebase Hosting, no viaja en la release, así que ningún deploy lo rompió ni ningún rollback lo arregla. El
script ya reintenta tres veces; si persiste, reintentar `--solo-verificar` en un rato: es de Firebase o de la
señal, no de esta release.

**Ensayo general (opcional, recomendado cuando la release toca firebase.json o el artefacto)**: un canal de
preview ejercita TODO el camino sin tocar el canal vivo — y no cuenta como «deploy a mano»: publica a un
canal de preview con expiración, nunca al canal vivo (la regla protege producción, no el ensayo) —
`npx firebase hosting:channel:deploy prueba --expires 1h --project <id>` y después
`node scripts/deploy.mjs --solo-verificar --base <url-del-canal>`; borrar el canal al terminar
(`npx firebase hosting:channel:delete prueba --project <id> --force`). El bloqueante de la heurística de
íconos que encontró el circuito se habría visto ahí, antes de cualquier deploy real.

## 5. Humo en producción

El humo local ya se hizo en el paso 3; acá se prueba el camino que cambió sobre
`https://<proyecto>.web.app`, que es lo que la familia tiene en la mano. Dos superficies que el navegador
de escritorio NO cubre y que ya escondieron bugs (la barra de estado, el SW comiéndose `/__/auth/*`):
pedirle al dueño el humo en la **app instalada** de su teléfono cuando el cambio toca lo que un cliente YA
INSTALADO consume — el manifest, el service worker, los viajes de la cuenta, o **lo que decide qué se
publica y con qué caché** (`firebase.json`: headers, `ignore`, `rewrites`). Esa política es el mecanismo por
el que un teléfono instalado se entera de que hay versión nueva: si sale al revés, el síntoma es teléfonos
clavados en la versión anterior, invisible desde el escritorio del que deploya. Y las puertas no lo tapan —
`verificar-release.mjs` compara la config contra `cachePolitica()` y `deploy.mjs` compara los headers del
aire contra esa MISMA `cachePolitica()`: las dos validan que la config diga la política, ninguna valida la
política. El único oráculo independiente es alguien abriendo la app. Y si toca el camino offline-first
(anotar, sincronizar), probar también **sin señal** (devtools → Network → Offline).

**El teclado, SIEMPRE, y en la app instalada — no importa qué haya tocado la release.** Es el único ítem de
este paso que no está condicionado a lo que cambió, y es por una razón estructural: **lo que se viene a mirar
acá no lo ve ninguna de las dos mitades del circuito**. Las puertas corren en jsdom, que no tiene layout: la
barra no sube, el `100dvh` no se achica y el sheet no se acomoda, así que ningún test puede afirmar que el
teclado NO tape la barra de anotar; y los seis auditores leen un DIFF, y un teclado tapando la barra de
anotar no está en ningún diff. El navegador de escritorio tampoco sirve de oráculo: la ventana se achica
sola y todo parece bien. Y la app instalada no es sustituible por una pestaña de Chrome — se comporta
distinto justo acá (`display: standalone`, `viewport-fit=cover`, y los flags de edge-to-edge que el dueño
pueda tener prendidos, que le cambian a la ventana quién maneja los insets del teclado). El pedido
concreto: **abrir la app instalada con `?fps`, tocar la barra de anotar y leer el número del Medidor**; y si
hay algún sheet con campo de texto en lo que cambió, también ahí. Esto se pide ANTES de decir «listo», no
después de que lo reporte el dueño: la vez que faltó, lo encontró él.

**Y ojo con estirar ese «no lo ve» más allá de lo medido, que es el error de forma de D25.** jsdom no ve el
LAYOUT, pero sí ve —y ya lo fija `src/ui/useVisualViewport.dom.test.tsx`, proyecto `ui`, con un doble de
`navigator.virtualKeyboard`— qué modo eligió la app y qué le hizo al navegador: que con el default NO se
prenda `overlaysContent` ni se enganche el `geometrychange`, que con `?teclado=vk` sí, que el aviso del
teclado mueva `--kb-inset`, y que al desmontar se devuelva todo. O sea: si lo que dudás es del MECANISMO, hay
puerta y el test se escribe; el teléfono es para el LAYOUT, que es lo único que no tiene dónde afirmarse.

**Se pide el NÚMERO, no «¿subió la barra?».** Que la barra suba es el síntoma, y un síntoma binario con tres
causas distintas no se puede reportar. El Medidor dice qué camino de teclado quedó activo y cuántos px está
tapando, y ahí las tres se separan solas:

- `vk 345` (o el alto que sea) → el mecanismo corrió y midió. Si igual quedó tapada, el problema es de CSS, no
  de medición.
- `vv 0` con el teclado ABIERTO → el camino viejo no se enteró del teclado. En la app instalada con
  edge-to-edge ese es el bug conocido de D28, y es un resultado válido que hay que anotar.
- `— 0` → el hook ni montó. No es un resultado: es que algo se rompió antes, y no hay nada que concluir.

**Y si sube pero queda una franja de papel entre el renglón y el teclado, se anota — y no se lee como «casi
anda».** Las superficies fijas suman `--safe-bottom` ADEMÁS de `--kb-inset` (siete declaraciones,
`grep -rn -- --safe-bottom src/`), así que con `--kb-inset > 0` esos px quedan de `--paper` entre el campo y
el teclado, con la `DoneBar` y el `Toast` corridos encima. Está escrito en D28 como hipótesis **no medida**,
con su arreglo y su medición ya pedidos: verla es el dato que esa medición está esperando, no un resultado en
contra del camino `vk`.

**Y hay una segunda pedida, esta SÍ condicional: mientras la perilla exista y el default siga en `vv`, la
release además hay que MEDIRLA.** El humo de arriba dice que no se rompió nada —cierto, y barato, porque el
default no se movió— y no dice NADA sobre `vk`, que es lo único que D28 entrega: un instrumento, no un
arreglo, y uno que se deploya y nadie lee no entregó nada. La sesión está escrita paso por paso en D28 («El
protocolo de medición»: dónde se mide, el control positivo que decide si una corrida cuenta, y las corridas de
las dos direcciones con sus repeticiones) y no se copia acá — se abre y se sigue; lo que sigue acá es la
mecánica de esa perilla en un teléfono sin barra de direcciones. El resultado vuelve a
`docs/diseno/decisiones.md` bajo D28: es lo que habilita mover el default o cierra la línea. **Y este párrafo
vence con eso:** el día que la medición cierre D28 —default movido o abandono disparado— se borra; el de
arriba, incondicional, queda.

**Cómo entra la perilla en la app instalada, que no tiene barra de direcciones:** abriendo el link
`…/l/<id>?fps&teclado=vk` desde otra app y eligiendo abrirlo con Heladera. Adentro sobrevive a moverse por la
app: el router le devuelve al destino las perillas que ya venían (`conPerillas`, `src/app/router.ts`), y hay
tests que lo fijan.

**Y las dos perillas NO viven igual — esto es lo que hay que tener en la cabeza toda la sesión.**
`?teclado=` queda **pedida en el teléfono** (`heladera:teclado` en localStorage, ver `useVisualViewport.ts`);
`?fps` no, se lee de la URL y nada más. Al cerrar la app y volver desde el ícono se arranca en `start_url`
(`/`), sin query, y entonces **el Medidor desaparece pero el modo `vk` sigue pedido**. De ahí las dos reglas
que impiden anotar un número falso:

- Que no aparezca el Medidor **no** significa «volvió al default `vv`»: significa que ya no se puede leer qué
  camino está corriendo. Volvé a entrar por el link completo antes de anotar nada.
- Para medir el camino viejo se entra **explícito con `?teclado=vv`** (que además borra lo recordado). Dejar
  que se pierda la URL y suponer que volviste al default te deja midiendo `vk` y anotándolo como `vv`.

Y la moraleja que lo generaliza, para el próximo ítem de esta lista: cuando un mecanismo del producto no vive
en ninguna de las dos mitades —porque necesita un dispositivo real para existir—, la única cobertura posible
es un humo pedido a mano, y entonces tiene que estar escrito ACÁ y ser incondicional. Un mecanismo que
ninguna puerta puede ver y que ningún paso nombra no está cubierto por nadie, y se descubre roto en el
teléfono de la familia.

**Ojo con la ventana de gracia:** un cambio de política de caché rige para los pedidos NUEVOS. Los clientes
que ya cachearon el shell lo hicieron con los headers VIEJOS, así que un teléfono puede seguir mostrando la
versión anterior hasta que venza ese max-age de antes (una hora, en nuestro caso). Un teléfono clavado justo
después de un deploy que arregla la caché **no refuta el arreglo**: `node scripts/deploy.mjs --solo-verificar`
ya probó que el origen sirve los bytes y los headers correctos. Lo que confirma el arreglo es el deploy
SIGUIENTE — el primero que llega con el `no-cache` ya rigiendo desde el pedido anterior.

**Ojo con el manifest:** la app instalada NO es el testigo de un cambio de manifest. El WebAPK lo hornea en la
instalación, y Chrome solo lo regenera si VE un cambio: los miembros que no conoce los filtra ANTES de comparar
(decisiones.md, «La barra de estado»: el Update daba «Succeeded» con el Version code clavado en 1). Un cambio
hecho SOLO de campos que ese Chrome no parsea es, para el teléfono, NINGÚN cambio — la app instalada no va a
mostrar nada, ni ahora ni nunca (por qué esos campos son inertes: D25; cuáles son, la puerta de
`verificar-release.mjs` que los prohíbe: acá no se copian). Y aunque el campo SÍ se parsee, la re-horneada no es
sincrónica con el deploy: «se ve igual» en la misma sesión no refuta nada. Lo único que en el teléfono dice algo
del manifest es `chrome://webapks` (Version code y los colores horneados) — fue lo que destrabó la saga —, no la
barra. El testigo del manifest es el manifest **EN EL AIRE**, y las puertas ya lo miran: `npm run verificar` lo
audita en `dist/`, y `npm run deploy` / `node scripts/deploy.mjs --solo-verificar` lo comparan byte a byte contra
lo publicado — así se cazó el verde Vue que ningún test podía ver. Si de verdad hay que VER un manifest nuevo en
un teléfono, la forma es un canal de preview: URL distinta ⇒ WebAPK distinto ⇒ se hornea de cero, sin tocar el
canal vivo ni el WebAPK real de la familia (el «Ensayo general» del paso 4 ya deja esa URL). En la práctica:
cuando lo único que cambia en el manifest son campos inertes, no pedir ese humo COMO PRUEBA DEL MANIFEST; y si
igual se pide por otro de los disparadores de arriba, avisarle al dueño de antemano que del manifest no va a ver
nada — para que su «no cambió nada» no se lea como «el deploy no llegó» ni como «confirmado, todo bien».

**Si el humo sale rojo**: descartadas las DOS salvedades de acá arriba (la ventana de gracia y la del
manifest), se contiene como cualquier otro fallo posterior a publicar — la vuelta atrás del punto (2) del
paso 4, con las salvedades que ahí están
escritas (leelo entero antes de tirarla) — y el arreglo converge después por el paso 1, como en el (3) de
ahí mismo. La familia ya está usando la versión nueva: contener primero, diagnosticar después.
