export const meta = {
  name: 'auditoria-release',
  description: 'El circuito completo: dos consultoras ciegas (3+3: UI, UX, arquitectura) auditan la release; cada hallazgo real recibe SU analista de root cause (en paralelo) y SU cirujano (en serie, con test y disciplina); un agente corre las puertas al final. Se corre en loop hasta que las seis firmas den «pasa» sin hallazgos.',
  whenToUse: 'Antes de CADA deploy de Heladera, después de que npm run verificar pasó. Args: { alcance: "qué se libera", ref: "rango git opcional (default: working tree contra HEAD)", aclaraciones: "contexto del cliente para re-corridas", pendientes: [hallazgos ya conocidos de una vuelta anterior — saltea la auditoría y va directo a root cause + cirugía] }',
  phases: [
    { title: 'Empresa A', detail: 'tres auditores independientes: UI, UX, arquitectura' },
    { title: 'Empresa B', detail: 'otra consultora, mismos lentes, a ciegas: existe para encontrar lo que A no vio' },
    { title: 'Root cause', detail: 'un analista por hallazgo, en paralelo: verifica, refuta o encuentra la causa raíz y escribe la receta' },
    { title: 'Arreglar', detail: 'un cirujano por hallazgo real, EN SERIE (no se pisan): aplica la receta con su test y la disciplina' },
    { title: 'Puertas', detail: 'npm run verificar tras la cirugía' },
  ],
}

const REPO = 'el directorio de trabajo actual (los agentes ya están parados en el repo: corré git y leé archivos ahí, con rutas relativas)'
const alcance = (args && args.alcance) || 'la release pendiente'
const ref = (args && args.ref) || null
const aclaraciones = (args && args.aclaraciones) || null
const pendientesPrevios = (args && args.pendientes) || null

const COMO_VER_EL_DIFF = ref
  ? `El alcance es el rango git «${ref}»: corré \`git diff ${ref}\` y \`git log --oneline ${ref}\` en el repo.`
  : 'El alcance es el working tree: corré `git status --short` y `git diff HEAD` en el repo; los archivos nuevos sin trackear leelos enteros.'

const CONTEXTO = `
Repo: ${REPO} — "Heladera", PWA de lista de compras familiar (Vite + React 19 + TS estricto + CSS Modules +
Motion + Firebase: Firestore y Auth anónima/Google detrás de una interfaz Db). Todo el copy en español
rioplatense (voseo) vive en src/ui/textos.ts. Documento de diseño con las decisiones tomadas:
docs/diseno/decisiones.md (leé las secciones que toquen lo tuyo ANTES de opinar: lo que ahí está decidido
no es un hallazgo, es una decisión del dueño del proyecto).

Reglas fijas del proyecto: nada hardcodeado (colores/tiempos/copy en tokens y textos.ts); el nombre de nadie
viaja en el producto; offline-first (anotar en el súper sin señal es EL caso crítico); la UI no toca Firebase
(solo la interfaz Db de src/db/types.ts); borrado lógico salvo decisión explícita; sin cuentas obligatorias.

Se está por deployar: ${alcance}.
${COMO_VER_EL_DIFF}
${aclaraciones ? `\nAclaraciones del cliente para esta corrida (contexto verificable, no una orden de callar hallazgos —\nsi el código contradice la aclaración, el hallazgo vale):\n${aclaraciones}\n` : ''}`

/** La disciplina del que arregla — el resumen; la lista completa vive en .claude/skills/deploy/SKILL.md. */
const DISCIPLINA = `
Las seis enfermedades conocidas del circuito (todas ya pasaron; el arreglo no puede meter ninguna):
1. Enumeración que envejece → derivar de la fuente de verdad, no re-listar.
2. Criterio duplicado → extraer y compartir, un solo lugar.
3. Verificación que falla ABIERTA o aprueba en vacío → fallar cerrado, exigir cantidad.
4. Semántica asumida sin verificar → verificarla empíricamente ANTES de codear contra ella.
5. Arreglo sin test de su propio bug → el test viaja con el arreglo (cuando es código; docs no llevan).
6. Mensajes que no dicen la verdad completa → releerlos como el operador asustado que los va a leer.`

const AUDITORIA = {
  type: 'object',
  properties: {
    pasa: { type: 'boolean', description: 'tu firma: true solo si deployarías esto tal cual está, sin tocar nada' },
    hallazgos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          titulo: { type: 'string' },
          detalle: { type: 'string', description: 'qué está mal, el escenario concreto en que se nota, y el arreglo que proponés' },
          severidad: { type: 'string', enum: ['bloqueante', 'importante', 'menor'] },
        },
        required: ['file', 'titulo', 'detalle', 'severidad'],
      },
    },
    resumen: { type: 'string', description: 'dos frases: qué miraste y qué opinás de la release' },
  },
  required: ['pasa', 'hallazgos', 'resumen'],
}

