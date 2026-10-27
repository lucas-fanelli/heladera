# Heladera

La lista de compras de casa, compartida. Vos anotás el antojo, papá agrega la cerveza, mamá la ve en el súper y la va tildando, con o sin señal. Es una PWA que se instala desde el navegador, anda sin conexión y sincroniza en tiempo real — y una familia la usa todos los días.

**Probala en <https://heladera-ec2b4.web.app>.** Creá tu lista y sumá a los tuyos con un link de invitación: las listas son privadas, así que nadie ve la de nadie.

Es un proyecto chico hecho con cuidado de proyecto grande. Lo más interesante no es la app sino **cómo se decidió cada cosa y cómo se publica**.

## Qué mirar

- **[`docs/diseno/decisiones.md`](docs/diseno/decisiones.md)** — el registro de decisiones, D1 a D28, cada una con su porqué y, cuando lo hubo, con el error que la motivó. Para empezar:
  - **D22 · Quién puede entrar** — listas privadas con invitaciones que vencen, sin backend propio: todo lo decide `firestore.rules`.
  - **D24 · El circuito de deploy** — nunca se publica a mano. Puertas deterministas; después, dos «consultoras» de agentes que auditan la misma release **a ciegas** (no se leen entre sí); y un deploy que compara lo publicado byte a byte contra el build.
  - **D25 y D28** — dos bugs de la PWA instalada en Android que no eran del código (la barra de estado y el teclado en modo edge-to-edge), diagnosticados **midiendo en el teléfono** por CDP sobre adb en vez de razonando.
- **[`docs/diseno/shoplist-diseno.html`](docs/diseno/shoplist-diseno.html)** — el documento de diseño de sistema y UX (autocontenido: abrilo en el navegador), y [`docs/diseno/paleta.html`](docs/diseno/paleta.html), el editor de la paleta «Papel de almacén».
- **Los tests** — dominio puro; componentes con un `Db` falso; y una **suite de contrato** que corre igual contra el `Db` falso y contra Firestore en el emulador, para que el falso no pueda mentir. Las reglas de seguridad, probadas caso por caso.
- **[`CLAUDE.md`](CLAUDE.md) y [`.claude/`](.claude/)** — el proyecto se construyó con Claude Code; las reglas de trabajo, la skill de deploy y los workflows de auditoría están versionados con el resto.

## La app

- **Una pantalla:** contador «Faltan N», la lista, «Comprados · Vaciar» y la barra para anotar, fijos abajo. El campo de anotar **filtra la lista mientras escribís** (ves si algo ya está antes de agregarlo) y en el súper sirve para buscar.
- **Súper por ítem**, opcional: lo que se compra en cada lado se agrupa solo, y se aprende por producto.
- **Motion:** la lista se reordena en vez de teletransportarse; `prefers-reduced-motion` respetado.
- **Sin conexión:** se lee lo que ya se vio, se anota y se tilda igual, y se sincroniza cuando vuelve la señal.

## Stack

Vite + React 19 + TypeScript estricto + Motion, CSS Modules sobre tokens (nada hardcodeado: colores, tiempos y copy viven en un solo lugar). Firebase: Firestore (caché persistente y tiempo real del SDK), Auth anónima con cuenta de Google opcional, Hosting. Plan gratuito, sin servidor propio. La UI solo conoce dos abstracciones —una **URL** y la interfaz **`Db`** (`src/db/types.ts`)— y ni el router ni Firebase se filtran a otra capa.

## Cómo entra la gente

Las listas son **privadas**. Cada teléfono entra con Auth anónima y, para ver una lista, necesita una **llave** en `acceso/{uid}`: sin ella, las reglas no le dejan leer nada. Para sumar a alguien: **⋯ › Sumar a alguien**, que arma un link de invitación que vence a los 7 días; el dueño de la lista puede anular invitaciones y sacar accesos. Guardar el acceso con una cuenta de Google es opcional y conserva la misma identidad, así que la llave sobrevive a cambiar de teléfono (D22, D23).

