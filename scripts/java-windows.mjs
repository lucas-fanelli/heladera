// El emulador de Firestore es Java, y en Windows muere al arrancar con
//   "Unable to establish loopback connection" / NoSuchFileException
// cuando el TEMP del usuario es un nombre corto 8.3 con virgulilla (C:\Users\USUARI~1\AppData\Local\Temp): el JDK no
// puede crear ahí el socket de dominio unix que usa para hablar consigo mismo. Se arregla dándole un directorio de
// nombre corto y sin ~. Antes había que acordarse de exportar JAVA_TOOL_OPTIONS a mano en cada terminal.
const TMP_CORTO = 'C:\\Temp';

/** Prepara JAVA_TOOL_OPTIONS si hace falta (no pisa el que ya venga puesto). `mkdir` se inyecta para poder testearlo. */
export function javaEnWindows(mkdir, env = process.env, plataforma = process.platform) {
  if (plataforma !== 'win32' || env.JAVA_TOOL_OPTIONS) return null;
  const temp = env.TEMP ?? env.TMP ?? '';
  if (!temp.includes('~')) return null;
  mkdir(TMP_CORTO, { recursive: true });
  env.JAVA_TOOL_OPTIONS = `-Djdk.net.unixdomain.tmpdir=${TMP_CORTO}`;
  return env.JAVA_TOOL_OPTIONS;
}