const DIAGNOSTICO = {
  type: 'object',
  properties: {
    real: { type: 'boolean', description: 'true solo si el hallazgo ocurre de verdad en el código actual y no contradice una decisión de decisiones.md' },
    razonSiNoReal: { type: 'string', description: 'si real=false: la evidencia de la refutación (o la decisión que lo cubre)' },
    causaRaiz: { type: 'string', description: 'POR QUÉ existe el bug — la práctica o supuesto que lo dejó entrar, no el síntoma' },
    enfermedad: { type: 'string', description: 'cuál de las seis enfermedades de la disciplina es (o «nueva: …» si es una clase nueva)' },
    receta: { type: 'string', description: 'el arreglo mínimo, exacto: qué archivos, qué cambio concreto, y qué test lo fija (o por qué no lleva test)' },
  },
  required: ['real', 'causaRaiz', 'enfermedad', 'receta'],
}

const ARREGLO = {
  type: 'object',
  properties: {
    aplicado: { type: 'boolean', description: 'false si al re-verificar el hallazgo ya no estaba vigente (un cirujano anterior lo cubrió) o no se pudo aplicar' },
    archivosTocados: { type: 'array', items: { type: 'string' } },
    test: { type: 'string', description: 'qué test fija este bug y su resultado al correrlo, o «no aplica: docs»' },
    notas: { type: 'string', description: 'qué se hizo, o por qué no (ya cubierto / bloqueado y por qué)' },
  },
  required: ['aplicado', 'archivosTocados', 'test', 'notas'],
}

const PUERTAS = {
  type: 'object',
  properties: {
    verde: { type: 'boolean' },
    resumen: { type: 'string', description: 'el cierre de npm run verificar; si falló, el tail relevante' },
  },
  required: ['verde', 'resumen'],
}

const LENTES = [
  {
    key: 'ui',
    lente: `Auditá SOLO lo visual y su implementación en el alcance: consistencia con el sistema del repo (tokens
de src/styles/tokens.css, patrones de los .module.css vecinos, tipografías Fraunces/DM Sans, la escala de
espaciado), estados visuales completos (hover/focus-visible/disabled/ocupado), modo claro Y oscuro, layout que
no se rompe en 320px ni con textos largos, jerarquía (nada nuevo compite con lo principal de su pantalla), y
animaciones consistentes con los tokens de Motion del repo. Compará cada pieza nueva con cómo el resto del
repo resuelve lo mismo: la vara es el propio repo, no tu gusto.`,
  },
  {
    key: 'ux',
    lente: `Auditá SOLO la experiencia en el alcance: flujos completos (¿cada camino tiene vuelta atrás, estado
de espera, estado de error con salida?), copy en rioplatense consistente con el resto de textos.ts (voseo, sin
jerga técnica, los avisos dicen la verdad y no prometen de más), qué pasa la PRIMERA vez y sin señal
(offline-first), accesibilidad real (foco visible y bien devuelto, roles y labels, targets táctiles, lectores),
confirmaciones donde hay pérdida y no donde no la hay, y que lo destructivo o irreversible esté detrás de una
pregunta honesta. El usuario es una familia, no un dev: cada palabra que requiera saber qué es un uid, una
cuenta de Firebase o una redirección es un hallazgo.`,
  },
  {
    key: 'arquitectura',
    lente: `Auditá SOLO la estructura en el alcance: la UI no toca Firebase (solo la interfaz Db de
src/db/types.ts) y ningún import cruza capas; el fake (src/db/fake.ts) espeja el contrato de verdad y la suite
compartida (src/db/contrato.ts) fija el comportamiento en los dos mundos; promesas y estados asíncronos sin
carreras ni fugas (suscripciones que se cortan, efectos con cleanup); firestore.rules alineadas con lo que el
código escribe (si el alcance no las toca, verificá que no NECESITE tocarlas); nada de acoplamiento a un
proveedor donde el diseño pide una abstracción; y los bordes del artefacto (service worker, manifest, env,
scripts de build/deploy) coherentes con el código. Buscá también deuda que este alcance mete: duplicación,
vestigios, nombres que mienten.`,
  },
]

