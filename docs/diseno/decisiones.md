# Decisiones de diseño

Registro versionable de las decisiones del documento de diseño (`shoplist-diseno.html`, §13).

## Cerradas en la discusión

| # | Decisión | Resultado |
|---|---|---|
| C1 | ¿Cómo evitar duplicados? | El **input es filtro y alta a la vez**: mientras escribís la lista se reduce a lo que coincide; el botón dice qué va a pasar (“Agregar «x»” / “Ya está” / “Volver a anotar «x»”). Coincidencia tolerante (sin tildes, prefijo de palabra, plural simple). |
| C2 | ¿Quién “tiene razón” si dos escriben a la vez? | Fusión **por campo, última escritura en llegar al servidor**; borrado lógico; ids de cliente; `serverTimestamp()`; **deduplicación determinista** de ítems iguales anotados sin verse (se conserva el más antiguo). |
| C3 | Dependencia de la pegatina NFC | **Ninguna.** La app se abre por URL; QR/NFC son accesos rápidos con link corto `/h` → `/l/<id>?anotar`. Sin Web NFC en la app; instrucciones en el README. La UI depende de una URL y de la interfaz `Db`, nada más. |
| C4 | ¿PWA o app nativa? | **PWA** (distribución por link, sin stores ni cuentas, $0). Capacitor como escape si algún día hace falta push/NFC nativo. |
| C5 | “Compartir lista” | **No existe.** Todos ven la misma lista. Queda “⋯ › Mandar la lista por WhatsApp” (texto plano) y “⋯ › Sumar a alguien” (link, una vez). QR/pegatina/instalación → README. |
| C6 | Movimiento | **Layout animations con Motion** (no `Reorder`): la lista se reordena en vez de teletransportarse; feedback en botones/inputs; reduced motion respetado. Ver §9 “Motion”. |
| C7 | Dirección visual | **A · Papel de almacén** (Fraunces + DM Sans, crema/tinta) con **acento Cuero** (2026-08-16). B “Cuaderno rayado” descartada. Editor y fuente de verdad de los tokens: `paleta.html` (“Copiar tokens”). Claro: acento `#7B4A2D`, acento-texto `#6E4228`, texto sobre acento `#FFFFFF`. Oscuro: `#C48A5A` / `#CD9A70` / `#1B1A17`. Contraste AA verificado en los dos modos. |

## Cerradas por default al arrancar la construcción (2026-08-16)

El dueño dijo “arranquemos”; se toman los defaults recomendados. Cualquiera se puede revisar sin rehacer el resto.

| # | Decisión | Elegido |
|---|---|---|
| D1 | Arquitectura | Firebase (Firestore + Hosting + Auth anónima); la UI habla con la interfaz `Db` (nivel A arranca con el `Db` falso en memoria) |
| D2 | Nombre de la app | Heladera |
| D4 | Miembros / teléfonos | chips Tu nombre · Mamá · Papá · Otro; se asume que puede haber iPhone |
| D5 | Cuándo preguntar “¿Quién sos?” | al abrir, sheet descartable (si se cierra, firma “alguien”) |
| D6 | Accesos rápidos | link corto `/h` → `/l/<id>?anotar` |
| D7 | Qué es un ítem | texto libre, un solo campo |
| D8 | Orden de pendientes | lo nuevo abajo |
| D9 | Comprados | solo con “Vaciar” (con Deshacer, optimista) |
| D10 | Alcance de hoy | mínimo de punta a punta (nivel A → B → C) |
| D11 | Tests del emulador | Java (JRE) en la PC + CI; el loop local es unit + componentes con el `Db` falso |
| D12 | Framework de UI | React 19 + Motion 13 |

## Reglas de implementación acordadas

- **Nada hardcodeado.** Colores, tamaños, tiempos y textos salen de tokens: `src/styles/tokens.css` (paleta claro/oscuro, escala de espaciado, tipografía fluida), `src/motion/tokens.ts` (springs/duraciones), `src/domain/timing.ts` (HOLD_MS, TOAST_MS…, inyectables), `src/ui/textos.ts` (copy en es-AR).
- **Responsive de verdad:** unidades `rem`/`clamp()`, `100dvh`, `env(safe-area-inset-*)`, barra de input que respeta el teclado (`visualViewport` / `interactive-widget`), máximo 560 px centrado en desktop, targets ≥ 44 px, texto que respeta el zoom del sistema.
- **Accesible:** HTML semántico, checkbox real en `<label>`, `<dialog>` con foco atrapado, Escape y nombre/descripción declarados, `aria-live` en contador y toasts, `prefers-reduced-motion`, contraste AA.
- **Testeable:** dominio puro con tests; componentes con el `Db` falso y `MOTION_SCALE=0`.

## Nivel B (2026-08-16)

Firestore real detrás de la misma interfaz `Db` (`src/db/firestore.ts`); la UI no cambió. Lo que se decidió al construirlo:

- **`firebase@12` modular**, sin wrappers ni ORM: `src/db/firebase.ts` es lo único que conoce `VITE_FIREBASE_*` y devuelve `{ app, db, auth, listo }`; `firestore.ts` recibe la instancia ya inicializada (prod, emulador o `rules-unit-testing`) y no lee `import.meta.env`. Nada de Firebase se filtra a `src/app` ni a `src/ui`.
- **Caché persistente multi-tab** (`persistentLocalCache` + `persistentMultipleTabManager`; `memoryLocalCache` donde no hay IndexedDB): la lista abre sin señal, la cola de escrituras sobrevive a cerrar la app y dos pestañas del mismo teléfono comparten la caché. `Item.pendiente` = `hasPendingWrites`; `Vista.fromCache` / `ultimaSync` salen de los metadatos del snapshot (`includeMetadataChanges: true`).
- **Auth anónima gateando las operaciones:** las reglas exigen `request.auth != null`; toda operación espera `listo` (usuario anónimo presente) antes de tocar Firestore, así el eco local nunca lo rechaza después el servidor. Si el sign-in falla sin señal, se reintenta al volver `online`. Las mutaciones no esperan la red: disparan y vuelven; los rechazos van a `onError` con `DbError` tipificado (`permiso` / `red` / `validacion` / `desconocido`).
- **Emuladores con proyecto ficticio `demo-heladera`**, sin proyecto real ni `firebase login`: `npm run emu` + `npm run dev:emu` (`.env.emulador`, commiteado) para desarrollar, `npm run test:emu` para la suite. Requiere Java 21+ (firebase-tools 15); en Windows con `TEMP` raro, `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\Temp`.
- **Suite de contrato fake vs emulador:** los mismos casos corren contra `crearDbFake` y contra `crearDbFirestore` sobre el emulador (`*.emu.test.ts`, proyecto vitest `emulador`), más tests de `firestore.rules` con `@firebase/rules-unit-testing`. `fake.ts` es la referencia de semántica; lo inherente a Firestore (timestamps `null` hasta que el servidor los resuelve, `existe` prudente mientras solo hay caché vacía) es lo único en lo que las dos difieren, y la suite lo contempla.
- **Proyecto real `heladera-ec2b4`, base en `europe-southwest1`**, la región más cercana a quienes la usan. La región de una base de Firestore **no se puede cambiar nunca**: se elige una vez o se rehace la base. Todo el provisionamiento va por CLI y queda en el repo (`firebase.json`, `firestore.rules`, `.firebaserc`): la auth anónima se habilita con el bloque `auth.providers.anonymous` + `firebase deploy --only auth`, no tocando la consola. Ojo: `deploy --only firestore:rules` sobre un proyecto sin base la crea sola en `nam5` y ahí ya no hay vuelta atrás — crear la base **antes**.

## D21 · El ritmo de las animaciones, medido (2026-08-18)

El dueño venía diciendo que en el teléfono "todas las animaciones se ven a bajos fps". Se agregó un medidor (`?fps` en la URL: fps, frame típico, peor frame, tareas largas) para diagnosticar **en el teléfono**, que es donde pasaba — en el navegador de escritorio daba 240 fps y cero tareas largas, o sea que no se reproducía donde se podía medir.

El resultado fue el contrario de lo que parecía: **frame típico clavado en 11,1 ms y peor frame también 11,1**. Eso es 90 Hz exactos, sin perder un solo frame. Que el número no se moviera "ni un microsegundo" es la prueba de que lo marca el panel y no el hilo principal: si fuéramos nosotros, la mediana sería ruidosa. (El teléfono es de 120 Hz pero Chrome le entrega 90 a la web; no hay API para pedir más.)

Conclusión: **no era fluidez, era duración**. En un teléfono donde el resto del sistema responde al instante, 300 ms se leen como pesadez aunque no se caiga un frame. Se agregó `?motion=0.75` para probar velocidades sobre la app real y el dueño encontró el punto probando. De ahí salieron los tiempos definitivos: **todo un 25% más corto**, en `src/motion/tokens.ts` y en `--dur-*` de `tokens.css` (tienen que coincidir).

Con todo lo demás más rápido quedó desalineada la única espera que NO es animación: los 700 ms que la fila se queda tachada arriba antes de bajar a Comprados (`HOLD_MS`, dominio). Se calibró igual, con `?hold=` en el teléfono, y quedó en **300 ms**. Sigue siendo una pausa deliberada —alcanza para ver qué tachaste y para destildar en el lugar—, pero deja de leerse como que "no pasó nada". `UNHOLD_MS` (destildar) sigue en 250: ahí ya sabés lo que hiciste.

`?motion`, `?hold` y `?unhold` quedan como perillas de diagnóstico, no como configuración: los valores de verdad viven en los tokens y en `BASE`, para que el código diga la verdad. Y `?fps` para volver a medir cuando haga falta.

## Nivel C: publicada (2026-08-18)

La app vive en **https://heladera-ec2b4.web.app** (Hosting), con `/h` → `/l/<listId>?anotar` para el QR y la pegatina. Lo que se decidió al publicarla:

- **`.env` es la configuración de casa** y no va a git: `npm run dev`, `npm run build` y el deploy hablan con el proyecto real; `npm run dev:emu` sigue aislado porque `.env.emulador` la pisa entera. Los cuatro valores son públicos por diseño (viajan en el bundle); rehacerlos es un `apps:sdkconfig`, no un secreto que recuperar.
- **Hosting y reglas se despliegan juntos.** Nos pasó en el nivel B: la app nueva se suscribía a `mercados` y las reglas viejas todavía no conocían esa colección → "No tenés permiso" hasta desplegarlas. El comando de publicar los lleva a los dos.
- **El listId vive en `firebase.json`** (el redirect de `/h`). Es lo que hace que el QR y la pegatina no tengan que saber nada: si algún día la lista cambia, se toca ahí y los accesos rápidos siguen andando. Ojo: eso pone el link de casa en el repo — si el repo se hace público, el link (que es la llave) queda expuesto.

## Súper por ítem (2026-08-17)

Pedido del dueño: en la familia se compra en supermercados diferentes. Se agrega **dónde se compra** cada cosa, opcional, sin romper nada de lo que ya está.

| # | Decisión | Elegido |
|---|---|---|
| D13 | ¿Cuántos súper por ítem? | **Uno solo.** Sin etiqueta significa “en cualquiera”, que además es la verdad para lo que se consigue en todos lados. Varios súper por ítem obligaría a repetir la misma fila en dos secciones: rompe el conteo, el vuelo al bolsillo saldría de dos lugares y la deduplicación se vuelve ambigua. |
| D14 | ¿De dónde salen los súper? | Una lista corta por casa (`mercados`), **mismo patrón que los miembros**: chips, nombre libre, se administran desde ⋯. **No vienen precargados**: la primera vez que alguien abre el selector se ofrecen como sugerencias `Mercadona · Lidl · Carrefour · Dia · Aldi` (en el catálogo, no incrustadas en un componente) más el campo libre. Si nadie crea ninguno, la app se ve exactamente como antes. |
| D15 | ¿Dónde y cuándo se elige? | **Nunca al anotar** (el camino rápido no se toca: el súper es propiedad del producto, no del antojo). Se elige en el sheet del ítem, que deja de ser “renombrar” y pasa a ser **el ítem con sus acciones**; al abrirlo el foco va al diálogo, **no al campo de texto**, así no salta el teclado (el nombre se enfoca solo si lo tocás). Además **se aprende por producto**: el súper elegido se recuerda por `textoNorm` con el mismo mecanismo que las sugerencias, así se pregunta ~una vez por producto en la vida. Descartado inferirlo por ubicación (pediría GPS y depender de abrir la app justo al entrar al súper). |
| D16 | ¿Cómo se ve? | **Secciones dentro de la misma lista vertical**, una fila por ítem siempre. Un renglón puede ser encabezado o fila: la lista sigue siendo una sola (mismo contexto de layout de Motion), así mover algo de súper es una reubicación animada y el encabezado se va con su último ítem. Lo que no tiene súper va **primero y sin título** (es “la lista”, no una sección de descartes). Se agrupa **solo cuando hay más de un grupo con cosas**. Los comprados se agrupan igual, gratis: el súper viaja en el ítem. |
| D17 | ¿Filtro por súper? | El buscador —que ya es filtro y alta a la vez— **también coincide por nombre de súper**. Escribir `mercadona` deja en pantalla lo de ese súper; como queda un solo grupo, el título sobra y desaparece: es el “modo compra” sin modo. Regla fina: **esconde lo que es de otro súper, nunca lo “en cualquiera”** (al principio casi todo está sin etiquetar; un filtro que lo escondiera dejaría a alguien parado en el pasillo viendo 2 ítems de 14). Cuando aparecen los dos grupos, el súper buscado va primero. |
| D18 | ¿Arrastrar entre secciones? | **Sí, pero como atajo y en un paso aparte**, después de que secciones y filtro estén firmes. Pulsación larga para tomar la fila, **un dedo arrastra y el otro sigue scrolleando** (se bloquea el gesto del navegador en la fila arrastrada, nunca en el contenedor: bloquearlo en la lista mata el scroll para todos los dedos). Soltar arriba de todo saca el súper. Los chips del sheet siguen siendo el camino oficial: funcionan con teclado, con lector de pantalla y con una mano. |

Implementación: `mercado` (id o nulo) es un campo más del ítem —12ª clave de `clavesItem()` en las reglas, con `mercados` validado como `miembros`—, así la fusión por campo LWW ya cubre que dos personas lo cambien a la vez. Un id que apunta a un súper que ya no está se lee como “en cualquiera”: la vista nunca depende de datos colgados.

La deduplicación de C2 sigue juntando los ítems de igual texto **aunque tengan súper distinto** (el súper es una propiedad del producto, no dos compras separadas; y con LWW gana el último que lo dijo), pero el dato no se tira: si el que se queda no tenía súper y el que se va sí, **lo hereda** (`Duplicado.heredaMercado`).

## D22 · Quién puede entrar (2026-08-21)

El dueño: *“esto no tiene seguridad, entonces cómo podemos solucionar una intrusión?”*. Se auditaron las reglas y el hosting antes de contestar, y la respuesta corta fue que el modelo era **“el que sabe el id, puede todo”** — pero ese id no era secreto.

### Lo que encontramos

**El redirect `/h` colapsaba el modelo entero.** `firebase.json` respondía a `GET /h` con un 301 a `/l/<listId>?anotar`. O sea que el id de 119 bits —generado impecablemente con `crypto.getRandomValues`, matemáticamente inadivinable— lo regalaba el propio Hosting a cualquiera que pidiera una URL de dos caracteres. El id nunca fue el problema; la puerta de al lado sí.

