export const meta = {
  name: 'barra-estado',
  description: 'Root cause de la barra de estado/gestos de la PWA instalada: 4 expertos proponen hipótesis FALSABLES, un auditor desafía cada una (¿es la causa real? ¿qué rompe tocarla? ¿la solución es la indicada?), un constructor por problema aprobado, y 2 auditores finales verifican que no se rompió nada — con bucle de vuelta ante el mínimo hallazgo.',
  whenToUse: 'Solo con evidencia NUEVA medida en el teléfono que contradiga D25 (p. ej.: el centinela avisó que salió el arreglo de Chromium #407420295 y la barra sigue sin tomar la paleta). El síntoma solo NO dispara: que la barra de la app instalada se vea del color del sistema es hoy el estado conocido y aceptado. Args: { evidencia: "los datos duros del dispositivo", vueltasMax: 3 }',
  phases: [
    { title: 'Expertos', detail: '2 de arquitectura + 2 de UI full-stack: hipótesis falsables con su experimento' },
    { title: 'Desafío', detail: 'un auditor por hipótesis: causa real, daño colateral, si la solución es la indicada' },
    { title: 'Construir', detail: 'un constructor por problema aprobado, en serie' },
    { title: 'Verificar', detail: '2 auditores finales: que no se haya roto nada' },
  ],
}

const evidencia = (args && args.evidencia) || '(sin evidencia: PEDIRLA antes de teorizar)'
const vueltasMax = (args && args.vueltasMax) || 3

const CONTEXTO = `
Repo: el directorio de trabajo actual — "Heladera", PWA de lista de compras familiar (Vite 8 + React 19 + TS
estricto + CSS Modules + Motion + vite-plugin-pwa/Workbox + Firebase Hosting). Paleta en
src/styles/tokens.css (los \`--paper\`, claro y oscuro: leelos de ahí — acá no se copian). El manifest se
genera en vite.config.ts.

EL SÍNTOMA: la barra de estado (arriba) y la de gestos (abajo) de la app INSTALADA se ven del color del
sistema, no de la paleta de la app. ESO ES HOY LO ESPERADO, no un bug abierto: esta pregunta YA ESTÁ
CERRADA, y el trabajo de esta corrida es decidir si la evidencia de abajo la REABRE.

Leé D25 entera en docs/diseno/decisiones.md antes de teorizar. Acá no se la re-cuenta, solo el marco:
  · Root cause, y no era nuestro: el bug de Chromium #407420295 — en la app instalada esa franja la pinta
    Chrome, no la página. El arreglo ya está escrito en Chrome y está APAGADO, esperando salir; hay un
    centinela programado que avisa cuando eso pase.
  · Decisión: NO hornear ningún color. Hornear rompe la pareja fondo/íconos, porque el color de los íconos
    (reloj, batería) lo decide el MODO del sistema, no el nuestro.
  · La sección «La barra de estado de la app instalada» (2026-08-28) es la HISTORIA que D25 superó: ahí vive
    la premisa falsa que desvió dos investigaciones enteras, y tres hallazgos ya pagados. No es fuente: no
    arranques de ahí.

Dos barandas duras, y las dos son parte del trabajo:
  (i) si la evidencia NO reabre D25, se dice y se PARA. Cerrar sin tocar nada es un resultado válido y es el
      esperado; volver a proponer un arreglo para el estado ya explicado es repetir la saga.
  (ii) la puerta de scripts/verificar-release.mjs rechaza el \`theme_color\` y los campos \`dark_*\` en el
      manifest: cualquier arreglo por ahí muere en \`npm run verificar\`. El que quiera ir por ese camino
      argumenta contra D25 primero — no lo codea y después discute.

═══ EVIDENCIA NUEVA (medida, no supuesta) ═══
${evidencia}

REGLA DE ORO DE ESTE TRABAJO: no se asume. Lo que reporta el dueño es un dato, no una opinión a corregir; si
tu teoría lo contradice, la teoría está incompleta. Todo lo que afirmes sobre Chromium/WebAPK/manifest se
verifica contra una FUENTE REAL (el código de Chromium, la spec del Web App Manifest, la documentación de
web.dev/developer.chrome.com, un bug de crbug.com, o el artefacto publicado) y se cita. «Yo creo que Chrome
hace X» no es un dato: por creer eso exactamente estamos acá.

PROHIBIDO: deployar, commitear, o tocar producción. El canal vivo no se toca en ninguna fase.`