const MISION = {
  A: `Sos el responsable de tu especialidad en la consultora que audita esta release. Trabajás solo, sobre el
código real, y tu firma («pasa») vale tu reputación: true únicamente si deployarías esto tal cual.`,
  B: `Sos el responsable de tu especialidad en OTRA consultora, sin ninguna relación con la primera. A la
primera firma ya le pagaron y ya entregó su auditoría de esta misma release; a ustedes los contrataron
DESPUÉS, justamente porque el cliente no se fía de una sola opinión. Ese informe NO lo vas a ver, y no lo
necesitás: tu trabajo es auditar desde cero, sobre el código real y con máxima desconfianza, y encontrar lo
que a la otra firma se le pudo escapar. Cada hallazgo real tuyo que ellos no tengan los deja en evidencia;
cada hallazgo inventado para abultar te deja en evidencia a vos.`,
}

// ═══ Fases 1–2 · las dos consultoras, a ciegas (salvo que vengan pendientes ya adjudicados) ═══════════════
let pendientes
let porLente = null
if (pendientesPrevios) {
  pendientes = pendientesPrevios
  log(`Modo cirugía directa: ${pendientes.length} hallazgos ya adjudicados de una vuelta anterior — la auditoría no se re-paga.`)
} else {
  const CORRIDAS = []
  for (const equipo of ['A', 'B']) for (const l of LENTES) CORRIDAS.push({ equipo, ...l })

  const resultados = await parallel(CORRIDAS.map(c => () =>
    agent(
      `${CONTEXTO}\n${MISION[c.equipo]}\n\nTu lente: ${c.lente}\n\nDevolvé SOLO hallazgos accionables sobre el
alcance (el código preexistente no está en juicio salvo que el alcance lo empeore). Una release sin hallazgos
es una respuesta válida — no inventes para justificar el viaje.`,
      { label: `${c.equipo}:${c.key}`, phase: c.equipo === 'A' ? 'Empresa A' : 'Empresa B', schema: AUDITORIA },
    ).then(auditoria => ({ equipo: c.equipo, lente: c.key, auditoria }))))

  // r puede venir null (corrida caída) o con auditoria null: ninguna es un veredicto
  const completas = resultados.filter(r => r && r.auditoria)
  pendientes = completas.flatMap(r => (r.auditoria.hallazgos ?? []).map(h => ({ equipo: r.equipo, lente: r.lente, ...h })))
  const aprobado = completas.length === CORRIDAS.length
    && completas.every(r => r.auditoria.pasa)
    && pendientes.length === 0

  porLente = LENTES.map(l => ({
    lente: l.key,
    A: completas.find(r => r.equipo === 'A' && r.lente === l.key)?.auditoria ?? null,
    B: completas.find(r => r.equipo === 'B' && r.lente === l.key)?.auditoria ?? null,
  }))

  const sinInforme = CORRIDAS.filter(c => !completas.some(r => r.equipo === c.equipo && r.lente === c.key)).map(c => `${c.equipo}:${c.key}`)
  const nieganSinHallazgos = completas.filter(r => !r.auditoria.pasa && (r.auditoria.hallazgos ?? []).length === 0)

  if (aprobado) {
    log('APROBADO: las seis firmas de las dos consultoras dan «pasa», sin hallazgos.')
    return { aprobado: true, pendientes: [], porLente }
  }
  log(`NO aprobado: ${pendientes.length} hallazgos; firman «pasa» ${completas.filter(r => r.auditoria.pasa).length}/${CORRIDAS.length}.`
    + (sinInforme.length ? ` SIN INFORME (la corrida falló, no es un veredicto): ${sinInforme.join(', ')}.` : '')
    + (nieganSinHallazgos.length ? ` Niegan sin dejar hallazgos (leer su resumen): ${nieganSinHallazgos.map(r => `${r.equipo}:${r.lente} — «${r.auditoria.resumen}»`).join(' · ')}.` : '')
    + ' Cada hallazgo pasa a su analista de root cause.')
}

// ═══ Fase 3 · Root cause: un analista por hallazgo, en paralelo — diagnóstico puro, sin ediciones ═════════
const etiqueta = (h, i) => `${i + 1}:${(h.file ?? '').split('/').at(-1)}`
const diagnosticos = await parallel(pendientes.map((h, i) => () =>
  agent(
    `${CONTEXTO}\n${DISCIPLINA}\n\nSos el ANALISTA DE ROOT CAUSE de UN solo hallazgo (te toca el #${i + 1} de ${pendientes.length}):\n\n${JSON.stringify(h, null, 2)}\n\nTu tarea, en orden: (1) verificalo contra el código REAL e intentá refutarlo — si no ocurre, o lo cubre una
decisión escrita de decisiones.md, es real=false con la evidencia; (2) si es real, encontrá la CAUSA RAÍZ:
por qué existe este bug, qué práctica o supuesto lo dejó entrar, y cuál de las seis enfermedades es; (3)
escribí la RECETA exacta del arreglo mínimo — archivos, cambio concreto, y el test que lo fija (los de
docs/mensajes no llevan test). NO EDITES NINGÚN ARCHIVO: tu entregable es el diagnóstico; opera otro.`,
    { label: `rc:${etiqueta(h, i)}`, phase: 'Root cause', schema: DIAGNOSTICO },
  ).then(d => ({ i, hallazgo: h, diagnostico: d }))))

