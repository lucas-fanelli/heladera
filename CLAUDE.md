# Heladera — reglas de trabajo

- **Diseñar y discutir antes de construir.** Las decisiones viven en `docs/diseno/decisiones.md`; lo nuevo
  se propone ahí primero. Cuando lo que reporta el dueño contradice tu modelo, preguntale qué ve antes de
  concluir — la root cause, no los síntomas.
- **Nada hardcodeado.** Colores y tiempos en tokens, copy en `src/ui/textos.ts` (rioplatense, voseo),
  y el nombre de nadie viaja en el producto.
- **Capas:** la UI solo conoce la interfaz `Db` (`src/db/types.ts`). El fake espeja al real y
  `src/db/contrato.ts` fija el comportamiento en los dos mundos.
- **Commitear solo cuando el dueño lo dice; deployar solo con su aprobación explícita.**
- **Deploy: SIEMPRE por el circuito** — skill `deploy` (`.claude/skills/deploy/SKILL.md`): puertas
  deterministas (`npm run verificar`), circuito de auditorías 3+3 (`Workflow {name: 'auditoria-release'}`)
  en loop hasta que apruebe, y `npm run deploy -- --dale` (que verifica lo publicado byte a byte). Nunca
  `firebase deploy` a mano — las únicas excepciones (setup inicial, índices nuevos, runbooks de emergencia)
  están sancionadas en la skill, y ahí el comando que el script imprime manda.