const HIPOTESIS = {
  type: 'object',
  properties: {
    hipotesis: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          titulo: { type: 'string' },
          mecanismo: { type: 'string', description: 'POR QUÉ pasa: la cadena causal completa, con la fuente real que la respalda (link/archivo/línea)' },
          queContradiceDeD25: { type: 'string', description: 'qué punto MEDIDO de D25 contradice esta hipótesis, y con qué evidencia nueva del teléfono; si no contradice ninguno, no es una hipótesis nueva' },
          experimento: { type: 'string', description: 'el experimento concreto que la MATA o la confirma (qué se cambia, dónde se publica, qué tiene que mirar el dueño y qué resultado esperaría cada rama)' },
          arreglo: { type: 'string', description: 'el arreglo propuesto si resulta cierta' },
          confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
        },
        required: ['titulo', 'mecanismo', 'queContradiceDeD25', 'experimento', 'arreglo', 'confianza'],
      },
    },
    loQueNoSePuedeSaberSinElTelefono: { type: 'string', description: 'qué preguntas quedan abiertas y qué habría que pedirle al dueño' },
  },
  required: ['hipotesis', 'loQueNoSePuedeSaberSinElTelefono'],
}

const VEREDICTO = {
  type: 'object',
  properties: {
    esLaCausaReal: { type: 'boolean' },
    evidenciaDelVeredicto: { type: 'string', description: 'qué verificaste y contra qué fuente real; si la refutás, con qué' },
    danioDeTocarlo: { type: 'string', description: 'qué puede romper aplicar el arreglo propuesto (regresiones, otras plataformas, la saga previa)' },
    solucionIndicada: { type: 'boolean', description: 'true si el arreglo propuesto es el más indicado; false si hay uno mejor' },
    mejorArreglo: { type: 'string', description: 'el arreglo que recomendás (el propuesto, o el mejor que encontraste, con su fuente)' },
    listoParaConstruir: { type: 'boolean', description: 'true solo si es causa real Y el arreglo está claro y acotado' },
  },
  required: ['esLaCausaReal', 'evidenciaDelVeredicto', 'danioDeTocarlo', 'solucionIndicada', 'mejorArreglo', 'listoParaConstruir'],
}

const CONSTRUIDO = {
  type: 'object',
  properties: {
    aplicado: { type: 'boolean' },
    archivosTocados: { type: 'array', items: { type: 'string' } },
    queHice: { type: 'string' },
    comoSeVerifica: { type: 'string', description: 'el paso a paso EXACTO para que el dueño lo compruebe en su teléfono (canal de preview, instalar, qué mirar)' },
    puertas: { type: 'string', description: 'resultado de npm run verificar tras el cambio' },
  },
  required: ['aplicado', 'archivosTocados', 'queHice', 'comoSeVerifica', 'puertas'],
}

const VERIFICACION = {
  type: 'object',
  properties: {
    todoBien: { type: 'boolean', description: 'true solo si no se rompió nada y el cambio es coherente con lo que dice resolver' },
    hallazgos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          titulo: { type: 'string' },
          detalle: { type: 'string' },
          volverA: { type: 'string', enum: ['expertos', 'constructores'], description: 'expertos si la causa está mal entendida; constructores si es la ejecución' },
        },
        required: ['titulo', 'detalle', 'volverA'],
      },
    },
    resumen: { type: 'string' },
  },
  required: ['todoBien', 'hallazgos', 'resumen'],
}