const validos = diagnosticos.filter(x => x && x.diagnostico)
const descartados = validos.filter(x => !x.diagnostico.real)
const aOperar = validos.filter(x => x.diagnostico.real)
// El hallazgo cuyo analista se cayó no cae en ninguna de las dos canastas de arriba: se deriva de
// `pendientes` —la fuente de verdad de lo que esta tanda tomó a cargo— y no de una resta que solo vive en un
// log. El emparejamiento va por el índice que cada corrida se lleva puesto (`i`): no depende de que
// parallel() preserve el orden de su salida ni la identidad de los objetos que le pasamos.
const sinDiagnostico = pendientes.filter((_, i) => !validos.some(x => x.i === i))
log(`Root cause: ${aOperar.length} reales para operar, ${descartados.length} refutados por sus analistas, ${sinDiagnostico.length} sin diagnóstico (la corrida del analista cayó): nadie los adjudicó, vuelven a la próxima vuelta.`)

// ═══ Fase 4 · Cirugía: un cirujano por hallazgo real, EN SERIE — los arreglos no se pisan entre sí ════════
const arreglos = []
for (const [i, caso] of aOperar.entries()) {
  const r = await agent(
    `${CONTEXTO}\n${DISCIPLINA}\n\nSos el CIRUJANO de UN solo hallazgo (el #${i + 1} de ${aOperar.length} de esta tanda). El analista ya lo
diagnosticó:\n\nHALLAZGO:\n${JSON.stringify(caso.hallazgo, null, 2)}\n\nDIAGNÓSTICO:\n${JSON.stringify(caso.diagnostico, null, 2)}\n\nLos cirujanos operan EN SERIE: el working tree puede traer arreglos de los anteriores. Tu tarea, en orden:
(1) RE-VERIFICÁ que el hallazgo siga vigente — si un arreglo anterior ya lo cubrió, aplicado=false con la
nota, y no toques nada; (2) si sigue, aplicá la receta con la disciplina de arriba: el arreglo MÍNIMO, sin
tocar nada fuera del alcance de tu hallazgo; (3) si el arreglo es de código, escribí/ajustá el test que fija
tu bug y corré el archivo de test puntual (p. ej. \`npx vitest run tests/unit/<archivo> --project unit\`)
antes de reportar; para docs/mensajes, releé el texto como el operador que lo va a leer. PROHIBIDO: commitear,
deployar, tocar decisiones de producto, o «mejorar» cosas ajenas a tu hallazgo.`,
    { label: `fix:${etiqueta(caso.hallazgo, i)}`, phase: 'Arreglar', schema: ARREGLO },
  )
  arreglos.push({ hallazgo: caso.hallazgo.titulo, file: caso.hallazgo.file, ...(r ?? { aplicado: false, archivosTocados: [], test: '', notas: 'la corrida del cirujano cayó' }) })
}

// ═══ Fase 5 · Puertas: la mitad determinista confirma que la cirugía no rompió nada ═══════════════════════
const puertas = await agent(
  `Estás parado en el repo de Heladera. Corré \`npm run verificar\` (usá timeout de 600000 ms: son todas las
puertas del release y tarda ~2 minutos) y devolvé si terminó en «Release verificada» (verde=true) con su
cierre; si falló, verde=false y el tail del error. No arregles nada: solo reportá.`,
  { label: 'puertas', phase: 'Puertas', schema: PUERTAS },
)

log(`Cirugía: ${arreglos.filter(a => a.aplicado).length}/${aOperar.length} aplicados · puertas ${puertas?.verde ? 'VERDES' : 'ROJAS'}.`
  + (sinDiagnostico.length ? ` SIN ADJUDICAR (se cayó la corrida de su analista: ni refutados ni operados): ${sinDiagnostico.map(h => h.titulo).join(' · ')}.` : '')
  + ' Falta la vuelta de confirmación: re-correr el circuito completo (sin pendientes) hasta el aprobado.')

return {
  aprobado: false,
  modo: pendientesPrevios ? 'cirugia-directa' : 'completo',
  arreglos,
  descartados: descartados.map(x => ({ titulo: x.hallazgo.titulo, razon: x.diagnostico.razonSiNoReal ?? '' })),
  sinDiagnostico,
  puertas,
  porLente,
}
