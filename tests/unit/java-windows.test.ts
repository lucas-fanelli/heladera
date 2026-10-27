import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- script de node sin tipos (es .mjs a propósito: lo corre npm, no vite)
import { javaEnWindows } from '../../scripts/java-windows.mjs';

describe('javaEnWindows', () => {
  it('en un TEMP con virgulilla prepara JAVA_TOOL_OPTIONS y crea el directorio corto', () => {
    const mkdir = vi.fn();
    const env: Record<string, string> = { TEMP: 'C:\\Users\\USUARI~1\\AppData\\Local\\Temp' };
    const r = javaEnWindows(mkdir, env, 'win32');
    expect(mkdir).toHaveBeenCalledWith('C:\\Temp', { recursive: true });
    expect(env.JAVA_TOOL_OPTIONS).toBe('-Djdk.net.unixdomain.tmpdir=C:\\Temp');
    expect(r).toBe(env.JAVA_TOOL_OPTIONS);
  });

  it('no toca nada con un TEMP normal, fuera de Windows, o si ya está puesto a mano', () => {
    const mkdir = vi.fn();
    const normal: Record<string, string> = { TEMP: 'C:\\Users\\ana\\AppData\\Local\\Temp' };
    expect(javaEnWindows(mkdir, normal, 'win32')).toBeNull();
    expect(normal.JAVA_TOOL_OPTIONS).toBeUndefined();

    const linux: Record<string, string> = { TEMP: '/tmp/x~y' };
    expect(javaEnWindows(mkdir, linux, 'linux')).toBeNull();

    const puesto: Record<string, string> = { TEMP: 'C:\\Users\\USUARI~1\\Temp', JAVA_TOOL_OPTIONS: '-Xmx1g' };
    expect(javaEnWindows(mkdir, puesto, 'win32')).toBeNull();
    expect(puesto.JAVA_TOOL_OPTIONS).toBe('-Xmx1g');

    expect(mkdir).not.toHaveBeenCalled();
  });
});