const EXPERTOS = [
  { key: 'arq-webapk', mision: `Sos experto en la ARQUITECTURA de PWAs instaladas en Android: WebAPK, el shell de Chromium, cómo se hornea un manifest en el APK, cuándo y cómo se regenera, qué campos lee cada versión, y cómo Chromium decide el color de la barra de estado y de la barra de navegación en modo standalone. Andá al CÓDIGO de Chromium y a los bugs de crbug si hace falta. La pregunta que tenés que responder con fuentes: ¿qué determina HOY, en el Chrome de la evidencia, el color de esas dos barras en una PWA instalada?` },
  { key: 'arq-build', mision: `Sos experto en la ARQUITECTURA del build: Vite 8, vite-plugin-pwa, Workbox, cómo se genera el manifest, cómo se sirve, y toda la cadena desde el código fuente hasta el artefacto publicado. Auditá git como CONTROL (git log -p sobre vite.config.ts, index.html, src/main.tsx, src/styles/tokens.css): ¿qué cambio concreto de NUESTRO lado PODRÍA alterar el color de esas barras, y cuál no puede? Ojo con el reflejo de buscar un culpable nuestro: D25 ya midió que la causa no es del repo, así que «ninguno puede» es una respuesta completa y esperada, no un fracaso.` },
  { key: 'ui-web', mision: `Sos experto en UI/frontend con dominio COMPLETO del stack (HTML/CSS moderno, meta theme-color y sus media queries, prefers-color-scheme, el Web App Manifest y su spec actual, la propuesta de user preference media features, y cómo interactúan con el navegador y con el sistema operativo). La pregunta: ¿cuál es el mecanismo CORRECTO Y VIGENTE para que una PWA instalada pinte esas barras con SU paleta en los dos modos, y qué mecanismos son propuestas muertas o no implementadas? Citá la spec y el estado de implementación real.` },
  { key: 'ui-app', mision: `Sos experto en UI/frontend con dominio COMPLETO del stack, enfocado en ESTE producto: leé src/styles/tokens.css, index.html, vite.config.ts, src/main.tsx y D25. La pregunta: dado lo que la app declara HOY (metas, manifest, tokens) y la evidencia del dispositivo, ¿qué está recibiendo el sistema y qué le falta para pintar la paleta? Mirá las DOS barras: la de estado y la de GESTOS (navigation bar), que es la otra mitad del reporte.` },
]

// ═══ Fase 1 · los cuatro expertos, en paralelo ════════════════════════════════════════════════════════════
const informes = await parallel(EXPERTOS.map(e => () =>
  agent(`${CONTEXTO}\n\n${e.mision}\n\nEntregá HIPÓTESIS FALSABLES, no diagnósticos: cada una con su mecanismo
respaldado por una fuente real citada, qué punto MEDIDO de D25 contradice y con qué evidencia nueva, y el
experimento concreto que la mata o la confirma. Si algo no se puede saber sin el teléfono, decilo en vez de
rellenarlo — y si no encontrás ninguna hipótesis que contradiga a D25, entregá cero: eso también es un
resultado.`,
    { label: `experto:${e.key}`, phase: 'Expertos', schema: HIPOTESIS })
    .then(r => ({ experto: e.key, ...r }))))

const validos = informes.filter(Boolean)
const todas = validos.flatMap(i => (i.hipotesis ?? []).map(h => ({ experto: i.experto, ...h })))
log(`Expertos: ${todas.length} hipótesis de ${validos.length}/${EXPERTOS.length} informes. Cada una va a su auditor.`)

// ═══ Fase 2 · un auditor por hipótesis: desafía TODO ══════════════════════════════════════════════════════
const juzgadas = await parallel(todas.map((h, i) => () =>
  agent(`${CONTEXTO}\n\nSos el AUDITOR de UNA hipótesis (la #${i + 1} de ${todas.length}), y tu trabajo es
DESAFIARLA, no acompañarla:\n\n${JSON.stringify(h, null, 2)}\n\nRespondé, cada cosa con evidencia verificada
contra fuentes reales: (1) ¿es la causa REAL? Intentá refutarla; una hipótesis que no contradice, con
evidencia MEDIDA, algún punto de D25 no es causa: es la saga otra vez. (2) ¿Qué DAÑO puede causar tocar eso?
(regresiones, otras plataformas, lo que la saga previa ya rompió una vez).
(3) ¿El arreglo propuesto es el MÁS INDICADO, o hay uno mejor?
(4) ¿Está listo para construir, o falta evidencia? Sé duro: acá se decide qué se toca en la app que usa una
familia.`, { label: `desafio:${(h.titulo ?? '').slice(0, 28)}`, phase: 'Desafío', schema: VEREDICTO })
    .then(v => ({ hipotesis: h, veredicto: v }))))

const conVeredicto = juzgadas.filter(x => x && x.veredicto)
const aprobadas = conVeredicto.filter(x => x.veredicto.esLaCausaReal && x.veredicto.listoParaConstruir)
const rechazadas = conVeredicto.filter(x => !(x.veredicto.esLaCausaReal && x.veredicto.listoParaConstruir))
log(`Desafío: ${aprobadas.length} hipótesis pasan a construcción, ${rechazadas.length} rechazadas o sin evidencia suficiente.`)