**Las reglas no comprobaban pertenencia en ningún lado.** Todas colgaban de `request.auth != null`, y la auth anónima se la da Firebase a cualquiera que abra la página. `auth()` significaba “es un navegador”, no “es de la familia”. Los cuatro niveles de atacante que analizamos (bundle público / tiene el link / miembro hostil / prueba ids al azar) tenían **exactamente los mismos permisos**.

**Y tres agujeros de validación**, todos de una línea: el `allow update` de ítems no tenía `hasOnly` (el `create` sí), así que se le podían meter claves inventadas hasta llenar el documento de 1 MB que después se bajan todos los teléfonos en cada apertura; de las 14 claves de un ítem sólo se validaban tres; y `creadaEn`/`esquema` en el alta de lista pasaban sin mirar, lo que permitía crear listas basura de 1 MB **sin conocer ningún id** y quemar la cuota diaria del plan gratis.

Lo que **sí** estaba bien y no se toca: cuatro `delete: if false` (nada se destruye de forma permanente salvo mercados), `allow list: if false` (nadie pesca listas ajenas, ni por enumeración ni por collection group), la autoría protegida de verdad (`reclamaAnonimo`, `agregadoEn` intocable), cero secretos filtrados, cero XSS, y reglas testeadas rama por rama contra el emulador.

### El modelo: la cuenta es la llave, la invitación es la puerta

El cambio es **aditivo, no un reemplazo**. Hoy `miembros/{memberId}` son *las personas de la casa* (nombre, color) y `agregadoPor` apunta ahí. Eso es un concepto de producto y funciona. Al lado va una colección que responde otra pregunta:

```
/listas/{id}                         ← + duenio (uid)
/listas/{id}/miembros/{memberId}     ← QUIÉN ES     (Mamá, Papá)             · ya existe, intacto
/listas/{id}/acceso/{uid}            ← QUIÉN ENTRA  (uid, memberId, entroEn) · nuevo
/listas/{id}/invitaciones/{codigo}   ← LA PUERTA    (creadaPor, venceEn, revocada)
```

Separar “quién es” de “quién puede entrar” da tres cosas: **cero migración de ítems** (`agregadoPor` sigue siendo un memberId), una sola llave en las reglas (`exists(acceso/$(uid))`) que protege ítems, mercados y sugerencias por igual, y que la pantalla “¿Quién sos?” que ya existe pase a ser el momento en que se atan las dos.

**Un uid anónimo sigue siendo una identidad válida.** Lo que te hace miembro es la invitación, no tener cuenta. La familia no se entera de nada; el que llega con el link y sin invitación ve “pedile a alguien de casa que te invite”.

### Invitaciones sin backend

El hallazgo que hace viable todo esto en el plan gratis: **se puede canjear una invitación usando sólo reglas de Firestore**. Los `get()`/`exists()` dentro de las reglas los ejecuta el motor del lado del servidor y **no se re-evalúan contra las reglas**, así que una regla puede leer una invitación que el cliente tiene prohibidísimo leer. Verificado en el emulador (23 casos: el forastero no puede leer ni listar el código, y aun así el canje con ese mismo código funciona; rechaza vencido, revocado, de otra lista, inexistente, crear el doc de otro uid, y auto-ascenderse a dueño).

Sin Cloud Functions, sin plan Blaze, sin tarjeta. Y sin acoplarse a ningún proveedor de funciones: es Firestore puro.

**Las invitaciones viven adentro de la lista**, no en una colección global. Si fueran globales e ilegibles, el dueño no podría verlas y por lo tanto tampoco revocarlas: quedarían puertas abiertas que nadie sabe que existen. Adentro, el dueño lista las suyas y las revoca. De paso el código solo no sirve: hace falta lista + código, y el link queda `/l/<listId>#i=<codigo>` — el código en el fragmento, que **nunca viaja al servidor ni al Referer**.

El `uid` va también como **campo** del doc de acceso, no solo como su id: un collection group no puede filtrar por
id de documento (Firestore exige un path completo), así que sin el campo la Etapa 2 no podría responder "en qué
listas estoy".

**Vencen a los 7 días.** Las reglas no saben contar ni hacer read-modify-write atómico, así que **no hay código de un solo uso**: quien lo tenga entra las veces que quiera mientras viva. Se compensa con vencimiento corto y revocación.

**Expulsar es siempre dos operaciones**, en un lote: borrar el acceso **y** revocar las invitaciones creadas por ese uid. Verificado que si no, el expulsado vuelve a entrar con el código que él mismo había generado. Es el tipo de cosa que no se descubre razonando.

### Lo que cambió al construirlo

Tres cosas que el diseño no había previsto y que aparecieron escribiendo las reglas:

**El dueño vive en el doc de la lista, no como `rol` en cada acceso.** Así echar a alguien es borrar UN documento
en vez de reescribir roles, y el bug clásico de RBAC —auto-ascenderse— directamente no existe, porque `rol` no es
una clave de `acceso`. `esDuenio()` es un `get()` al doc de la lista, cacheado por request.

**Una lista tiene que nacer con dueño Y con la llave de su creador, en el mismo lote.** Sin esto, cuando la ventana
cierre, crear una lista te dejaría afuera de tu propia lista. Y obliga a `getAfter()` en la regla del acceso: durante
un batch el doc de la lista todavía no existe, así que un `get()` normal no vería al dueño.

**`get` y `list` van separados en `acceso`.** Leer LA PROPIA llave siempre se puede (si no, `entrar()` no podría
preguntar "¿ya la tengo?" sin tenerla: un círculo); enumerarlas exige ser miembro. No se puede escribir en una sola
regla porque en un `list` no hay documento y el comodín `uid` es null: comparar contra él explota con
`Null value error`. Es el mismo borde que impide que un collectionGroup filtre por id de documento.

### Un dueño, todos invitan

Cualquier miembro invita (es una casa, no una empresa). **Sólo el dueño** —el que creó la lista— expulsa y revoca; cualquiera se puede ir solo. La alternativa “todos pueden expulsar a todos” se descartó por el caso concreto: el padre bromista echando a la madre.

### La migración: ventana de 14 días

Al ir a sembrar los uid a mano apareció el bloqueante: **no hay forma de saber cuál es cuál**. Hay 21 usuarios anónimos en el proyecto (casi todos sesiones de prueba) y **Firestore no registra en ningún lado qué uid escribió qué**: `agregadoPor` guarda un `memberId` —una persona—, nunca un uid. Es la misma ausencia de auditoría que señaló la auditoría, vista desde el otro lado. Sembrar a mano sería adivinar, y adivinar mal es dejar a alguien de la familia afuera de su propia lista.

Pero **el dato que falta lo tiene cada teléfono**: en `heladera:yo:<listId>` cada uno ya sabe quién es. Así que la app se presenta sola:

1. **Sacar `/h` y desplegar.** A partir de acá el id lo tienen sólo los teléfonos de la familia. Va primero, sin excepción.
2. **Desplegar la app con auto-inscripción**: al abrir, escribe `acceso/{miUid}` con el `memberId` que ya tiene guardado. La regla lo permite **sólo para esta lista** y **sólo hasta una fecha clavada en las reglas**.
3. **Ellos abren la app como cualquier día** y se inscriben sin enterarse. De paso queda registrado quién es cada uid: el mapeo que hoy no existe lo produce el propio cliente.
4. **Cerrada la ventana**, se mira la lista de accesos con nombres y se borra lo que no se reconozca.
5. **Se saca la regla transitoria.**

El dueño de la lista existente se pone con la perilla `?reclamar` (como `?fps`): se abre una vez en el teléfono
del dueño y listo. No puede ser un script — la regla del primer reclamo exige `duenio == request.auth.uid`, así
que el reclamo tiene que salir del navegador de quien va a ser dueño; un script se haría dueño a sí mismo, con un
uid descartable que no vive en ningún teléfono. Sin botón: nadie la descubre, y aunque la descubra, solo funciona
mientras la lista no tiene dueño.

Riesgo acotado: una sola lista, con fecha de vencimiento, y todo lo que entra queda visible y revocable. Fricción para la familia: cero. Si alguno no abre la app en la ventana, se le manda una invitación, que es el flujo normal.

### La ventana se cerró antes de tiempo (2026-08-26)

La ventana estaba clavada al 2026-09-04, pero todos los miembros ya se habían inscripto (se verificó
enumerando las llaves como admin).
El dueño pidió cerrarla ya: **«mi lista es privada, los demás entran con invitación o podés crear la tuya propia»** —
que es exactamente el modelo de esta decisión, así que esperar nueve días más solo alargaba la exposición.

Con el cierre se fueron las tres piezas transitorias: `ventanaMigracion()` (y `puedeEntrar`, que colapsó
en `esMiembro`), la regla del primer reclamo (el dueño nace con la lista y no se transfiere; hay una regresión
que lo fija) y la perilla `?reclamar`. La suite que probaba «la ventana cerrada» con la fecha movida al pasado
ahora carga las reglas tal cual: son lo mismo. Y quedó una guarda: si `ventanaMigracion` reaparece en las
reglas, el test avisa.

Nota de la limpieza previa al cierre: una lista de prueba vacía se borró como admin a pedido del
dueño, y otra lista suya queda como privada.

### La barra de estado de la app instalada (2026-08-28)

> **Superado por D25 (2026-08-29).** El root cause es el bug de Chromium **#407420295**: en la PWA instalada la
> barra la pinta Chrome, y el `<meta theme-color>` **nunca** la pintó (medido: meta en `#1C1D1A`, barra en
> `#131313`). Los campos `dark_theme_color` / `dark_background_color` / `color_scheme_dark` son código muerto que
> Blink no parsea, y ya no están en el manifest. Lo que sigue es la **historia** de la saga —lo que se creía y por
> qué—, no el mecanismo vigente: el vigente está en D25.

El dueño: la barra salía crema sobre la app oscura, en la PWA instalada, «después de un deploy». La causa NO estaba
en lo que servimos (los `<meta theme-color>` claro/oscuro están intactos desde el nivel A): el cascarón del WebAPK
(shell 189, que Chrome actualiza solo) dejó de seguir el meta de la página en runtime y pasó a usar sus colores
HORNEADOS del manifest — donde solo existía el crema. La correlación con el deploy fue calendario: coincidió con
la actualización silenciosa de Chrome. El diagnóstico lo destrabó el dueño mostrando `chrome://webapks`: «Dark theme
color» vacío en TODAS sus PWAs → ese campo sale del manifest (el mecanismo nuevo de Chromium, `color_scheme_dark`,
camino al estándar), no de los metas.

Tres hallazgos para no redescubrir:
- Un WebAPK solo se regenera si su Chrome VE un cambio en el manifest: los miembros que no conoce los filtra antes
  de comparar (el Update daba «Succeeded» con Version code clavado en 1).