¿Probarla sin Firebase? `npm run build:demo` arma un solo HTML autocontenido con el `Db` falso y una lista de ejemplo.

## Desarrollo

Requisitos: **Node 22+** y npm. Sin Firebase ni cuentas para el nivel A: la app corre con el `Db` falso en memoria. Para el nivel B contra los emuladores hace falta además **Java 21+** (ver [Nivel B](#nivel-b--firestore-real)); `firebase-tools` ya viene como dependencia de desarrollo (`npx firebase ...`), no hay que instalarlo global.

```bash
npm i                 # instala dependencias
cp .env.example .env  # opcional; los defaults ya sirven para desarrollar
npm run dev           # http://localhost:5173 (Vite, hot reload)
npm run dev:lan       # lo mismo, expuesto en la red local: probar en el teléfono (misma Wi-Fi) como documento
                      # de nivel superior — teclado, viewport, fps reales — antes de tener el deploy;
                      # abrí http://<IP-de-la-PC>:5173/l/demoCasaAna00000000001 (la IP: ipconfig / ip addr).
                      # Ojo: embebida en un iframe, la meta viewport y visualViewport no son de la app y el
                      # teclado tapa las barras; para probar el teclado, abrila como página o instalada.
npm run emu           # emuladores de Firebase (Firestore :8080 + Auth :9099, UI en http://127.0.0.1:4000); dejalo corriendo.
                      # Los datos se guardan en .emu-data/ al salir y se recargan al arrancar (borrá la carpeta para empezar de cero).
npm run dev:emu       # la app con el Db real (VITE_DB=firestore) apuntando a esos emuladores (carga .env.emulador)
npm run dev:emu:lan   # lo mismo en la red local (http://<IP-de-la-PC>:5175): el teléfono llega a los emuladores A TRAVÉS de
                      # Vite (proxy por path, ver vite.config.ts) — el java del emulador sigue en 127.0.0.1, sin firewall que abrir.
npm run build         # typecheck + build de producción en dist/ (PWA con service worker)
npm run build:demo    # un solo HTML autocontenido en dist-demo/ (Db falso, router por hash)
npm test              # vitest: unit (node) + ui (jsdom); no toca Firebase
npm run test:emu      # levanta el emulador de Firestore y corre el proyecto vitest 'emulador' (contrato fake vs real + reglas)
npm run typecheck     # tsc --noEmit
node scripts/gen-icons.mjs                   # regenera los íconos de la PWA en public/icons/
```

Variables de entorno (`.env.example`): `VITE_DB` (`fake` | `firestore`), `VITE_ROUTER` (`path` | `hash`), `VITE_MOTION_SCALE` y `VITE_TIMING_SCALE` (1 normal, 0 instantáneo para tests), y las del nivel B: `VITE_FIREBASE_API_KEY` / `AUTH_DOMAIN` / `PROJECT_ID` / `APP_ID` y `VITE_USE_EMULATORS`. `.env.emulador` (commiteado, sin secretos) es el juego completo para el modo `emulador`; `.env` / `.env.local` quedan fuera del repo.

Estructura:

```
src/app/            pantalla única (PantallaLista), estado y acciones (useLista), router por URL
src/db/             interfaz Db (types.ts) + fake.ts (memoria, referencia de semántica) + firestore.ts (la misma interfaz
                    sobre Firestore) + firebase.ts (init del SDK: caché persistente, auth anónima, emuladores)
src/domain/         lógica pura sin React ni Firebase (normalizar, nombres, tiempos, resaltado, timing)
src/ui/             componentes (CSS Modules), textos.ts (todo el copy, es-AR) y contratos.ts (props)
src/styles/tokens.css   colores, tamaños, radios y duraciones (claro y oscuro); nada hardcodeado afuera
src/motion/tokens.ts    springs y duraciones de Motion; nada de números mágicos en transitions
tests/              lo que no es del producto: `unit/` son el circuito de deploy (D24) y las demás herramientas de ops
                    del repo; acá viven también los helpers y el setup que comparten los tests. Los del dominio, del Db
                    falso y de los componentes están AL LADO del código en `src/**`, igual que los *.emu.test.ts
                    (contrato fake vs Firestore, reglas), que solo corren con `npm run test:emu`; qué incluye cada
                    proyecto de vitest lo dice vite.config.ts
scripts/            el circuito de deploy (D24): `verificar-release.mjs` y `deploy.mjs` son las puertas de entrada
                    (`npm run verificar` y `npm run deploy`), el resto son sus helpers — más los utilitarios de build
                    y desarrollo (íconos, emuladores, el Java de Windows, el QR que ya no se usa: D22)
public/             icons/, robots.txt (Disallow: /)
docs/diseno/        documento de diseño, decisiones y paleta
```

Deploy (nivel C): `firebase.json` trae la configuración de Firebase Hosting + Firestore (hosting desde `dist/`, rewrites SPA, `Referrer-Policy: no-referrer`, `Cache-Control: no-cache` global con `immutable` solo para `/assets/**` y `workbox-*.js`, sourcemaps fuera del release, y los puertos de los emuladores) y `firestore.rules` las reglas del documento de diseño (§5). Se publica SIEMPRE por el circuito de deploy: `npm run deploy -- --dale` (ver D24 en `docs/diseno/decisiones.md` y la skill `.claude/skills/deploy/SKILL.md`).

## Nivel B — Firestore real

**Qué es.** La misma app, con un `Db` de verdad detrás de la misma interfaz: `VITE_DB=firestore` cambia `src/db/fake.ts` por `src/db/firestore.ts` y la UI no se entera. Lo que anotás en un teléfono aparece en los otros al toque (listeners en tiempo real del SDK), y sin señal sigue andando gracias a la caché persistente: leés lo que ya viste, anotás y tildás igual, y se sincroniza solo cuando vuelve la conexión. Cada teléfono entra con **Auth anónima** (un uid invisible que el SDK guarda en el navegador), y qué lista puede ver lo deciden las reglas según su llave (ver [Cómo entra la gente](#cómo-entra-la-gente)).

**Paso a paso en Firebase Console** (una sola vez, plan gratuito Spark; alcanza de sobra para una familia):

1. <https://console.firebase.google.com> → **Agregar proyecto** → nombre p.ej. `heladera-lista` (el id que te asigne es tu `projectId`) → **sin** Google Analytics → Crear.
2. **Compilación › Firestore Database › Crear base de datos** → modo **producción** (las reglas de verdad las subís en el paso 6) → ubicación: la región más cercana a quienes la van a usar (**no se puede cambiar después**) → Habilitar.
3. **Compilación › Authentication › Comenzar › Método de acceso › Anónimo → Habilitar** → Guardar.
4. **⚙ Configuración del proyecto › General › Tus apps › `</>` (Web)** → apodo `heladera` (Hosting lo agregás en el nivel C) → Registrar app → copiá el objeto `firebaseConfig`.
5. Volcalo en `.env` (o `.env.local`; los dos están en `.gitignore`):

   ```bash
   VITE_DB=firestore
   VITE_FIREBASE_API_KEY=AIza...                            # apiKey
   VITE_FIREBASE_AUTH_DOMAIN=heladera-lista.web.app         # authDomain — el único que NO se copia tal cual
   VITE_FIREBASE_PROJECT_ID=heladera-lista                  # projectId
   VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef             # appId
   ```

   Tres se pegan tal cual; el `authDomain` no. `firebaseConfig` lo trae como `<proyecto>.firebaseapp.com` y acá va `<proyecto>.web.app`, el dominio donde la app se publica (nivel C): la redirección de «guardar tu acceso con Google» (D23) tiene que ser **same-origin** o muere en los navegadores que particionan el almacenamiento de terceros. Con auth anónima —lo único de este nivel— la app anda igual con cualquiera de los dos, así que acá nada te avisa: quien lo caza es `npm run verificar`, recién cuando vayas a publicar (nivel C). Es el mismo `.env`: mejor que nazca bien.

   Estas cuatro son **públicas por diseño**: viajan en el bundle que descarga cada teléfono. La seguridad no está en las claves sino en las reglas (`firestore.rules`): sin una llave en `acceso/{uid}` no se lee nada de una lista, nadie puede listar las listas, y cada documento acepta solo sus campos.

6. Desplegá las reglas — hasta que no lo hagas la base rechaza todo:

   ```bash
   npx firebase login                     # abre el navegador; una vez por máquina
   npx firebase use heladera-lista        # deja el projectId en .firebaserc
   npx firebase deploy --only firestore:rules   # SOLO este setup inicial va a mano: publicar cambios es por el circuito (npm run deploy)
   ```

7. `npm run dev` y abrí <http://localhost:5173/>: la primera vez creás la lista de casa (nombre y quiénes son) y quedás en `/l/<listId>`. Para sumar a alguien: **⋯ › Sumar a alguien**.

**Desarrollo sin proyecto: los emuladores.** Para tocar `firestore.ts`, probar reglas u offline sin crear nada en la Console (ni `firebase login`), en dos terminales:

```bash
npm run emu       # Firestore emulado en 127.0.0.1:8080, Auth en 127.0.0.1:9099, UI del emulador en http://127.0.0.1:4000
npm run dev:emu   # vite --mode emulador: carga .env.emulador (VITE_DB=firestore, VITE_USE_EMULATORS=true, proyecto demo-heladera)
```

El proyecto `demo-heladera` no existe en ningún lado: los ids `demo-*` le dicen a firebase-tools que todo es local. Los datos viven en memoria del emulador y se pierden al cerrarlo (para conservarlos entre sesiones: `--import ./emu-data --export-on-exit` en el script `emu`). Con dos pestañas abiertas en la misma lista ves la sincronización en tiempo real; con DevTools › Network › Offline, la caché y la cola de escrituras.

**Tests contra el emulador.** `npm run test:emu` levanta el emulador de Firestore, corre el proyecto vitest `emulador` (los `*.emu.test.ts`: la misma suite de contrato que pasa el `Db` falso, más las reglas con `@firebase/rules-unit-testing`) y lo apaga. Necesita **Java 21+** en el PATH (firebase-tools 15 no soporta versiones anteriores); la primera vez descarga el jar del emulador (~130 MB) a `~/.cache/firebase/emulators/`. `npm test` a secas no lo incluye: sigue siendo unit + ui, sin Java ni red.

**Windows con `TEMP` raro (con `~`):** Java no puede crear ahí el socket de loopback y el emulador moría al arrancar con `Unable to establish loopback connection`. Ya no hay que hacer nada: `scripts/java-windows.mjs` detecta el caso y le pasa a Java un directorio corto (`C:\Temp`) antes de levantarlo. Si preferís otro, exportá `JAVA_TOOL_OPTIONS` a mano y los scripts no lo tocan.

**Cómo quedan los datos** (documento de diseño §5; los `{...}` son ids de 20 caracteres generados en el cliente):

```
listas/{listId}                          { nombre, creadaEn, esquema: 2, duenio }      la lista de casa (get sí, list no)
listas/{listId}/acceso/{uid}             { uid, memberId, entroEn, porCodigo }          la llave: sin ella no se lee nada (D22)
listas/{listId}/invitaciones/{codigo}    { creadaPor, creadaEn, venceEn, revocada }     el link para sumar a alguien; vence a los 7 días
listas/{listId}/miembros/{memberId}      { nombre, color 'p1'..'p4', creadoEn }        Mamá, Papá...
listas/{listId}/mercados/{mercadoId}     { nombre, creadoEn }                          dónde se compra: Mercadona, Lidl...
listas/{listId}/items/{itemId}           { texto, textoNorm, estado, agregadoEn/Por/PorNombre, compradoEn/Por/PorNombre, borradoEn, actualizadoEn, mercado }
                                         estado 'pendiente' | 'comprado' | 'borrado' — nunca se borra un doc: borrado lógico
                                         mercado = id de un súper o null ("en cualquiera"); viaja con el ítem al tildarlo
listas/{listId}/meta/sugerencias         { entradas: { [textoNorm]: { texto, veces, ultimaVez, mercado } } }   un solo doc, semilla al crear
                                         el `mercado` de acá es lo APRENDIDO por producto: un ítem nuevo con ese texto nace ubicado
```

Todos los tiempos son `serverTimestamp()` (hasta que el servidor los resuelve, la app los ve como `null` y marca el ítem como pendiente).

## Nivel C: publicarla

La original está en **<https://heladera-ec2b4.web.app>** (Firebase Hosting, https, gratis). Si armás la tuya, va a quedar en `https://<tu-proyecto>.web.app`.

Para publicar un cambio — **nunca `firebase deploy` a mano**; el circuito de deploy (D24) es el único camino:

```bash
npm run verificar
```

corre todas las puertas deterministas — la config del `.env` con el que se hornea el bundle, tsc, los tests rápidos (unit + ui), la suite del emulador, el build y las auditorías del artefacto; la lista completa y vigente de qué se audita vive en el propio `scripts/verificar-release.mjs`. Con eso verde —y las auditorías de agentes del circuito aprobadas, ver `.claude/skills/deploy/SKILL.md`— se publica con consentimiento explícito:

```bash
npm run deploy -- --dale
```

que re-corre las puertas, publica **firestore (reglas + índices) y hosting juntos** (si la app nueva lee algo que las reglas viejas no conocen, queda rota hasta que se despliegan — nos pasó con `mercados`; por eso van siempre en el mismo deploy) y compara **lo publicado** byte a byte contra `dist/`, headers incluidos.

La configuración de Firebase vive en `.env` (fuera de git). Para rehacerlo en otra máquina:

```bash
npx firebase apps:sdkconfig WEB <APP_ID> --project <tu-proyecto>
```

Los cuatro valores son públicos por diseño (viajan en el bundle): la seguridad la ponen `firestore.rules`, no esconderlos.

Ojo con **dos** cosas de esa salida. Trae **solo** las cuatro `VITE_FIREBASE_*`: falta `VITE_DB=firestore`, y sin eso el build sale con el Db falso y la lista de ejemplo (`.env.example` ships `VITE_DB=fake`), y lo que la familia anote no se guarda en ningún lado. Y su `authDomain` viene como `<proyecto>.firebaseapp.com`: hay que **pisarlo** por `<proyecto>.web.app`, el dominio donde la app está publicada, porque la redirección de «guardar tu acceso con Google» (D23) tiene que ser same-origin o muere en los navegadores que particionan el almacenamiento de terceros. `npm run verificar` chequea las **dos** cosas antes de construir: es su primera puerta.

## Cómo se entra

Con un link de invitación (⋯ › Sumar a alguien). Cada teléfono se queda con su llave, así que después se entra abriendo la app.

El QR y la pegatina NFC **se sacaron** (D22): los dos abrían un link corto `/h` que Hosting redirigía a la lista, o sea que le entregaba el id de la lista a cualquiera que pidiera una URL de dos caracteres — cuando ese id todavía era la única llave.

**Agregar al inicio (para que se abra como app)**

- **Android (Chrome):** abrí el link → menú ⋮ → **Instalar app** (o **Agregar a la pantalla principal**).
- **iPhone:** abrí el link **desde Safari** (no desde el navegador de Instagram/WhatsApp) → botón Compartir → **Agregar a inicio**. El ícono instalado abre la misma lista; funciona sin señal para lo que ya viste.

## Licencia

El código y los documentos, bajo [MIT](LICENSE). Las tipografías de `docs/diseno/src/fonts/` son de sus autores y se redistribuyen bajo la SIL Open Font License 1.1 ([`OFL.txt`](docs/diseno/src/fonts/OFL.txt)).