if (aprobadas.length === 0) {
  return {
    aprobado: false,
    motivo: 'ninguna hipótesis sobrevivió al desafío: D25 sigue en pie y no se toca nada. Es un resultado válido, no un fracaso — la evidencia de esta corrida no reabrió la decisión.',
    hipotesis: conVeredicto.map(x => ({ titulo: x.hipotesis.titulo, experto: x.hipotesis.experto, veredicto: x.veredicto })),
    faltaEvidencia: validos.map(i => ({ experto: i.experto, pide: i.loQueNoSePuedeSaberSinElTelefono })),
  }
}

// ═══ Fases 3–4 · construir y verificar, en bucle hasta que los dos auditores finales aprueben ════════════
let vuelta = 0
let pendientes = aprobadas
const construidos = []
let verificacion = null
while (vuelta < vueltasMax) {
  vuelta++
  for (const [i, caso] of pendientes.entries()) {
    const r = await agent(`${CONTEXTO}\n\nSos el CONSTRUCTOR de UN problema (el #${i + 1} de ${pendientes.length}, vuelta ${vuelta}). Su hipótesis ya
pasó el desafío de un auditor:\n\nHIPÓTESIS:\n${JSON.stringify(caso.hipotesis, null, 2)}\n\nVEREDICTO DEL AUDITOR (incluye el arreglo recomendado y el daño a evitar):\n${JSON.stringify(caso.veredicto, null, 2)}\n${caso.correcciones ? `\nCORRECCIONES DE LOS AUDITORES FINALES (esta es una vuelta de arreglo, atendelas):\n${caso.correcciones}\n` : ''}
Aplicá el arreglo RECOMENDADO por el auditor con buenas prácticas del repo: nada hardcodeado (colores en
tokens.css, copy en textos.ts), respetá las capas, y no toques nada fuera de tu problema. Al terminar corré
\`npm run verificar\` (timeout 600000) y reportá. Y escribí el paso a paso EXACTO para que el dueño lo
compruebe en SU teléfono con un canal de preview (hosting:channel:deploy da una URL distinta ⇒ WebAPK
distinto ⇒ se instala y se mira, sin tocar el canal vivo). PROHIBIDO: deployar al canal vivo, commitear.`,
      { label: `construir:${(caso.hipotesis.titulo ?? '').slice(0, 28)}`, phase: 'Construir', schema: CONSTRUIDO })
    construidos.push({ titulo: caso.hipotesis.titulo, vuelta, ...(r ?? { aplicado: false, queHice: 'la corrida del constructor cayó' }) })
  }

  const auditoresFinales = await parallel([1, 2].map(n => () =>
    agent(`${CONTEXTO}\n\nSos uno de los DOS auditores finales (el #${n}, independiente del otro). Se acaba de construir
esto:\n\n${JSON.stringify(construidos.filter(c => c.vuelta === vuelta), null, 2)}\n\nVerificá con el código real y \`git diff\`: (1) que NO se haya roto nada (puertas, tests, la app, la saga
previa de la barra que ya pagó tres hallazgos); (2) que el cambio realmente pueda resolver lo que dice, según
las fuentes; (3) que no haya efectos colaterales sin considerar. CUALQUIER hallazgo, por mínimo que sea, lo
reportás con «volverA»: «expertos» si la causa está mal entendida, «constructores» si es la ejecución.`,
      { label: `verificar:${n}`, phase: 'Verificar', schema: VERIFICACION })))

  const vs = auditoresFinales.filter(Boolean)
  const hallazgos = vs.flatMap(v => v.hallazgos ?? [])
  verificacion = { vuelta, auditores: vs, hallazgos }
  if (vs.length === 2 && vs.every(v => v.todoBien) && hallazgos.length === 0) {
    log(`APROBADO en la vuelta ${vuelta}: los dos auditores finales dan todo bien, sin hallazgos.`)
    return { aprobado: true, vueltas: vuelta, construidos, verificacion, rechazadas: rechazadas.map(x => ({ titulo: x.hipotesis.titulo, veredicto: x.veredicto })) }
  }
  log(`Vuelta ${vuelta}: ${hallazgos.length} hallazgos de los auditores finales — vuelve a construcción con las correcciones.`)
  pendientes = aprobadas.map(c => ({ ...c, correcciones: JSON.stringify(hallazgos, null, 2) }))
}

return { aprobado: false, motivo: `se agotaron las ${vueltasMax} vueltas sin que los dos auditores aprueben`, construidos, verificacion }