- **VitePWA inyecta un `theme_color` default (#42b883, el verde de Vue) si el campo falta**: quedó desplegado en
  producción unos minutos sin que ningún test pudiera verlo — se cazó mirando el manifest EN EL AIRE. La ausencia
  real se logra con la clave presente y `undefined` explícito.
- Un sincronizador runtime del meta no sirve (el cascarón lo ignora) y SABOTEA: borraba del DOM el meta oscuro
  que una futura horneada podría leer. Se agregó y se quitó el mismo día.

Estado final de esa vuelta (plan C, ya superado por D25): el manifest NO lleva `theme_color` — la barra cae al
color por defecto del sistema, que sigue el modo de Android (funcional, no es la paleta) — y dejaba declarados
`dark_theme_color` y `color_scheme_dark` con el --paper oscuro, apostando a que el Chrome de la familia algún día
los parseara — apuesta que D25 cerró: Blink no los mira, se sacaron del manifest. El hardcode «oscuro para todos»
se descartó: fijaba el modo equivocado.

### Borrar listas (2026-08-27)

El dueño, al encontrarse con una lista congelada que ya no usaba: «Debería poder borrar listas».
Se agrega `Db.borrarLista`: **solo el dueño**, físico y **sin deshacer** — no hay papelera para una lista
entera, y la pregunta lo dice sin eufemismos («Se borra todo lo anotado, para todos los miembros, y no se puede
deshacer»). Vive en «Quién tiene acceso», al lado de «Salir de esta lista».

Firestore no borra en cascada: el Db desarma por lotes (ítems, miembros, súper, llaves, invitaciones, lo
aprendido) y borra el doc de la lista **al final y solo** — las reglas de los subdocs preguntan por el dueño con
un `get()` a la lista, y leer un doc que el mismo lote borra explota (el mismo borde del alta, al revés). El
doc de la lista se autoriza por su propio `resource.data.duenio`. El borrado físico de ítems existe SOLO como
parte del desarme: para todos los demás sigue siendo lógico.

Con esto el índice de la home pasa a ser **verdad del servidor** (`getDocsFromServer`): una lista borrada —o de
la que te echaron— no queda zombie en «Tus listas» por el recuerdo local, que solo manda cuando no hay señal.

### El QR y la pegatina se van

Decisión del dueño: *“el QR pasó tan a segundo plano que estoy pensando en sacarlo por completo”*. Se va el redirect `/h`, que era el agujero más barato de tapar y no dependía de nada. Costo para la familia: **un toque** — la lista sigue en `heladera:ultimaLista` de cada teléfono, así que abren la app y les aparece “Abrir «Casa»”.

Esto **reabre C3** (que definía QR/NFC como accesos rápidos con link corto). `?anotar` se queda sin usuarios —lo usaba sólo `/h`; el link de “Sumar a alguien” nunca lo pasó— pero el mecanismo se conserva en el router: es exactamente lo que va a querer el índice de listas para “abrir para anotar” desde una fila.

### App Check: no, y por qué

Es la única defensa estructural contra que alguien queme la cuota diaria, y a nuestra escala saldría gratis (reCAPTCHA Enterprise da 10.000 evaluaciones por mes; nosotros gastaríamos ~500, y funciona en Spark sin tarjeta). Igual **no se pone**, por proporción:

- El token de App Check vence (1 hora por defecto; configurable hasta 7 días) y **el auto-refresh viene apagado**. Hay reportes documentados de tokens vencidos que hacen fallar el lote encolado al reconectar. Esta app es offline-first y su caso crítico es *anotar en el súper sin señal*: el modo de fallo sería “se perdió lo que anotó”, que es lo peor que le puede pasar.
- Mete un script de Google en cada carga. Hoy la app no hace ni una request a terceros.
- Nos obliga a debug tokens en localhost, en el LAN y en los tests del emulador.
- Y el atacante de este modelo de amenaza no existe: sin puerta pública, con `robots.txt` bloqueando crawlers, sin el dominio en los logs de Certificate Transparency (el certificado es comodín `*.web.app`, así que el subdominio no aparece) y con un id de 119 bits, hay que saber que el proyecto existe **y** tener ganas de romperlo.

En su lugar: validar tipo y tamaño en el alta de lista, así una lista basura pesa bytes en vez de 1 MB — eso convierte “me llenan el GiB para siempre” en “me gastan las escrituras de un día”, que se reinicia solo a medianoche. Y la alarma ya existe: el panel de uso de Firebase. Si alguna vez hay un pico, se prende App Check **primero en modo monitoreo** (que no bloquea nada) y ahí sí se prueba el offline con calma. Si la app se hace pública o va a una store, pasa a ser obligatorio.

### Etapas

Se hace por partes, y cada una se puede desplegar sola:

- **Etapa 0** — sacar `/h`; tapar los agujeros de validación con un test por rama; borrar sugerencias con mantener apretado. No cambia el modelo.
- **Etapa 1** — `acceso/{uid}` + invitaciones + expulsar + la ventana de migración. Acá muere “el link es la contraseña”.
- **Etapa 2** — “Tus listas”: índice por `collectionGroup('acceso')` filtrando por uid **como campo** (con `documentId()` no se puede: Firestore exige un path completo en collection group, así que el uid va también denormalizado), volver desde la lista, y renombrar lista (las reglas ya lo permitían, la app nunca lo expuso).
- **Etapa 3** — cuenta permanente con Google sign-in, para que la membresía no se pierda si alguien limpia los datos del navegador. `linkWithCredential` **conserva el uid**, así que no hay migración: es aditivo. Ojo cuando llegue: como servimos desde `web.app` y no desde `firebaseapp.com`, hay que poner `authDomain` al dominio propio (el iframe cross-origin se rompe con el particionado de storage de Chrome) y usar `signInWithRedirect`, nunca popup.

Play Store queda descartado: un TWA no da **ninguna** capacidad web extra (mismo Chrome, mismas APIs, mismo service worker) y cuesta US$25, verificación de identidad con documento, política de privacidad publicada, formulario Data safety, content rating, 12 testers durante 14 días corridos y un bump de target API cada agosto para siempre. El QR en la heladera distribuía mejor que Play — y ahora ni el QR hace falta.

## D23 · La cuenta permanente (2026-08-28)

El uid anónimo vive en el IndexedDB del navegador: limpiar los datos del sitio, cambiar de teléfono o perderlo borra la llave. Para un miembro es una molestia (que lo vuelvan a invitar); para el dueño es grave: una lista cuyo dueño perdió su uid queda sin nadie que pueda invitar-revocar, expulsar ni borrarla. La Etapa 3 ata el uid a una cuenta de Google — `linkWithRedirect` **conserva el uid**, así que no hay migración ni cambio de reglas: las llaves, el dueño y `firestore.rules` quedan tal cual.

**Opcional para siempre.** Nadie está obligado: los uid anónimos siguen funcionando igual (la familia ya está adentro y no tiene por qué enterarse). Y en la interfaz `Db` la abstracción es «guardar tu acceso / entrar con tu cuenta» — Google es la implementación de hoy, no una dependencia del producto.

**Una cuenta es UNA identidad, y eso está bien.** Si guardás la cuenta en el teléfono y después entrás con ella en la compu, los dos dispositivos pasan a ser el mismo uid: una sola llave, una sola entrada en «Quién tiene acceso». Parecía chocar con las etiquetas por dispositivo (D22); decisión del dueño: es mejor así — *«está feo ver Mamá | tablet, Mamá | celu, Mamá | compu… es mucho mejor ver uno de cada»* — y la etiqueta deja de ser una necesidad de distinción **en el camino de la cuenta**. En el anónimo, que sigue vivo, no: ahí dos dispositivos que eligen a la misma persona son dos llaves con el mismo nombre. Al día siguiente la etiqueta se borró igual, y ese caso pasó a resolverse con el dato que la llave ya tiene (D26).

**Los tres viajes** (todos por redirección; popup nunca: en el WebAPK es frágil):

- **Guardar** (`linkWithRedirect`) — en el dispositivo que tiene tus listas. El uid no cambia; al volver, la home dice con qué email quedó.
- **Entrar** (`signInWithRedirect`) — en un dispositivo **sin** listas: pasa a ser el uid de la cuenta y el índice lo encuentra solo. La home solo lo ofrece cuando no hay listas; en uno con listas cambiaría la identidad y escondería lo que hay. Ese caso existe igual, pero por el camino que avisa:
- **El choque** (`credential-already-in-use`) — guardaste contra una cuenta que ya guarda otro acceso. La credencial que viene en el error queda en memoria y la home ofrece «entrar con esa cuenta» — detrás de una pregunta que dice la consecuencia (este dispositivo pasa a ver las listas de esa cuenta; su llave vieja queda atrás y el dueño de cada lista la puede sacar) — o «probar con otra». El canje usa `signInWithCredential`, sin segundo viaje a Google, y recarga la app: todo se re-deriva de la identidad nueva.

Lo que hubo que saber para construirlo:

- **`authDomain` pasa a nuestro dominio** (`heladera-ec2b4.web.app`; era `…firebaseapp.com`): la redirección tiene que ser same-origin para los navegadores que bloquean el almacenamiento de terceros, y Firebase Hosting ya sirve los handlers de auth (`/__/auth/*`) en nuestro dominio.
- **El regreso de la redirección se procesa UNA vez** en `firebase.ts` (`getRedirectResult`), y el sign-in anónimo espera a ese regreso: un `signInAnonymously` corriendo por encima de un regreso a medio procesar pisaría la sesión recién vinculada.
- **El emulador de Auth banca el viaje entero** (widget falso de cuentas, mismo origen vía el proxy de Vite, que ya reenviaba `/emulator`): los tres viajes se probaron de punta a punta en el navegador contra el emulador, incluida la recuperación (dispositivo limpiado → entrar → mismo uid → «Casa» vuelve sola del servidor) y el choque completo. En node no hay redirección: el contrato cubre `miCuenta()`, y el resto vive en el fake, en los tests de la Home y en esa prueba manual.
- **Habilitar el proveedor Google no se puede por API** (la consola autoprovisiona el OAuth client con un servicio interno; la API admin exige un `client_id` que no tenemos): son dos clics en la consola, una sola vez. Ojo al probar en producción: si el viaje muere en Google con `redirect_uri_mismatch`, al OAuth client autoprovisionado le falta `https://heladera-ec2b4.web.app/__/auth/handler` entre las redirect URIs (a veces solo autoriza `firebaseapp.com`) y se agrega en GCP → Credentials.

Y lo que cazó la revisión adversaria del diff (cuatro lentes + un verificador por hallazgo), que ni los tests ni la prueba manual podían ver:

- **El service worker se comía los handlers de auth.** `navigateFallback` servía `index.html` para CUALQUIER navegación — incluida `/__/auth/handler`, adonde vuelve Google. En el emulador no hay SW, así que la prueba de punta a punta pasó igual; en la app instalada el viaje entero habría muerto. Fix: `/__/*` (el namespace reservado de Firebase Hosting) en la `navigateFallbackDenylist`.
- **La promesa que no resuelve es parte del contrato.** `signInWithRedirect`/`linkWithRedirect` navegan: su promesa no resuelve nunca. Todo lo que tenga que pasar sí o sí (olvidar el recuerdo local de la identidad vieja) va ANTES del `await`, no después — después es código muerto en el camino real.
- **La credencial del choque vence** (~1 h, y vive en memoria de una página que puede pasar la tarde en segundo plano). Si el canje falla con ella, se descarta y se cae al viaje completo por redirección — conservarla era un bucle de error sin salida.
- **Límite conocido, sin arreglo por ahora:** guardar el acceso en la cuenta equivocada es permanente (no hay "desvincular" en la app), y una lista cuyo único dueño cambió de identidad queda sin administrador — el texto de la pregunta del choque lo dice sin prometer nada falso.

## D24 · El circuito de deploy (2026-08-28)

Pedido del dueño después de la Etapa 3: *"no deployes de una, construite y configurate una verificación de deploy, un CI y todo un circuito de auditorías y reviews"* — tres expertos que auditen, otro equipo de tres que revise la auditoría del primero, y un loop hasta que todos pasen. El disparador de fondo es real: el hallazgo del service worker comiéndose `/__/auth/*` demostró que hay una clase de errores que ni los tests ni la prueba manual en el emulador pueden ver — viven en el artefacto publicado o en el criterio, no en el código.

El circuito quedó en dos mitades, y el proceso completo versionado en el repo (`CLAUDE.md` + `.claude/skills/deploy/SKILL.md`):

**La mitad determinista** — `npm run verificar` (scripts/verificar-release.mjs): las puertas en orden, de lo barato a lo caro, viven en el propio script (los `puerta('…')`) y acá no se copian — arranca por la config del `.env`, la que corta antes de gastar tsc, tests y emulador, y cierra con las auditorías del artefacto, que codifican las regresiones que ya nos mordieron una vez: el SW con `/__/` en la denylist, el manifest sin el `theme_color` que VitePWA inyecta si falta (el verde Vue de la saga de la barra) y sin los campos oscuros que Blink no parsea (la política del manifest la fija D25, acá no se copia), la familia cromática del index (los dos `<meta theme-color>` y el `<meta color-scheme>` que gobierna el canvas del navegador antes de que aplique el CSS, los tres contra `tokens.css`), la hoja publicada auditada por sus TRES cargas —los tokens derivados de `tokens.css`, la capa global derivada de `base.css` y al menos una `@font-face` con `url()` propia, que son las cuatro cosas que `src/main.tsx` importa en bloque— y no por un token (mirándolo por `--paper` solo, una hoja de 128 bytes salía en verde), y ningún nombre personal en el bundle — más una custodia que no salió de un incidente sino del circuito: el rewrite SPA, la única pieza de la config de hosting que habla de una URL que no es un archivo, mandando los links de lista al index, y sirviéndolos con los headers que la política le exige a todo lo demás. `npm run deploy` (scripts/deploy.mjs) corre esas puertas, publica firestore (reglas + índices) y hosting juntos, y compara **lo publicado** byte a byte contra el dist (la CDN ya sirvió un index viejo una vez), más el deep link de la SPA (`/l/<listId>`: la única URL por la que entra la familia y la única que no es un archivo — la fabrica el rewrite, así que un release impecable puede estar 100% inalcanzable) devolviendo el index **con los headers de la política** —hosting matchea headers por path de PEDIDO, y ese path tampoco lo alcanzaba la custodia, que iteraba archivos—, más el handler de auth respondiendo. `deploy.mjs --solo-verificar` audita producción sin tocarla (con `--base <url>`, un canal de preview), y `verificar-release.mjs --solo-dist` re-audita el artefacto sin re-correr todo. Probado en las dos direcciones: pasa en verde, y **falla** cuando se le envenena el dist a propósito (un nombre en el index, el verde Vue en el manifest).

**El punto ciego de las dos mitades: el `.env`.** Es la única entrada del build que no está en git — no sale en `git status` ni en el `git diff HEAD` que audita el circuito de agentes — y es la que decide si el bundle habla con Firestore o con el Db falso de la lista de ejemplo. Con un `.env` de otra máquina, el dist pasaba TODAS las auditorías de forma (manifest, metas, íconos, headers, nombres: todas preguntan cómo está HECHO el artefacto, ninguna si es EL artefacto), y la comparación byte a byte en el aire tampoco lo veía, porque compara lo publicado contra el MISMO dist: confirma el transporte, nunca la procedencia. Por eso ahora la forma no alcanza — la identidad se afirma exigiendo que el projectId de `.firebaserc` viaje adentro de algún publicable (el bundle lleva horneada la config de Firebase), un candado que vale también bajo `--solo-dist`, donde la puerta del `.env` no corre.

**La mitad de criterio** — `Workflow {name: 'auditoria-release'}` (.claude/workflows/auditoria-release.js): **dos consultoras que no se conocen**, tres lentes cada una (UI, UX, arquitectura), auditando la misma release **a ciegas**. El primer diseño tenía a la empresa B *leyendo* el informe de A para revisarlo; corrección del dueño: *"el segundo equipo no tiene que tener ni idea del primer equipo… como si fuera una empresa totalmente diferente"* — y tiene razón por el anclaje: quien lee un informe ajeno antes de mirar el código termina corrigiendo el informe, no auditando. B sabe que A existe y que la contrataron para encontrar lo que a A se le escapó, pero no ve una letra de lo que A escribió. El careo de los dos informes lo hace el cliente afuera del workflow: lo que una firma encontró y la otra no deja a alguien en evidencia, lo que encontraron las dos es casi seguro real, y lo que afirma una sola se verifica contra el código. Los falsos positivos adjudicados viajan a la corrida siguiente por `args.aclaraciones` (contexto del cliente, simétrico para las dos firmas), así el loop converge sin contaminar la ceguera. El loop: arreglar y volver a correr **hasta que las seis firmas den `pasa` sin hallazgos**. Recién ahí, y con el "dale" del dueño (el circuito verde no reemplaza su aprobación), se deploya.

Lo que NO es: CI en la nube. El repo no tiene remoto — no hay dónde correr GitHub Actions. El día que tenga (decisión del dueño: publicar el repo), las puertas deterministas se mudan a un workflow de Actions tal cual están; el circuito de agentes queda del lado de Claude, que es donde viven los agentes.

**El bautismo (misma noche):** la primera corrida real del circuito fue sobre el circuito mismo, y las dos consultoras, a ciegas, convergieron en un bloqueante que TODO lo anterior había dejado pasar: **los sourcemaps se publicaban en hosting con el nombre del dueño adentro** (el `sourcesContent` lleva el fuente entero, comentarios incluidos; la empresa B lo verificó con un GET al `.map` vivo en producción) — mientras la puerta de nombres los eximía a propósito. Convergieron también en que la comparación «byte a byte» enumeraba a mano y se olvidaba de `registerSW.js` y `workbox-*.js` (la cadena de arranque del SW), y en que deployar `--only hosting` dejaba al circuito ciego a la deriva de reglas. Todo arreglado en la misma vuelta: `**/*.map` al ignore de hosting con una puerta que lo exige, la lista de publicables sale de recorrer `dist/` (helper `scripts/dist-publicado.mjs`, compartido), el deploy publica `firestore,hosting` siempre juntos, los colores de la puerta se leen de `tokens.css` en vez de copias congeladas (los campos de color del manifest, y los metas del index validados con media y color), el chequeo de nombres es case-insensitive, publicar exige el flag `--dale` (la palabra del dueño, codificada), y los fallos post-publicación dicen en pantalla qué pasó y cómo se vuelve (rollback desde la consola de Hosting, o `hosting:clone` por CLI). La violación viva en producción (el `.map` con el nombre) se saca en el próximo deploy, que ya no los sube. Moraleja del bautismo: el circuito pagó su costo en la primera corrida.

## D25 · La barra de estado: el root cause, dos semanas después (2026-08-29)

La saga de la barra tenía tres «arreglos» nuestros y una premisa falsa. Acá está lo que pasaba de verdad,
verificado contra el código de Chrome 152 (branch-heads/7977), la documentación de Chrome y —sobre todo—
**medido en el teléfono del dueño**, que es lo único que puede ver esa franja.

**El root cause no era nuestro.** Las PWAs instaladas en Android **no pueden dibujar debajo de la barra de
estado**: es un bug conocido y asignado de Chromium (**#407420295**, marzo 2025; confirmado por un ingeniero
de Chrome en marzo de 2026). El arreglo —el «short-edges cutout mode»— **ya está escrito en Chrome 152 y
está apagado**, esperando salir. Mientras tanto, esa franja la pinta **Chrome**, no la página: por eso
ningún CSS nuestro la alcanza.

Lo que quedó probado, y echó abajo lo que creíamos:

- **El `<meta theme-color>` NO pinta la barra de la app instalada.** Medido: con el meta en `#1C1D1A`, la
  barra seguía en `#131313`. (Sí funciona en el navegador, que es donde siempre se vio bien.)
- **Los campos `dark_theme_color` / `dark_background_color` / `color_scheme_dark` son código muerto**:
  `manifest_parser.cc` de Blink no los mira y el mojom los marca «obsolete fields, to remove». La apuesta de
  la saga —«cuando su Chrome los parsee, la barra vuelve sola»— no podía pagar nunca. Se sacaron del manifest.
- **El `theme_color` horneado SÍ la pinta**, pero con UN solo color para los dos modos.
- **Y hornear cualquier color está mal**, por una razón que aportó el dueño y que ninguna de las cuatro corridas
  de expertos había visto: **el color de los íconos de la barra (reloj, batería) lo decide el MODO del
  sistema, no nuestro color**. Barra oscura en modo claro = reloj negro sobre negro. Barra clara en modo
  oscuro = reloj blanco sobre crema, y además un flash en la cara de noche. Un color fijo pierde esa pelea
  siempre.

**La decisión: no hornear nada.** Sin `theme_color`, Chrome pinta con su propio par fondo/íconos — siempre
legible y siempre siguiendo el modo del sistema. Y el día que Google active la feature, **gana el fondo real
de la app (`--paper`) y la barra pasa a la paleta sola, por modo, sin que toquemos una línea**: verificado
prendiendo `chrome://flags/#web-app-short-edges-cutout-mode` en el teléfono — con el flag activo las DOS
barras (estado y gestos) toman el color de la app, y ahí el `theme_color` horneado ni siquiera gana.

> **Corregido el 2026-08-30, y es la parte importante de este bloque.** Acá decía «la app ya está lista para
> ese día desde el nivel A: declara `viewport-fit=cover` y toda la UI usa `env(safe-area-inset-*)`». **Es
> falso, y la forma en que se coló es el error que hay que no repetir**: con el flag prendido se midió UN
> aspecto —el color de las dos barras— y de ese resultado se concluyó que la app entera estaba lista para
> edge-to-edge. Se generalizó de un color a un modo de ventana. Lo que en realidad pasa con el flag activo lo
> encontró el dueño usando la app: **el teclado deja de empujar la pantalla y tapa la barra de anotar**, en la
> app instalada, en cualquier campo. Probado en las dos direcciones (flag en default → anda; flag activa →
> se rompe), que es la única forma en que esto cuenta como sabido.
>
> Y no es «no prendas el flag»: **el día que Google lo active por default, esto le pasa a toda la familia
> sin que nadie toque nada**. Lo que era un beneficio esperado —la barra tomando la paleta sola— viene
> atado a una regresión que hoy no está cubierta. El centinela de los lunes deja de ser «avisame cuando
> llegue lo lindo» y pasa a ser **«avisame antes de que llegue lo que rompe»**.
>
> Por qué se rompe, con el mecanismo y no con la anécdota: la app depende de que el sistema le achique la
> ventana (`interactive-widget=resizes-content` en el `<meta viewport>`), y de eso vive el `100dvh` de
> `PantallaLista.module.css`. El camino alternativo existe —`--kb-inset`, medido con `visualViewport` en
> `src/ui/useVisualViewport.ts`— pero está escrito para el mundo en que la ventana NO se achica (iOS), y
> calcula `innerHeight - vv.height - vv.offsetTop` con un piso de 40 px. En una ventana edge-to-edge los dos
> mecanismos pueden reportar «no hay nada que hacer» a la vez, y ahí nadie sube nada. **Eso último es una
> hipótesis, no una medición**: los números reales de esa ventana no los tiene nadie todavía, y este
> documento ya se equivocó una vez por afirmar sin medir. El arreglo empieza midiendo en el teléfono, como
> D21.

**La única excepción, y está sancionada: `background_color`.** «No hornear nada» tiene un color horneado que
se queda: `background_color: '#F6F1E7'` en `vite.config.ts`. No contradice la regla de arriba porque no pinta
la barra: pinta el **splash** de la app instalada — otra superficie y otro momento (el arranque en frío, antes
de que exista una línea de CSS nuestro). Chrome no tiene variante por modo para él, y la prueba la trae esta
misma release: `dark_background_color` es uno de los tres campos que acá se borran por código muerto. Y
ausente no es neutro — sin el campo Chrome cae a **blanco**, que es peor que el crema en los DOS modos, así
que el crema gana la comparación real, no la ideal. **Límite conocido, sin arreglo por ahora:** con el
teléfono en oscuro, el arranque en frío abre en crema a pantalla completa antes de que aparezca la pizarra —
el mismo flash que el párrafo de arriba usa como argumento, en una superficie mucho más grande que la franja
de la barra. Y va dicho entero, porque es la única pieza de esta decisión que se afirma sin respaldo: **el
splash no lo midió nadie en el teléfono** (todo el resto de acá arriba sale de una medición del dueño o del
código de Chromium). Se banca igual porque las dos alternativas son peores, y son justo las dos que el próximo
lector NO tiene que tomar: **borrarlo** (Chrome pinta blanco) u **hornearle el papel oscuro** (splash negro en
modo claro, que es exactamente el error de pareja que este bloque enseña a no cometer). Si algún día molesta,
el orden es **medirlo primero** y recién ahí elegir un neutro que no queme de noche ni desentone de día, y
re-anclar la puerta a ESE token: elegir el color sin medir es el error que ya costó tres deploys. La puerta de
`verificar-release.mjs` exige el claro, y su mensaje dice por qué.

**Cómo nos enteramos de que salió** (porque «lo revisamos cuando salga» es la forma elegante de no revisarlo
nunca): hay un centinela programado que chequea el estado del bug **#407420295** y avisa cuando la feature
pase a activada por default. Cuando eso pase, no hay que hacer nada en el código — solo confirmar en un
teléfono que la barra tomó la paleta, y borrar este párrafo. Con el teléfono en la mano y en modo oscuro,
aprovechar y mirar el splash: es la medición que le falta al párrafo de `background_color`.

**El costo de haber asumido:** tres deploys de «arreglo» que no arreglaban (un sincronizador de metas que
duraba media hora, campos de manifest inertes, y el plan C, que llegó al estado correcto por la razón
equivocada: sacó el único color que había creyendo que la barra iba a volver a la paleta, y lo que hace es
dejarla en el par de Chrome — que es, ahora lo sabemos, el estado que queremos), y una premisa falsa escrita
en este mismo documento que guió mal dos investigaciones enteras. Lo que finalmente lo destrabó: **una
medición del dueño** (el hex exacto: `#131313`, no «negro») y **un link que trajo él** — ninguna de las
cuatro corridas de expertos, que fueron al código de Chromium sin preguntarse antes si era un bug conocido
con número.

## D26 · Las etiquetas por dispositivo se borran (2026-08-29)

Las etiquetas nacieron en D22 para un problema concreto: sin cuentas, cada teléfono era una llave distinta, y
tres llaves diciendo «Mamá» no se podían distinguir. La cuenta permanente (D23) le sacó casi todo el trabajo:
una cuenta es UNA identidad, así que la tablet, el celu y la compu de la misma persona pasan a ser una sola
llave. Lo que quedaba era una función casi sin trabajo, y molesta: *«ahora tenemos la cuenta de Google así que
son inútiles y hasta estorbosas»*. Se borra entera, no se deja apagada: un editor adentro de la lista de
accesos que nadie usa es peso que el próximo lector tiene que entender antes de poder cambiar nada alrededor.

**Lo que la cuenta NO disuelve — y con qué se cubre.** La cuenta unifica llaves *solo en el camino de la
cuenta*, y D23 la deja **opcional para siempre**: los uid anónimos siguen funcionando igual. Ese es el camino
de arranque, el que protege la regla «sin cuentas obligatorias», y hoy es el de la familia entera. Ahí dos
dispositivos que eligen a la misma persona siguen siendo dos llaves con el mismo nombre. Sacar la etiqueta sin
más dejaba dos filas idénticas justo donde se decide algo destructivo, y una pregunta —«¿Sacarle el acceso a
Mamá?»— que decía lo mismo para las dos; peor todavía con dos llaves sin persona elegida. Se cubre —hasta la
resolución del minuto; el límite está escrito al final de este párrafo— subiendo la
granularidad del único dato que ya las separa: la fila muestra el día **y la hora** de entrada (`cuandoDicho`,
que comparte el instante y los **tramos** con «✓ Mamá · 4/8 18:32» pero no su formato; nada de reformatear
fechas a mano) y la pregunta repite ese dato — *«La llave que entró el miércoles a las 20:14 deja de ver la
lista en el acto…»*. Siempre, sin preguntarse antes si hay colisión:
el valor se calcula una vez por fila y viaja igual a la fila y a la pregunta, así que no hay dos criterios que
se puedan desincronizar. El desempate que antes se escribía a mano ahora sale del dato que la llave ya tenía.
Y viaja a una **tercera** superficie: el **nombre accesible del botón** que saca esa llave — *«Sacarle el acceso a
Mamá, entró el miércoles a las 20:14»*. En pantalla ese botón se apoya en la fila que tiene al lado; recorriendo por controles
(el rotor) no hay «al lado», y ese nombre es todo lo que se escucha de la fila. Sin el «cuándo» ahí adentro, la
fila desempataba y el control seguía siendo, para quien no mira, uno de N botones destructivos iguales — que es
justo el caso que motivó subir la granularidad.
Ese único valor puede además ser **nulo** —`entroEn` es `number | null`, y las reglas dejan el campo opcional al
crear la llave—, y entonces la pregunta usa la frase de D22 sin cláusula temporal, igual que la fila que ya lo
escondía: cuándo entró no se sabe, y una pregunta destructiva no inventa una hora que nadie sabe. El nombre del
botón hace lo mismo: dice a quién, y nada más.
**Límite conocido, sin arreglo por ahora:** el desempate tiene resolución de **minuto**, y nada acota la
separación entre dos `entroEn` —los escribe `serverTimestamp()` en `db/firestore.ts`, el lote de `crearLista` y
`entrar`—. Dos llaves que entran en el mismo minuto de reloj dicen **lo mismo en las tres** superficies que
llevan el «cuándo»: la fila, el nombre accesible del botón y la descripción de la pregunta. Y no es un borde raro: es
el link de invitación que cae en el grupo de WhatsApp y lo abren dos personas seguidas, o el celu y la tablet de
la misma persona con medio minuto de diferencia — el camino anónimo de D23 por el que existe todo esto. Ahí el
dueño saca una al azar. Sale igual: la ventana es angosta, no es regresión —lo que había antes (`haceCuanto`)
colapsaba lo mismo, «hace 2 min» las dos, y el único desempate era una etiqueta manual que esta release borra
por decisión— y sacar el acceso se deshace con una invitación nueva. Queda **pineado** en
`src/domain/tiempo.test.ts`, abajo del invariante de desempate, para que el día que alguien suba la precisión
ese test falle y lo mande a actualizar este párrafo. La salida, si alguna vez molesta, es desempatar con el
**uid** —el único dato de la fila que sí es único— y solo en las filas que colisionan; **no** subir a segundos:
angosta la ventana sin cerrarla (dos `serverTimestamp()` pueden caer en el mismo segundo) y desincroniza la
precisión de los dos formateadores que comparten `tramoDe`, que es justo lo que este cambio vino a evitar. Y de
paso, cuál superficie carga el «cuál»: el **nombre** del diálogo nunca desempata —`expulsarTitulo(persona)` da
lo mismo para dos «Mamá» y `expulsarTituloLlave` es una constante—; lo hace la **descripción**, que es de lo que
habla el párrafo de acá abajo.

Un paso más abajo: que la pregunta **muestre** el «cuándo» no es que lo **diga**. Al abrir un `<dialog>` el lector
anuncia su **nombre** —el título, idéntico para las dos llaves de Mamá— y el control enfocado (Cancelar); el `<p>`
de abajo está pintado adentro, pero no participa de ninguno de los dos. **Un dato que decide un borrado no alcanza
con pintarlo adentro del diálogo: el diálogo tiene que declararlo como su descripción** (`aria-describedby`). El
cable vive en `Sheet` y lo pasa `Confirmar`, así que toda pregunta destructiva que traiga texto queda cubierta sin
que nadie tenga que acordarse. La lección es la del toast en su versión de accesibilidad: verificar lo que el
diálogo CONTIENE no es verificar lo que ANUNCIA — el test mira nombre y descripción accesibles, no `textContent`,
que pasaba verde con el bug adentro. El hueco venía de D22; lo paga esta release porque es este cambio el que metió
ahí adentro el único dato que decide CUÁL llave se borra.

Falta una: la llave que **todavía no dijo quién es** no tiene nombre que entre en la frase. Meter ahí el rótulo
de relleno —que es una oración, «Todavía no dijo quién es»— daba un título que no es una pregunta: *«¿Sacarle el
acceso a Todavía no dijo quién es?»*. Esa llave se nombra por lo que es —*«¿Sacarle el acceso a esta llave?»*— y
el CUÁL lo sigue diciendo el texto de abajo, con la fecha y hora de entrada. Y son **tres** las superficies que la
nombran adentro de una frase: el título de la pregunta, el **nombre accesible del botón que la abre** —que en el
rotor es todo lo que se escucha de esa fila— y el **aviso de después**, una capa más abajo. El botón la nombra por
su dato de entrada —*«Sacarle el acceso a la llave que entró el miércoles a las 20:14»*—, así dos llaves sin nombre tampoco suenan
iguales ahí; si no se sabe cuándo entró, la nombra igual que el título: *«esta llave»*. Cómo se llama esta llave
adentro de una oración se decide en **un solo lugar** (`textos.ts`) y las tres lo consultan: la primera pasada lo
arregló como una rama en el consumidor, y el segundo consumidor —abierto por el mismo cambio, dos líneas al lado
del que sí la consultaba— nació repitiendo la frase rota. La fila no cambia (sigue mostrando el rótulo); el toast
**sí**: le llegaba el rótulo y componía la misma frase rota una capa más abajo —*«Todavía no dijo quién es ya no
tiene acceso»*—, en el aviso que sale justo DESPUÉS de la acción destructiva y que el lector de pantalla lee. Ahora
viaja el hecho —la persona, o `null`— y el copy dice *«Esa llave ya no tiene acceso»* cuando no hay nombre: el
rótulo se queda donde se PINTA, la fila. La primera vuelta arregló el título y de paso **pinneó** el payload del
toast en un test («sigue recibiendo el rótulo que la fila muestra»): verificar lo que el código MANDA no es
verificar lo que la familia LEE, y por eso el test ahora compone la frase final con el copy que la va a recibir.
El título roto no lo trajo D26: nació con la pregunta en D22 y nadie lo
había leído en voz alta — la etiqueta nunca viajó a la confirmación, así que tampoco lo tapaba. Lo que cambia
acá es que esa llave se queda sin ninguna otra cosa que mostrar, y que la revisión del copy pasó por encima.
Un rótulo de relleno sirve para *mostrar* un vacío, no para *interpolarlo* adentro de una frase.

**Y la misma lección en el otro argumento, que se llevó una vuelta más.** Las cuatro superficies interpolan DOS
cosas —`persona` y `cuando`— y la regla de arriba se aplicó a la primera dejando intacta la segunda, a dos tokens
de distancia. Lo que el «cuándo» llevaba adentro era la etiqueta de `meta.comprado`: un formato escrito para UN
slot, donde el «·» hace el trabajo del «a las». Sin ese «·» no lo hace nadie, y las frases quedaban *«Entró
20:11»*, *«La llave que entró mié 20:14 deja de ver la lista…»*, *«Sacarle el acceso a Mamá, entró 3/8 20:14»* —
y esta última **solo se escucha**: el lector lee «mié» como la abreviatura que es y «3/8» como una fracción, justo
en la superficie que se agregó para que el rotor no tuviera N botones iguales. Se arregla con **un solo valor en
prosa** (`cuandoDicho`), calculado igual una vez por fila y mandado igual a las cuatro, sobre los **mismos tramos**
que `fechaYHora` —extraídos a `tramoDe`, para que no nazcan dos criterios— así que el desempate al minuto no se
toca. *Un valor formateado para una etiqueta al margen no se interpola en una oración: el «·» era la preposición.*
Y la regla es del **slot**, no de las cuatro superficies que tocó el diff: vale para todo lugar de esta hoja que
arme una oración con un instante. Había una **quinta**, intacta desde D22 y dos elementos más abajo en el mismo
componente —el «Creada ___» de las invitaciones abiertas—, que quedó con `haceCuanto` y decía *«Creada mié»* al
lado de *«Entró el domingo a las 15:00»*. No era un borde: `haceCuanto` colapsa de 1 a 7 días al día abreviado y
ese es el tramo de **toda** invitación listada, porque vencen a los siete. Ahora recibe `cuandoDicho`, y sin fecha
esconde el renglón en vez de decir *«Creada recién»*. *Un arreglo que se barre sobre el diff en vez de sobre el
predicado deja viva la instancia que nadie estaba editando.*
Y la verificación que lo hubiera matado costaba dos segundos —componer la frase final y leerla en voz alta—: este
documento **citaba las tres frases rotas como si fueran la meta**. Todo lo que D26 verificó del «cuándo» fue el eje
DATO (que viaje, que desempate, que aguante `null`); ninguna aserción miraba si el string resultante era castellano.
**Y la fecha de más de siete días también se dice en letras** —*«el 4 de agosto a las 09:15»*—, porque ese tramo no es
un borde: es el estado de RÉGIMEN. Una lista familiar que lleva un mes andando tiene ahí casi todas sus llaves —los
otros tres tramos cubren una semana—, así que el caso tratado como excepción era el que más se iba a escuchar, y se
escuchaba *«el cuatro octavos»*. Este documento lo había anotado como límite conocido con un costo que nunca se midió
—«expandirla pide una tabla de meses, otra enumeración»— y ese costo es falso: `Intl.DateTimeFormat('es-AR', { day:
'numeric', month: 'long' })` da *«4 de agosto»*, *«1 de julio»*, *«25 de diciembre»* sin una sola lista escrita a
mano. `fechaCorta` («4/8») queda intacta para la etiqueta al margen, que es donde sirve. El peor caso de la meta deja
de ser el día de la semana y pasa a ser este tramo (*«Entró el 25 de septiembre a las 20:14»*), que es más largo: lo
aguanta el mismo `flex-wrap: wrap` de `.fila` que se puso abajo —el que baja la acción de renglón entera— y no una
medida nueva. *Un costo estimado y escrito acá como si fuera un hecho se reusa después como precedente: cuando se mide
y da otra cosa, se corrige el renglón, no solo la línea de código.* Y el empujón para no medirlo vino de adentro: la
versión artesanal imaginada —una tabla de meses— chocaba con la regla contra las enumeraciones, así que pareció cara
sin que nadie la corriera.

**La lección de cuarto orden, que es la que paga.** La puerta que se puso para que esta clase dejara de reaparecer
se escribió con la FORMA de los tres casos ya vistos —«le falta la preposición», `/entró (?!hoy|ayer|el )/`— y no
con la PROPIEDAD que defiende: *nada de lo que se escucha es una abreviatura ni una fracción*. Con esa forma,
*«entró el 4/8 a las 07:05»* cruzaba la puerta por el «el » y quedaba en verde el string exacto que el comentario
de esa misma puerta decía rechazar —y con el caso ya adentro de su fixture, la llave de diez días—. Un test escrito
contra los bugs que ya se vieron no corta la serie: la deja seguir una superficie más abajo. Ahora la puerta afirma
la propiedad, y un barrido día por día la sostiene en el formateador.

Y dónde corta «esta semana»: por días de **calendario**, no por milisegundos. El predicado heredado (`ahora - ts <
7 * DIA`) era tolerable como etiqueta y **falso** como prosa —su ventana incluye siempre el mismo día de semana que
hoy, así que una llave de hace exactamente siete días a una hora posterior a la de la consulta salía *«el miércoles
a las 20:00»* un miércoles a las 15:00, una hora que hoy todavía no pasó, adentro de la pregunta que borra y del
nombre accesible—. El nombre del día no puede ser el de hoy: con días de calendario esa llave cae a *«el 5 de agosto
a las 20:00»*, que sigue desempatando. El criterio vive en **un solo helper** (`diasDeCalendario`) que consultan `tramoDe`
y `haceCuanto` —que tenía su propia copia— para que no vuelvan a nacer dos definiciones de «esta semana». Lo mismo
que la vez anterior: un criterio que ya estaba en el repo y en verde se extrajo como semántica ya validada, sin
medir qué decía. Ahora lo fija un test que pregunta si la frase es **cierta**, no solo si es única y castellana.

**Qué se fue:** el campo `etiqueta` de `Acceso`, el método `etiquetarAcceso` de la interfaz `Db` (con sus dos
implementaciones y su prueba de contrato), el editor y la píldora tocable del sheet, su copy en `textos.ts`,
sus clases de CSS y la regla que las autorizaba. Queda la píldora `.etiqueta` del CSS, que es otra cosa: los
rótulos «dueño» y «este dispositivo», que siguen.

La píldora tocable hacía además un trabajo que nadie le había asignado: era el **primer focusable** del sheet, y era
inofensivo. Sin ella el primero pasa a ser destructivo —«Sacarle el acceso», o «Salir de esta lista»
para quien no es dueño, que ni siquiera tiene controles en la lista—, así que la hoja pide `focoInicial="panel"`
y al abrir el foco queda en el diálogo: a los botones se llega tabulando a propósito. Borrar un nodo no borra
solo su función: promueve al que estaba atrás.

Y esa promoción hay que atenderla en **los tres canales por los que un control se anuncia**, no en los dos que
uno se acuerda: el orden de foco, el nombre accesible y el **color**. Los dos primeros los atendió esta release;
el tercero venía mal desde D22 y nadie lo había mirado, porque hasta ahora el destructivo no era ni el único
control de la fila ni la puerta de entrada de la hoja. En todo el repo el color dice qué clase de acción es
—`--danger` lo destructivo, `--accent-ink` lo seguro o lo que descarta—, y las dos únicas excepciones eran
justamente estas: «Sacarle el acceso» y «Anular» quedaban tipográficamente idénticos al «Cerrar» del pie
—mismo tamaño, mismo peso, mismo color, misma píldora sin relleno—, mientras ESE MISMO pie pintaba «Salir de
esta lista» y «Borrar la lista» de rojo: dos convenciones adentro de una hoja, y al irreversible le tocó la
equivocada. De ahí sale `.textoPeligro` en `controles.module.css`: **la caja de `.texto`** (silueta de botón de texto,
sin borde y sin relleno, para no engordar la caja del control) **y el color de
`--danger`** —que es para lo que el token está escrito: *«solo Borrar (texto), nunca relleno grande»*—. La caja
se declara una sola vez para las dos clases a propósito, así no pueden derivar. La causa de fondo es la de
siempre: *«esta acción es destructiva»* se establecía en el ruteo a `Confirmar` y se volvía a decidir a mano en
cada `className`, sin un lugar que tradujera lo uno en lo otro; el próximo control destructivo de fila usa
`.textoPeligro` y no vuelve a elegir.

**Y hay un cuarto, que no es un canal de anuncio sino lo que pasa DESPUÉS de apretar: a dónde queda el foco.**
Este control se lleva puesta su propia fila, así que el foco no tiene a dónde volver. `Sheet` se lo devuelve al
disparador y un instante después el refresco de la lista lo desmonta con el foco adentro: `<body>`, afuera de una
hoja modal que sigue abierta. Quien recorre por teclado o por lector arranca el recorrido de cero, y el segundo Tab
vuelve a caer en un botón destructivo. La decisión que fija esta release: **después de una acción destructiva en una
hoja, el foco vuelve a la salida segura de ESA hoja — nunca al `<main>` de atrás ni al `<body>`.** Acá esa salida es
«Cerrar»: existe para los dos roles y no se desmonta mientras la hoja está abierta. No la fila vecina, que es otro
botón destructivo: la misma decisión que el `focoInicial="panel"` de arriba. El defecto es **preexistente** —nació
con la pregunta en D22— y son DOS caminos, no uno: online la animación de salida (110 ms) le gana a los cuatro
viajes a Firestore, así que el que reubica es el desmontaje de la fila; resolviendo todo de caché gana el refresco y
el que decide es el `focoAlCerrar` de `Sheet`. Un solo cable dejaba verde justo el orden que casi nunca pasa, así
que cada orden tiene su test. Y el criterio no se volvió a escribir: `reubicarFoco` —resuelto y probado desde la
lista de ítems— bajó de `Fila.tsx` a `src/ui/foco.ts`, que es donde el repo tiene las reglas de foco; sus cuatro
tests siguen verdes **sin tocarse**, que es la prueba de que la extracción no movió el criterio. Lo que dejó pasar
el hueco es de la misma familia que el resto: `ConfirmarProps` re-listaba a mano un subconjunto de `SheetProps`, así
que un cable que `Sheet` ya tenía era invisible para quien usa `Confirmar` —y la ausencia de una prop opcional no es
un error de tipos—; ahora esa línea se **deriva** (`focoAlCerrar?: SheetProps['focoAlCerrar']`), y la que esta misma
release agregó al lado (`describedBy`) es la prueba de que la enumeración envejecía.

**Pendiente conocido, anotado y no callado:** `EditarItem` tiene la forma idéntica —la píldora del súper que dispara
la pregunta se desmonta al confirmar, con su hoja todavía abierta— y queda sin arreglar acá. Se arregla con la misma
línea apuntando a un ancla estable de su panel; su disparador es una pulsación larga (táctil), así que la exposición
por teclado es menor. Y conservar además el LUGAR —que el foco vaya a la fila vecina, como en la lista de ítems, en
vez de a la salida de la hoja— es una decisión de diseño y no una cirugía: si se quiere, se decide acá primero.

**La caja no era la que decidía la jerarquía, y la primera versión de esa frase afirmaba que sí — sin haberlo
mirado una sola vez a ancho de teléfono.** Es cierta de la CAJA comparada con `.peligro`, y no dice nada del
ANCHO, que es lo que de verdad reparte la jerarquía en una fila. Subir la granularidad de un dato no es solo un
cambio de registro: `haceCuanto` → `cuandoDicho` llevó la meta de la fila de 83 px a 114–166 px («Entró el
miércoles a las 20:14» es el peor día de los siete), y `.fila` es un flex de dos hijos que se achican los dos,
sin nadie que dijera cuál cede primero. A 360 px eso dejaba la fila unos 8 px corta —166 de meta + 12 de `gap`
+ 158 de botón contra 328 de ancho interno—, flexbox repartía el faltante en proporción, y al control destructivo
le costaba un renglón entero: *«Sacarle el / acceso»* en rojo y en 600, ganándole en masa al nombre de la llave
que la frase decía proteger. La lección: **en una fila flex hay que decir quién cede antes de agrandar una columna**, y una
afirmación sobre layout no se escribe hasta haberla visto en el ancho más chico. Ahora lo declara `.fila`
(envuelve, y la acción baja de renglón entera y pegada a la derecha) en vez de dejarlo librado al reparto
proporcional. Y una nota sobre por qué ninguna puerta lo vio: las suites de UI corren en jsdom, que no tiene
layout, así que ningún test puede medir un ancho — lo que queda fijado por test es el invariante **declarado**,
no el píxel.

**Y con la última pieza del marco viejo, el copy se sincera.** La etiqueta era lo último que sostenía «una llave
= un aparato»; sacarla sin tocar las frases que lo afirmaban dejaba el sheet describiendo un modelo que ya no
existe. El rótulo «este dispositivo» se queda —es vocabulario, y es lo que la gente reconoce en su propia fila—,
pero las dos frases que hablaban del modelo se corrigen: el encabezado pasa a *«Cada llave es una forma de entrar
a la lista, no una persona: alguien puede tener más de una»*, y sobre todo la pregunta de
salir, que decía *«Este teléfono deja de verla»* y prometía menos de lo que hace. La frase era falsa desde D23,
no desde acá: nació verdadera en D22 y quedó fuera del diff que la derogó. Lo que enseña es que el alcance de la
revisión de copy no es el diff, sino el invariante que el cambio deroga — quién más lo estaba citando.

**Y el encabezado tenía DOS mitades: se corrigió la que citaba el invariante derogado y quedó la otra, que cita
uno vigente y era igual de falsa.** *«Se la podés sacar cuando quieras»* no habla de aparatos: cita «solo el dueño
—el que creó la lista— expulsa y revoca» (D22), que nadie derogó y que por eso nadie volvió a leer. Pero se
afirmaba sin condición en una pantalla que abre cualquiera de la casa —el ítem de menú «Quién tiene acceso» no
está gateado por dueño—, así que quien no es dueño leía la promesa arriba de todo, después una lista sin un solo
botón, y recién después de las llaves Y de «Invitaciones abiertas» encontraba el desmentido (`soloDuenio`,
*«Solo quien creó la lista puede sacar accesos, anular invitaciones y borrar la lista»*). Promesa arriba, retractación abajo del
scroll, y en el medio la persona buscando un botón que no existe. Ahora la segunda mitad va ramificada por
`soyDuenio`, que el componente ya calcula: la rama corta es la del resto, y en el rato en que `duenio`/`miUid`
todavía cargan sale esa —la que no promete de más—, la misma regla que quedó anotada para `miCuenta()`.

**Y la primera mitad tampoco quedó arreglada a la primera: cambiarle el sustantivo al cuantificador no neutralizó
la frase, le cambió de camino.** La corrección de esa mitad fue *«Cada **dispositivo** que abrió la lista tiene su
llave»* → *«Cada **uno** que abrió la lista tiene su llave»*: pasa el barrido de vocabulario, y por eso se dio por
buena. Pero repartir una llave por persona es cierto en el camino de cuenta y falso en el anónimo —el default, y hoy
el de la familia entera—, donde dos uid con el mismo `memberId` son dos filas que dicen «Mamá». Es la misma mudanza
de víctima que la primera pasada de `salirTexto`, y con la agravante de que la falsedad se mudó al camino que usa
toda la casa, encabezando la pantalla que muestra esas dos filas: el desempate por fecha y hora dice cuál es cuál,
pero la frase de arriba ya no explicaba POR QUÉ hay dos, y dos filas iguales se leen como «se duplicó». Ahora lo que
se cuantifica es la LLAVE y la multiplicidad va con «puede» —*«Cada llave es una forma de entrar a la lista, no una
persona: alguien puede tener más de una»*—, que es verdadero en los dos caminos sin nombrar el aparato ni prometer
el desempate (que `entroEn` puede ser `null` y ahí la fila no muestra ningún «Entró …»). La cola del dueño pasa a
*«Podés sacar la que quieras»*: nombrada, no pronominalizada, porque ya no hay «su llave» que pronominalizar.

Lecciones de tercer orden, tres. Una: **el alcance de la revisión de copy no es la palabra derogada sino la frase
entera, y una frase se relee desde el lector que la app de verdad le pone enfrente** — que acá, por default, no es
el dueño (una lista tiene un dueño y N miembros). La revisión se acotó por VOCABULARIO —buscó «dispositivo»— y se
detuvo en la primera mitad de la oración. Dos: **un guardrail que barre vocabulario no ve promesas.** El barrido de
`src/ui/textos.test.ts` abre las dos ramas nuevas y las mira por aparatos, pero ninguna regex puede saber si una
frase promete un botón que el lector no tiene; lo que cubre esta clase es el test que ata la promesa a la
EXISTENCIA del botón —quien no es dueño no ve ni un «Sacarle el acceso» ni la mitad que se lo ofrece— y que además
exige que las dos ramas no sean la misma, para que nadie las empareje y lo llame arreglo. Tres, la que costó cuatro
vueltas: **cambiarle el sustantivo al cuantificador de una frase de alcance no la neutraliza, la muda de camino** —y
corregir el copy frase por frase, con un criterio distinto por vuelta, garantiza que cada vuelta encuentre la que la
anterior no miró con ESE criterio—. Una frase de alcance se revisa contra la PANTALLA que encabeza, con el escenario
del camino por default puesto adelante; y cuando una frase se parte en dos mitades, el criterio nuevo se le aplica a
las DOS, no solo a la que se estaba editando. Lo que fija esa clase no es una regex de vocabulario sino un test con
el ESCENARIO montado: el encabezado leído arriba de las dos filas «Mamá» que el fixture ya sabe armar.

**Cuántos aparatos apaga salir depende del camino, así que la frase lo dice condicionado.** `salir()` borra
`acceso/{uid}`: UNA llave, la del uid que está mirando. Cuántos dispositivos apaga eso no lo decide el
mecanismo sino el espacio de uid. Con el acceso guardado (D23) el uid es el de la cuenta y salir desde la compu
también apaga el celu; anónimo —el default, opcional para siempre, y hoy el de la familia entera— el uid vive en
el IndexedDB de ESTE navegador, así que el celu y la tablet de la misma persona son dos uid, dos llaves, y salir
desde una no toca la otra. Es exactamente la premisa sobre la que este mismo D26 construyó el desempate por
fecha y hora («ahí dos dispositivos que eligen a la misma persona siguen siendo dos llaves con el mismo
nombre»): si hace falta la hora para distinguir las dos llaves de Mamá, salir desde una no puede apagar las dos.
Las dos afirmaciones no pueden ser ciertas a la vez, y la release las sostenía juntas — una en código, la otra
en el copy. Por eso la pregunta dice las dos mitades —*«Se borra tu llave: dejás de ver la lista en este dispositivo,
y en cualquier otro donde hayas entrado con tu acceso guardado»*—: la que siempre pasa, y la condición que hace
verdadera a la otra. «Acceso guardado» no inventa un concepto: es el vocabulario que ya usa la pantalla de
cuenta, que al anónimo le dice *«Tu acceso vive solo en este dispositivo»* — y una pregunta destructiva e
irreversible no puede prometerle a esa misma persona, una pantalla más adentro, un alcance mayor.

La primera pasada no corrigió el aviso: le cambió de víctima. Encontró la frase que citaba el invariante
derogado («una llave = un aparato») y la reemplazó por otra mitad del MISMO modelo viejo —«todos tus
dispositivos»— afirmada ahora sin condición: cierta para los de cuenta, falsa para los anónimos, que son todos
los de hoy. La lección de segundo orden: **una frase que dice el alcance solo puede afirmar sin condición lo que
vale en el camino por default; lo demás va condicionado o ramificado.** Y el `salirTexto` corregido se verifica
contra el mecanismo, no contra la suposición: el test exige las dos mitades y prohíbe la promesa incondicional.

**Y la pregunta tiene un segundo eje —quién se va—, que la corrección por aparatos no miraba.** `salir()` borra
`acceso/{uid}` y nada más: el campo `duenio` del doc de la lista se queda apuntando al que se fue, y `esDuenio()`
lo resuelve contra ESE campo —y `esDuenio()` **no pide membresía**, igual que el `allow delete` del doc de la
lista, que mira `resource.data.duenio` directo—. Si el que sale es el dueño, entonces, la lista queda sin nadie
MÁS que pueda sacar accesos, anular invitaciones ni borrarla: ninguno de los tres poderes cuelga de la llave, así
que el que se fue los conserva enteros aunque ya no tenga acceso —y si además era anónimo y limpia el navegador,
ese uid no vuelve nunca y la lista se queda para siempre con miembros que anotan y sin administrador—. El botón
«Salir de esta lista» se le
muestra a todos, dueño incluido (que cualquiera se pueda ir solo es decisión vieja y sigue en pie), así que la mitad que falta la dice la
pregunta: para el dueño, *«Y mientras no vuelvas, nadie más va a poder sacar accesos, anular invitaciones ni
borrar la lista»*. No inventa vocabulario —`cuenta.cambiarTexto` ya dice *«queda sin dueño»* para el caso
análogo— y la
enumeración de los poderes vive en un solo lugar, compartida con la nota `soloDuenio` del mismo sheet, que es la
otra frase que los lista; bajo negación va con «ni», que apaga las tres una por una. Las dos acotaciones son el
mecanismo y no cortesía: un *«nadie»* pelado incluiría al que está leyendo la pregunta, y sin *«mientras no
vuelvas»* daría por permanente una pérdida que se deshace con un toque en el link.

La lección de segundo orden, que es un escalón más arriba que la de la revisión de copy: **el alcance de la
revisión de una pregunta destructiva sale del MECANISMO de la acción, no del invariante que el cambio deroga.**
D26 revisó el copy preguntándole a cada frase si todavía citaba el invariante derogado —una llave, un aparato—, y
los dos guardrails
que quedaron fijando `salirTexto` —los regex del test de `Accesos` y el barrido de vocabulario de
`textos.test.ts`— preguntan lo mismo: si la frase todavía es FALSA por el lado de los aparatos. `salir()` tiene
dos consecuencias, y solo una de ellas cita al invariante muerto; la otra —qué pierde LA LISTA cuando la llave que
se va es la del dueño— no tiene ninguna palabra que un barrido por vocabulario pueda delatar, y por eso venía
callada desde D22 sin que ninguna de las dos vueltas anteriores la mirara. Para una confirmación destructiva la
vara no es que la frase haya dejado de ser falsa, sino que esté COMPLETA: enumerar lo que la función hace, y
revisar que la pregunta lo diga todo. Por eso el test de salir corre ahora sobre los dos roles y exige, en las dos
ramas, que la mitad del otro eje aparezca solo donde es cierta.

**Y del mismo hecho colgaba una segunda consecuencia, en otro archivo: la cola de la pregunta también depende del
rol.** Que `salir()` no toque el campo `duenio` no solo deja a la lista sin administrador: deja al que se fue
siendo el `duenio`, y el `allow create` de `acceso/{uid}` autoriza sin código cuando
`getAfter(listaRef(listId)).data.get('duenio','') == request.auth.uid`. El comentario de las reglas presenta esa
rama como la afordancia del ALTA —el que crea la lista se da la llave en el mismo lote—, pero fuera de un lote
`getAfter` == `get` (lo dice el propio archivo para `existsAfter`), así que es también la puerta de vuelta
permanente del dueño. Y volver no cuesta nada: ir a la home es un `pushState`, con apretar ATRÁS se remonta
`PantallaLista` y `useLista` llama a `entrar()` en cada montaje. La cola que la pregunta arrastraba desde D22 sin
re-derivar —*«Para volver vas a necesitar una invitación»*— es verdad para el que no es dueño y falsa justo en la
rama que esta release escribió, así que se partió en dos por el MISMO `soyDuenio` que decide la mitad del medio:
al dueño, *«Para volver no hace falta invitación: la lista sigue siendo tuya y se abre con su link, siempre que
entres con este mismo acceso»*. La condición del final no es adorno y no se puede podar —anónimo, ese uid vive
en el IndexedDB de este navegador, y si se pierde ya no es el `duenio`—: es la misma regla que la primera mitad,
una frase de alcance solo afirma sin condición lo que vale en el camino por default. Acá el error iba para el
lado seguro —asustaba de más, no de menos, y no se perdía ningún dato—; se corrigió igual, porque el argumento
con el que se reescribió este string fue decir la verdad completa.

La lección de esta vuelta, un escalón sobre la anterior: **cuando una frase de alcance se deriva de un hecho del
mecanismo, hay que enumerar TODAS las consecuencias de ese hecho —incluidas las que viven en otro archivo, como
las reglas— antes de dar por buena la frase de al lado que se hereda sin re-derivar.** Y el corolario estructural:
**una constante compartida entre dos ramas es una AFIRMACIÓN de que esa mitad no depende de la rama**, así que se
re-verifica cada vez que aparece un eje nuevo —`salirVolver` se extrajo para que las ramas no divergieran, y
terminó congelando como común una frase que había pasado a depender del rol, donde ningún test podía mostrar la
mentira—. Los dos guardrails que quedan son de eje distinto a los anteriores: el test de `Accesos` exige las dos
colas en las dos direcciones (emparejar las ramas no pasa por arreglo), y `reglas.emu.test.ts` fija contra el
emulador que el dueño que se fue vuelve sin código y el que no es dueño no —la rama de ese `allow create` que el
único test de «sin código no se entra» nunca había mirado, porque corría con el forastero solo—. Si mañana esa
rama se acota al lote del alta, el test se pone rojo y el copy cambia con él, en vez de depender de que el
próximo revisor se acuerde.

**El mismo aviso se corrigió dos veces, por razones distintas — y la segunda es la regla de arriba, sin aplicar.**
La primera fue por el rótulo de relleno: la rama `null` del toast componía *«Todavía no dijo quién es ya no tiene
acceso»*. Esa pasada abrió la línea, le agregó la rama nueva… y dejó la rama con nombre como estaba desde D22:
*«Mamá ya no tiene acceso»*. `expulsar` borra `acceso/{uid}` —UNA llave, igual que `salir()`, más las invitaciones
que esa llave mandó—, así que en el camino anónimo, donde cada navegador de Mamá es una llave, la frase es falsa
mientras Mamá sigue adentro desde la otra; y peor todavía porque `refrescarAccesos()` vuelve a dibujar esa otra fila
justo detrás del toast. La pregunta que lo precede ya decía la verdad de llave —*«La llave que entró 4/8 09:15
deja de ver la lista en el acto…»*— y el aviso, una capa más abajo, le prometía un alcance de PERSONA justo a quien
acaba de hacer algo destructivo. Ahora se nombra por lo que se borró, en las dos ramas: *«Mamá ya no entra con esa
llave»*. En el camino de la cuenta la frase sigue siendo verdadera, porque dice de menos, no de más. Es la misma
mecánica que `salirTexto`: copy que nació verdadero cuando una llave era un aparato, y quedó fuera del diff que
derogó esa premisa.

Y la lección de tercer orden, porque van tres vueltas seguidas de la misma clase —un mensaje que no dice la verdad
completa, una superficie más abajo cada vez: primero el título y el nombre accesible; después el nombre accesible y
el toast interpolando el rótulo, más `salirTexto`; ahora el mismo toast, por alcance—: **corregir el copy frase por
frase, con un criterio distinto por vuelta, garantiza que cada vuelta encuentre la frase que la anterior no miró con
ESE criterio.** La regla de arriba vale para TODA frase que diga alcance, no solo para la que la motivó, pero vivía
únicamente en prosa y se testeó una sola vez, ahí. Y el barrido que la iba a generalizar deriva sus claves del objeto
`textos` pero enumera a mano su universo —`accesos` y `menu`, más una única regex de vocabulario—, y *«Mamá ya no
tiene acceso»* no tiene ninguna palabra que una regex de aparatos pueda delatar: el bloque `toasts` es justo donde
sobrevivió. Por eso el invariante —**el aviso nombra lo que se borró, no a quién se lo borraron**— queda fijado por
un test propio, sobre el mismo escenario de las dos llaves de Mamá, y no por la memoria del próximo revisor.

**Y la vuelta siguiente la encontró otra vez, en la misma hoja y para el mismo lector — pero por otro mecanismo,
y ahí está la corrección al párrafo de arriba.** Las tres vueltas anteriores fueron frases que prometían de más y
se arreglaron ramificando copy; ésta es un dato que no existe pintado como un dato que sí, con el copy correcto.
`invitaciones` viaja como `Invitacion[] | null`, y ese `null` carga TRES estados nombrando dos: «todavía cargan»
y el que nunca subió al tipo, «no las puedo leer» —las reglas solo se las muestran al dueño, y `refrescarAccesos`
convierte esa negativa en `null` con un `.catch`—. El `?? []` borra la diferencia, y el vacío alimenta la única
superficie de la hoja que AFIRMA —*«No hay ninguna abierta»*—, cuatro líneas abajo del párrafo que esta release
ramificó por `soyDuenio`: a quien no es dueño, que es el lector por default, la app le negaba invitaciones que
pueden estar circulando, y la nota de abajo le avisaba que no puede ANULARLAS, dando por sentado que las VE.
Ahora la sección entera —el encabezado incluido— se pinta por el VALOR y no por el rol: un segundo criterio se
desincroniza de las reglas, y `soyDuenio` tampoco cubriría el rato de carga del propio dueño. El invariante,
entonces, no es «ninguna frase promete de más» sino **ninguna superficie afirma lo que el código no puede sostener
para el lector por default**, y eso no lo fija ninguna regex sobre `textos`: lo fija montar la hoja con los props
que producción le da de verdad a ese lector. Mientras el arnés de test ponga por default un estado que producción
no produce —no dueño CON array de invitaciones—, la revisión mira una pantalla que no tiene nadie.

**Y el mismo `?? []` estaba cuatro líneas más arriba, sobre las llaves: se arregló el de abajo y no el de
arriba.** `(accesos ?? []).map(…)` pintaba `'todavía no sé'` y `'no pude leerlas'` igual que «no hay ninguna»,
y ahí la afirmación es peor que en las invitaciones: la lista de llaves no dice *«no hay ninguna»* con una
frase que se pueda buscar, la dice con **silencio** —un `<ul>` sin filas—, que es la respuesta más
tranquilizadora posible a «¿quién tiene acceso?» dada sin haber leído un solo documento. Y cero filas nunca es
un estado verdadero: quien está leyendo la hoja tiene llave, así que su propia fila siempre tendría que estar.
No hace falta que la lectura falle para verlo — `abrirAccesos` pone el centinela en el mismo tick en que abre,
así que TODA apertura pinta la hoja muda al menos una vez; sin señal se queda así, porque `getDocs` sobre el
caché persistente resuelve **vacío sin tirar error**. Aguas arriba, un mismo `.catch(() => null)` copiado una
línea más arriba le daba al valor un tercer significado que la hoja no podía distinguir, y encima donde no
correspondía: las invitaciones son del dueño (`allow get, list: if esDuenio`) y ahí el fallo es el camino
esperado, pero las llaves las lista cualquier miembro (`allow list: if esMiembro`) y ahí un fallo es una falla
real. Ahora los tres estados viven en el tipo (`Traida<T>` en `src/ui/contratos.ts`) en vez de en un `null`
sobrecargado, los dos `catch` están separados con la regla que justifica a cada uno citada al lado, y la hoja
dice en cuál está —*«Buscando quién tiene acceso…»* / *«No pude leer quién tiene acceso. Fijate si tenés
señal.»* con su **Reintentar**, porque decir «no pude» sin nada con qué volver a intentar deja como único
control el «Cerrar» del pie: es la mitad de la verdad—.

Y el vacío cuenta como *no contestó*, no como respuesta, que es la mitad que faltaba: el escenario que motivó
todo —sin señal, con esa colección nunca cacheada— **no pasa por el `catch`**, porque `getDocs` con el caché
persistente resuelve VACÍO sin tirar error. Un arreglo que solo hubiera atendido `'fallo'` dejaba la pantalla
muda justo en el único caso en que más importa. Se exige cantidad: cero llaves no es un estado posible —quien
está leyendo la hoja tiene la suya, así que su fila siempre tendría que estar—, así que un array vacío se dice
como lo que es. Es la misma regla de la enfermedad 3 aplicada a una pantalla en vez de a una puerta: una
lectura que aprueba en vacío no está contestando, y la ausencia de evidencia no se pinta como evidencia de
ausencia.

La lección, que es la que se repitió: **un `?? []` en el punto de pintado borra una distinción que el tipo sí
traía**, y TypeScript queda contento en las dos ramas, así que nada empuja para atrás. Cargando, falló y vacío
son tres respuestas distintas a una pregunta de seguridad, y el proyecto ya tenía decidido cómo se dicen
(`EstadoVacio` + `EmptyState`, con su `sinSenalSinCache` y su Reintentar) — la hoja de accesos se construyó
como isla y nunca se hizo la pregunta, y sus tests declaran otro eje en su encabezado, así que los estados de
LECTURA no tuvieron una sola aserción en tres releases. Por eso el arreglo no se apoya en un `Record` paralelo
al de `EmptyState` (dos enumeraciones envejeciendo aparte) sino en ramificar desde el único valor, y por eso
el split de los dos `catch` —que ninguna prueba de la hoja puede ver— queda fijado en `PantallaLista.test.tsx`:
lo que impide que una limpieza futura los vuelva a juntar «porque son la misma línea» es un test, no la
memoria del próximo revisor.

**Y eran tres las citas, no dos: la tercera estaba muerta.** `menu.accesosSub` —el subtítulo del ítem de menú que
abre justo este sheet— contaba *«N dispositivos»*: la única frase del producto que le ponía un número al lado de
la palabra derogada. Sobrevivió D22 → D23 → D26 porque no la ve nadie: nació **sin consumidor** en D22, escrita
por simetría con los otros subtítulos del menú, y la fila siempre se dibujó sin subtítulo. Se **borra** en vez de
corregirse; si algún día se quiere ese subtítulo, nace hablando de llaves y con su test. Lo que la dejó pasar es
la misma forma de mirar, dos veces: la revisión buscó a mano en el bloque que estaba editando, y el guardrail que
la fijó nombró frase por frase (`accesos.texto`, `accesos.salirTexto`). Una lista escrita a mano cubre lo que su
autor se acordaba, y envejece igual que envejeció la revisión. Ahora el chequeo (`src/ui/textos.test.ts`) **barre
`accesos` y `menu` enteros**: las claves salen del propio objeto `textos` y de cada función se leen todas sus
ramas, así el copy que se escriba mañana entra sin que nadie lo agregue. Las dos excepciones sancionadas
—`esteTelefono` y `salirTexto`— se verifican al revés: si una deja de nombrar un aparato, el permiso sobra y hay
que sacarlo, para que la lista de excepciones no sea lo único que crece.

Queda pendiente, si alguna vez se quiere la frase corta de cada camino: bajar `miCuenta()` a `PantallaLista` →
`Accesos` como ya bajan `miUid`/`duenio`, con la regla de que mientras el estado sea desconocido se muestre la
rama que NO promete de más.

**Las reglas ahora las rechazan.** `allow update` en `/acceso/{uid}` acepta un solo campo que cambie
(`memberId`), y solo del propio dueño de la llave: la rama que le dejaba al dueño de la lista editar etiquetas
ajenas se fue con ella. Los tests del emulador cambiaron de signo — donde probaban que se podía etiquetar,
ahora prueban que **no** se puede, ni la propia ni la ajena ni el dueño la de otro.

**Lo que queda escrito en Firestore no se toca.** Las llaves viejas siguen teniendo su `etiqueta` adentro; el
mapper la ignora al leer y `affectedKeys()` mira lo que *cambia*, no lo que hay, así que un update de
`memberId` sobre una llave con etiqueta sigue pasando. No hay migración: borrar el campo pediría una pasada de
escritura sobre datos de la familia para ganar nada visible.

**Límite conocido, chico y con fecha de vencimiento:** un teléfono que todavía tenga el bundle viejo en el
service worker sigue mostrando el botón de etiquetar, y ahora el guardado le va a fallar contra las reglas
(toast de error). Se arregla solo en cuanto el SW toma la versión nueva.

**Cómo se cerró: el circuito corrió cuatro vueltas y la quinta la cortó el dueño.** Vale dejarlo escrito porque
es la primera release que usa el circuito de D24 en serio, y el perfil de lo que encontró cambió vuelta a vuelta:
la 1 encontró los agujeros que abrió este borrado (la fila sin desempate, el foco que caía en un botón
destructivo, el copy que seguía citando «una llave = un aparato»); la 2 encontró, sobre todo, **bugs que había
metido la cirugía de la 1** (el caso nulo del dato nuevo, el rótulo de relleno interpolado en las superficies que
la 1 no había mirado); la 3 y la 4 empezaron a traer **deuda de D22 que esta release destapó al mirar de cerca
esa pantalla** — el foco que se cae afuera de la hoja al sacar una llave, la hoja afirmando «No hay ninguna
abierta» sobre invitaciones que las reglas no dejan leer, la hoja diciendo que nadie tiene acceso mientras carga.
Todo eso se arregló igual: no quedó nada adjudicado sin operar. Lo que se decidió es **no pagar una quinta
vuelta**: las puertas estaban verdes, el humo local sobre el emulador mostró los cinco casos difíciles bien
(incluida una llave vieja con `etiqueta` adentro, ignorada al leer), y la vuelta 4 clasificó sus propios
hallazgos como no bloqueantes. La lección que deja para la próxima: **el loop converge cuando lo que encuentra
deja de ser de la release y pasa a ser del código que la release tocó de paso**; ahí el que decide el alcance es
el dueño, y lo que se acepta se escribe acá —como esto— en vez de relitigarse.

## D27 · Las llaves colgaban de cuentas con fecha de vencimiento (2026-08-30)

Se encontró buscando otra cosa, y era lo más grave que había en el proyecto esa semana. No lo destapó ningún
test ni ninguna puerta: apareció auditando si convenía migrar a app nativa.

**El conflicto.** D22 hace que la llave de una lista cuelgue del **uid de Firebase** (`/acceso/{uid}`), y para
la familia ese uid es **anónimo**. Al mismo tiempo, el proyecto tenía `autodeleteAnonymousUsers: true` en
Identity Platform — verificado contra la API, no supuesto — que **borra las cuentas anónimas a los 30 días**.
Las dos cosas juntas significan que la llave de cualquiera que no abriera la app una vez por mes se evaporaba
sola, y al volver veía «Esta lista no es tuya… todavía». Sin error, sin aviso, y con cara de bug nuestro.

Peor: D23 dice que la cuenta de Google es **«opcional para siempre»**. Con ese borrado prendido era mentira —
era obligatoria para cualquiera que no fuera usuario frecuente. La promesa del producto y la configuración del
proyecto decían cosas distintas, y ganaba la configuración.

**Lo que se midió** (`auth:export` + la API de Identity Platform, todo de solo lectura): 58 cuentas, **56
anónimas puras y 2 atadas a Google**. De las tres llaves de «Casa»: la del dueño y la de un miembro estaban
atadas a Google (a salvo, porque D23 se usó); la tercera era anónima y llevaba días sin abrirse — **se iba
a borrar en pocas semanas**. La mayoría de las otras 54 son basura de pruebas (cada visita en un
navegador nuevo, cada canal de preview y cada sesión de agente acuña una cuenta anónima).

**La decisión: se apaga el borrado automático.** Es la configuración la que estaba mal, no el modelo. Un
producto cuyo modelo de acceso cuelga de uid anónimos no puede tener prendido el borrado de uid anónimos: son
dos piezas que se contradicen, y la que describe el producto es D22. Apagado y verificado el 2026-08-30 (el
campo pasa de `true` a ausente).

**Lo que esto deja para la próxima**, que es más importante que el arreglo: **el riesgo más grande del
proyecto esa semana no estaba en el código ni en la plataforma — estaba en un cajón de la consola que nadie
había abierto.** El circuito de D24 audita el artefacto, las reglas y lo publicado; no audita la
CONFIGURACIÓN del proyecto, que es input del producto igual que el `.env` (D24, «el punto ciego de las dos
mitades»). Candidato claro para una puerta nueva: afirmar contra la API de Identity Platform que el borrado
sigue apagado, que es una línea y falla cerrado.

## D28 · El teclado en edge-to-edge: un solo mecanismo en vez de tres mundos (2026-08-30)

**El root cause, medido** (CDP sobre adb, en el teléfono del dueño, con el teclado abierto y confirmado por
`dumpsys input_method`): en la PWA instalada con edge-to-edge, el teclado ocupa 345 px de 919 y **Chromium no
lo reporta por ninguna vía**. `innerHeight`, `visualViewport.height`, `visualViewport.offsetTop` y `100dvh`
quedan **idénticos** con y sin teclado. No es que la app suba mal: es que no recibe la señal.

**Por qué los dos mecanismos que había fallan a la vez.** La app venía cubriendo dos mundos:

- **A · Android normal** — `interactive-widget=resizes-content` achica el layout viewport, `100dvh` lo sigue,
  y `--kb-inset` vale 0 a propósito (`useVisualViewport.ts` lo dice en su comentario).
- **B · iOS** — el layout viewport no se mueve, `visualViewport` sí, y `--kb-inset` es lo que hay que subir.

Edge-to-edge es un **tercer mundo** donde no aplica ninguno: la ventana no se achica (muere A) y
`visualViewport` tampoco se mueve (muere B). Dos mecanismos, cada uno asumiendo su mundo, y ninguno cubriendo
el que viene. Y viene: el arreglo de Chromium #407420295 sale algún día por default, y ese día esto le pasa a
toda la familia sin que nadie toque nada (D25, corregido).

**Lo que sí funciona, medido en el mismo teléfono:** `navigator.virtualKeyboard`. Con
`overlaysContent = true`, `env(keyboard-inset-height)` devuelve **345 px exactos** y el evento
`geometrychange` está soportado. Inyectado en vivo, `--kb-inset` pasó de `0px` a `345px`.

**La decisión: un solo mecanismo, no un tercer camino condicional.** Donde exista `virtualKeyboard`
(Chromium), la app se hace cargo del teclado **siempre** —`overlaysContent = true` y `--kb-inset` alimentado
por `geometrychange`— y deja de depender de que el sistema le achique la ventana. Eso **unifica A y C**: los
dos pasan a ser «la app se posiciona sola». Donde no exista (iOS Safari), queda `visualViewport`, que es el
mundo para el que se escribió. Dos caminos, uno por plataforma, en vez de tres mundos y dos mecanismos que se
tapan los agujeros entre sí. Agregar una tercera rama condicional habría sido empeorar la enfermedad que
causó esto.

**Ojo con ese «siempre»: lo que se deployó se hace cargo EN LA PANTALLA DE LA LISTA.** El hook se monta desde
`BarraInput` (`src/ui/BarraInput.tsx:30`), que solo existe en `PantallaLista`. Con `vv` el lugar daba igual —el
hook solo leía y escribía una variable que consumen superficies de esa pantalla—, pero `vk` **muta estado del
documento** (`overlaysContent`, y el cleanup lo devuelve a `false` al desmontar), así que el lugar que le
corresponde ahora es `App`. Moverlo es el paso siguiente y está fuera del presupuesto de esta sesión: hasta que
se haga, «siempre» quiere decir «siempre que estés en `/l/<id>`», y Home sigue viviendo del mecanismo del
navegador (que en Android normal es lo correcto, y en edge-to-edge está roto hoy, con perilla o sin ella).

**Por qué el cambio es chico, y esto se verificó antes de decidirlo:** las superficies que suben con el teclado
leen **`--kb-inset`** — son **ocho declaraciones** en cinco componentes (`BarraInput` 1, `DoneBar` 1,
`Lista` 2, `Sheet` 3, `Toast` 1), y ese listado sale de `grep -rn -- --kb-inset src/`, no de la memoria (de
memoria salió mal: la primera versión de este párrafo decía «siete», y la que faltaba era justo la primera
excepción de acá abajo). El `Sheet` ya calcula `100dvh - var(--kb-inset)`. El arreglo vive en
`useVisualViewport.ts`, que ya es el único que escribe esa variable (estilo inline sobre `<html>`, que le gana a
cualquier hoja — por eso el valor tiene que salir de un solo lugar y no apilarse con un `env()` en CSS).

Lo que **no** se puede afirmar —y la primera versión de este párrafo lo afirmaba— es que esas superficies lean
«`--kb-inset` y nada más», y que por lo tanto «si la variable recibe el valor correcto, todo se acomoda solo».
Eso salió de leer el CSS, no de medirlo, que es la forma exacta del error de D25. Leído despacio, el mismo CSS
deja **dos excepciones**, y las dos van escritas acá abajo.

**La primera, y conviene tenerla escrita ahora y no descubrirla en el teléfono:** la octava declaración
es `.centro` (`src/ui/sheets/Sheet.module.css:47-64`), la tarjeta de `Confirmar`. Limita el alto con el inset
(línea 55) pero se posiciona con `top: 50%` + `translate: 0 -50%` (líneas 50-51) sobre un `100dvh` que en `vk`
NO se achica: la tarjeta queda `--kb-inset / 2` px por debajo del centro del área visible (172 px con los 345
medidos), y con un `olvidarTitulo` largo crece hasta el `max-height` (~494 px) y el borde de abajo se mete
detrás del teclado. **No es nuevo de `vk`**: en iOS (`vv`) ya pasa hoy; en Android normal está dormido porque
ahí el inset vale 0 a propósito. **No bloquea**: todo `Confirmar` (`PantallaLista.tsx:236`,
`EditarItem.tsx:202`, `Accesos.tsx:281`, `Home.tsx:188`) abre por `Sheet` con `showModal()` y foco al panel, y
sin `virtualkeyboardpolicy="manual"` el teclado se cierra al blur — el solape dura lo que tarda en bajar, no es
un estado estable. **El arreglo, para el día que `vk` sea el default:** `top: calc(50% - var(--kb-inset) / 2)`
en `.centro`, medido en el teléfono en las dos direcciones como todo lo demás de D28. Acá no se toca: el
alcance sano de esta release es «ningún CSS cambió».

**La segunda excepción va marcada como lo que es —hipótesis, `no medido`—, que es la regla que dejó D25.** Los
mismos cinco componentes no leen solo `--kb-inset`: además **suman `--safe-bottom` sin clamp**, en
siete declaraciones que salen de `grep -rn -- --safe-bottom src/` (`BarraInput.module.css:10` el `height` y
`:14` el `padding-bottom`, `DoneBar.module.css:5`, `Lista.module.css:9` y `:11`, `Toast.module.css:6`, y
`Sheet.module.css:40` del `.panel`; `Home.module.css:5` también aparece en ese grep, pero no tiene `--kb-inset`
en su fórmula y queda afuera). `--safe-bottom` es un alias crudo de `env(safe-area-inset-bottom)`
(`tokens.css:106`) usado como «el relleno de abajo de mi superficie fija», y esas dos cosas son lo mismo **solo
mientras el borde de abajo de la superficie sea el de la pantalla**. `bottom: var(--kb-inset)` rompe esa
identidad: con el teclado arriba la caja termina en el techo del teclado, y esos px pasan a ser una franja de
`--paper` entre el renglón del campo y el teclado, con la `DoneBar` y el `Toast` subidos encima (los dos apilan
desde `inputbar-h + safe-bottom`). Nadie tuvo que darse cuenta antes porque el único mundo donde `--kb-inset`
fue alguna vez > 0 es iOS, y ahí Safari pone `safe-area-inset-bottom` en **0** mientras el teclado está
visible: la plataforma nos venía manteniendo el invariante gratis. En Chromium con `overlaysContent` el inset
sale de la barra de gestos, y **si vale 0 con el teclado arriba no está medido**.

**El número se lee en la misma sesión**, que cuesta segundos estando ya con CDP conectado, y se leen **tres
cosas y en las dos direcciones** —teclado abierto y teclado guardado—, porque una sola lectura no alcanza para
concluir. (a) El `paddingBottom` computado de la barra, o una sonda fija abajo con
`height:env(safe-area-inset-bottom,0px)` y su `getBoundingClientRect().height`: **ése es el que decide**, porque
es un número de un elemento real. `getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')`
se anota al lado pero no manda: un custom property con `env()` adentro puede volver como texto sin resolver, y
«volvió texto» no es «volvió 0». (b) El mismo número con el teclado guardado, que es **el control**. (c)
`navigator.virtualKeyboard.boundingRect` **entero** —no solo el `height`— contra `innerHeight`, para confirmar
que el teclado llega al borde de abajo (`rect.y + rect.height >= innerHeight - 1`). Los tres, anotados al lado
del 345.

**La regla se fija antes de ver los números**, para no acomodarla después. Abierto en `0px` **y** cerrado > 0:
la plataforma lo pone en 0 sola, en Chromium no hay nada que arreglar, queda escrito como límite conocido y iOS
—sin medir— sigue pendiente. Abierto > 0 **y** el teclado llegando al borde: la franja está confirmada y se
aplica el arreglo de abajo. **Los dos en 0: la medición no midió nada** —este teléfono no tiene barra de gestos,
o la sonda está rota— y la hipótesis **no se tacha**; sin el control, un 0 no distingue «la plataforma lo
arregla» de «acá no había nada que medir», y tacharla con esa lectura sería aprobar en vacío. Y si el teclado
**no** llega al borde —flotante, o dividido— el arreglo queda en suspenso: sacaría reserva que el teclado no
está tapando. Ese caso, además, ya rompe el `bottom: var(--kb-inset)` mismo —la barra flotaría en el medio—
porque `insetDeTecladoVirtual` (`useVisualViewport.ts:128`) usa solo `rect.height` e ignora `rect.y`: es
adyacente a esta franja, pero es la precondición del arreglo, y por eso el `boundingRect` se lee entero.

**Y si es real, el arreglo no es una línea:** poner el
clamp solo en `BarraInput` abre un bug nuevo — la barra baja `safe-bottom` px pero la `DoneBar` sigue anclada en
`kb-inset + inputbar-h + safe-bottom` y se despega, dejando ver la lista entre las dos. Lo mínimo correcto es un
token derivado en `tokens.css`, `--safe-bottom-libre: max(0px, calc(var(--safe-bottom) - var(--kb-inset)))`, y
reemplazar `var(--safe-bottom)` por él en esas siete declaraciones y en ninguna más. Es no-op demostrable en
los dos mundos que hoy andan —en A `--kb-inset` vale 0 siempre; en iOS `--safe-bottom` vale 0 justo cuando
`--kb-inset > 0`—, así que no puede regresionar el camino `vv`. Y la verificación de ese arreglo es **la
medición escrita acá, los dos números antes y después**, como D21 y como todo D28: un test de jsdom sobre
`getComputedStyle` aprobaría en vacío, porque jsdom no computa `env()` ni `max()`. Si además se quiere puerta
automática, la única honesta es un guard de texto sobre el CSS —ningún `.module.css` que use `var(--kb-inset)`
en una declaración puede usar `var(--safe-bottom)` pelado—, con la lista de archivos derivada por glob+grep y
fallando si el glob devuelve cero. Acá tampoco se toca nada, y por la misma razón de siempre: aplicar el clamp
sin el número sería codear contra una semántica asumida, que es justo la enfermedad que causó todo esto.

**El riesgo, dicho antes y no después.** `overlaysContent` es **todo-o-nada**: la spec obliga al navegador a
NO redimensionar el viewport mientras esté activo. O sea que el arreglo apaga el mecanismo del que hoy vive el
mundo A, que es el que la familia usa y que hoy anda bien. **Puede arreglar el caso roto y romper el que
funciona.** Por eso sale detrás de una perilla (`?teclado=`: se pide por URL como `?fps` y `?motion=`, pero
**no vive como ellas** —queda pedida en el teléfono, ver el paso 2 del protocolo—) y se mide en el
teléfono **en las dos direcciones** —con edge-to-edge y sin— antes de que sea el default. Medir un solo lado
y generalizar es exactamente el error que costó D25.

**La perilla viaja con su lectura, y el criterio de la sesión es el NÚMERO.** Una perilla sola alcanzaba para
sus hermanas (`?motion=`, `?hold=`): con `?motion=0.75` la animación va más rápido, el efecto es autoevidente.
`?teclado=vk` es de otra clase — en el mundo que importa, su resultado negativo legítimo («corrió y el teclado
reportó 0») y su ausencia total («no había API», «la perilla no llegó») producen la MISMA observación: nada se
mueve. Por eso el modo EFECTIVO (el que quedó activo, no el pedido) se publica en `<html data-teclado>` desde
el mismo lugar que escribe `--kb-inset`, y el Medidor lo muestra junto al inset vivo: `?fps&teclado=vk` pinta
`vk 345` con el teclado abierto, `vv 0` si cayó al camino viejo, y `— 0` si el hook ni montó. La pregunta de
la sesión deja de ser «¿subió la barra?» —un binario con tres causas— y pasa a ser un número que se lee de la
pantalla. Es la misma práctica de D21 (construir el medidor ANTES de concluir) y la misma que `build` en el
Medidor: un instrumento que no dice si está prendido fabrica el resultado «no reproduce».

**El protocolo de medición, escrito antes de la sesión y no después.** Lo que esta release entrega no es un
arreglo: es la posibilidad de medir. Y una medición no está especificada hasta que dice **cómo se sabe que el
mecanismo medido corrió** — si eso falta, «no pasó nada» se lee como «`vk` no sirve», y con el disparador de
acá abajo armado, un resultado que nunca existió puede terminar mandando el proyecto a Kotlin.

1. **Dónde: en `/l/<id>`, tocando la barra de anotar.** Es la pantalla donde monta el hook, y todo lo que se
   abra desde ahí va de yapa porque ya está montado (las hojas con campo salen de
   `grep -rn '<input' src/ui/sheets/`, no de una lista escrita acá). En Home (`/`) **no hay nada que medir**:
   ni hook ni Medidor —se renderiza desde `PantallaLista.tsx:218`—. Tocar ahí el nombre de la lista o el de un
   miembro (`src/ui/Home.tsx:127` y `:147`) con `?teclado=vk` puesto no prueba nada: no es una medición
   negativa, es no haber medido.
2. **Cómo se entra: la URL completa `…/l/<id>?teclado=vk&fps`, o desde Home abriendo la lista.** Las dos
   sirven: `navegar()` le devuelve al destino las perillas que ya venían (`conPerillas`, `src/app/router.ts`),
   así que moverse por dentro de la app no apaga el instrumento con el que se la está midiendo. El que NO las
   lleva es el link que se comparte (`urlDeLista`), y está bien que no.
   **Y las dos perillas no viven igual:** `?teclado=` queda pedida en el teléfono (`heladera:teclado` en
   localStorage, `useVisualViewport.ts`) y `?fps` no. Hace falta porque el paso 4 obliga a tocar el flag de
   edge-to-edge, que **relanza la app instalada** por `start_url: '/'` —sin query y sin barra de direcciones
   donde volver a escribirla—: sin memoria, la segunda corrida saldría del modo de control disfrazada de la
   del experimento. Las dos consecuencias, que son del operador y no del código: (a) la corrida de `vv` se
   entra **explícita** con `?teclado=vv` (que además borra lo recordado), nunca «dejando que se pierda la
   URL»; y (b) después de cada relanzamiento el Medidor NO vuelve solo, así que hay que reentrar por la URL
   completa para tener el control positivo del paso 3 — que el Medidor no esté no dice nada sobre qué camino
   está corriendo.
3. **Control positivo, antes de anotar ningún número.** Con `?fps` prendido y el teclado abierto, el Medidor
   tiene que decir **el modo que pediste** (`vk` en las corridas de `vk`, `vv` en las de `vv`). Si pediste
   `vk` y dice `vv`, corrió el camino viejo —no había API, o la perilla no llegó—; si dice `—`, el hook ni
   montó (pantalla equivocada). En los dos casos la medición es **NULA, no negativa**: no cuenta para el
   disparador de abandono y hay que rehacerla. Es la regla que hace que la sesión falle cerrada, y por eso el
   modo efectivo se lee del mismo lugar que escribe el inset y no se vuelve a deducir por otro lado.
4. **Las dos direcciones, explícitas: cuatro corridas.** `?teclado=vv` y `?teclado=vk`, cada una con
   edge-to-edge prendido y apagado (`chrome://flags/#web-app-short-edges-cutout-mode`), y cada una repetida
   —el disparador exige que reproduzca igual dos veces, así que repetir es parte del protocolo y no un extra.
5. **El teclado, en modo NORMAL en las cuatro corridas y en sus repeticiones.** El modo del teclado es la
   variable que el paso 4 no fija, y Gboard tiene flotante, dividido y una-mano a un mantenido de distancia:
   entre corridas cambia lo que ese paso enumera y nada más, con el teclado siempre acoplado al borde de
   abajo, que es la única forma en que se midieron los 345. En flotante Android no reporta insets de IME
   —por eso la ventana tampoco se achica—, así que lo esperable es que `vk` lea 0 con el teclado abierto;
   qué devuelve `boundingRect` ahí **no está medido**, y para esto da igual: ni un 0 ni un alto despegado del
   piso son comparables con la corrida acoplada, y el 0 encima tiene cara de «el mecanismo no anda» sin
   serlo. El dato que lo delata ya está pedido —el `boundingRect` entero, no solo el alto, en la lectura (c)
   de la franja de `--safe-bottom`—, así que la vuelta hecha en otro modo se reconoce después: se **descarta
   y se repite**, es NULA como las del paso 3 y no cuenta como «no reproduce dos veces igual».

**El disparador de abandono, acordado con el dueño antes de empezar** (para no discutirlo en caliente): si el
arreglo necesita distinguir versiones de Chrome o mirar el user-agent, si rompe el mundo A sin forma limpia de
tener los dos, o si la medición no reproduce igual dos veces — se abandona y se migra a app nativa (Kotlin +
Compose, que es el stack que la investigación recomendó). El presupuesto es una sesión, no «hasta que salga».
Ojo con el tercero: se abandona por lo que diga el teléfono, no por una lectura ambigua del instrumento — de
ahí que la lectura salga en el mismo deploy que la perilla y no en el siguiente.

**El material de consulta de esa investigación no vive acá; la coordenada sí.** Lo que se miró del lado
nativo es `io.flutter.embedding.android.FlutterView` (de The Flutter Authors, licencia BSD-3-Clause):
`guessBottomKeyboardInset` y `WindowInsets.Type.ime()`, alrededor de las líneas 700-825 de ese archivo. Va la
**coordenada y no el archivo**, a propósito: una copia de código ajeno adentro del repo es una foto que
envejece —upstream cambia y la copia pasa a mentir sobre lo que hace Flutter hoy— y de paso mete la licencia
de otro en este historial. El archivo había quedado suelto en la raíz del repo mientras se preparaba esta
release, sin trackear, a un `git add -A` de quedar commiteado para siempre; se sacó del árbol antes del
commit. **No** se agregó al `.gitignore`: ignorarlo lo habría vuelto invisible para `git status`, que es justo
la señal que lo encontró — el `.gitignore` de este repo es para lo que se REGENERA (`node_modules/`, `dist/`,
`.emu-data/`), no para lo que no debería estar.

**Candidato de puerta, al lado del que dejó D27: el árbol de trabajo.** El circuito declara que su alcance
ES el working tree —y `deploy.mjs` publica lo que hay en él— pero ninguna de las seis puertas lo mira: leen
`dist/` o un archivo que nombran a mano. Las auditorías tampoco pueden verlo, porque leen un diff, y un
archivo sin trackear no está en ningún diff. Por ese hueco pasaron 65 KB de Java ajeno con las seis firmas en
verde; mañana puede pasar el `firestore.rules` viejo que el runbook de `deploy.mjs` avisa que se queda pegado
en el árbol, y ese **sí** se publica. La puerta es `git status --porcelain` y tiene que **fallar cerrado**:
rojo si hay untracked no ignorados —listándolos y pidiendo decisión explícita— y rojo también si `git` no
está o el comando revienta, porque aprobar ahí sería la misma enfermedad otra vez. Cuando se construya lleva
test, y el test de este bug es el caso de falla cerrada: función pura `arbolLimpio(salidaPorcelain)` con el
estilo de inyección que ya usa `scripts/java-windows.mjs`, y tres casos fijados — un `??` da rojo y nombra el
archivo, solo modificados da verde, y salida vacía por error o por `git` ausente da **rojo, no verde**. Acá no
se construye: meterla ahora obliga a re-correr las 3+3 y agranda un diff que a propósito toca un solo archivo
de producción.

### D28 · La medición, y `vk` como default (2026-08-30)

El default se movió a `vk`. Lo que sigue es la evidencia, porque el permiso para moverlo no era que alguien
lo prefiriera: era medirlo **en las dos direcciones**, que es exactamente lo que D25 no hizo.

Medido por CDP sobre adb en el teléfono del dueño (Android 16, Chrome 152.0.7977.64), con
`dumpsys input_method` confirmando el teclado en pantalla en cada corrida, y con captura de las cuatro:

| | feature **apagada** (el mundo de hoy) | feature **activa** (el que viene) |
|---|---|---|
| **sin perilla** (`vv`) | anda — ventana 847 → 436 | **roto** — 919 → 919, nada se mueve |
| **`?teclado=vk`** | **anda** — `--kb-inset` 345, campo en 487 | **anda** — `--kb-inset` 345, campo en 535 |

Y el caso que más riesgo tenía, porque **cuatro de los ocho campos de la app viven adentro de una hoja**: con
la feature activa y `vk`, la hoja de editar sube entera por encima del teclado, con sus tres botones visibles.

Lo que hay que leer de esa tabla es la columna de la izquierda, no la de la derecha. Que `vk` arregle el mundo
roto era lo esperable. Lo que **no** se podía dar por sentado —y era el disparador de abandono nº2 acordado con
el dueño— es que no rompiera el mundo que ya andaba: ahí `vk` apaga el redimensionado de la ventana (la spec de
`overlaysContent` lo obliga) y la barra sube por `--kb-inset` en vez de por el `100dvh`. **Mismo resultado
visual, otro mecanismo.** Por eso el cambio es un reemplazo y no un parche condicional.

Ninguno de los tres disparadores de abandono se activó: no hay olfateo de user-agent ni de versiones (solo
`feature-detect` de `navigator.virtualKeyboard`), no rompe el mundo que anda, y reproduce —dos lecturas
consecutivas idénticas en las cuatro corridas, y los controles dieron los mismos números que la sesión previa.

**La asimetría del recuerdo se invirtió con el default, y esa es la parte que hay que no romper.** Se guarda
siempre el NO-default: cuando el default era `vv` se guardaba `vk`; ahora se guarda `vv`. Gracias a eso, mover
el default no dejó un valor viejo decidiendo por su cuenta en los teléfonos que participaron de la medición —
su `'vk'` guardado se lee como «no es `vv`» y cae al default, que ahora vale lo mismo. Hay un test por cada
mitad de esa frase.

**Lo que este cambio NO arregla, y conviene no confundir.** Arregla el teclado, para siempre y sin que nadie
toque un flag: la app dejó de depender de que el navegador le achique la ventana. **No arregla las barras.**
Que la barra de estado y la de gestos tomen el color de la app sigue necesitando la feature de Chromium, que
hoy está apagada y sin fecha — y pedirle a la familia que prenda un flag global del navegador **no es una
solución**: cambia el comportamiento de TODAS sus PWA, no solo de esta. Después de D28 quedan dos problemas
separados y conviene decirlos separados: el teclado es nuestro y está resuelto; las barras son de Chromium y
siguen abiertas. La única salida que no depende de Chromium para las barras es dejar de ser una PWA.
