import { describe, expect, it } from 'vitest';
import { cuentaDe } from './cuenta';

describe('cuentaDe', () => {
  it('sin usuario todavía (la auth no resolvió): anónima', () => {
    expect(cuentaDe(null, null)).toEqual({ estado: 'anonima' });
  });

  it('usuario anónimo: anónima', () => {
    expect(cuentaDe({ anonimo: true, email: null }, null)).toEqual({ estado: 'anonima' });
  });

  it('usuario con cuenta: guardada, con su email', () => {
    expect(cuentaDe({ anonimo: false, email: 'a@b.com' }, null)).toEqual({ estado: 'guardada', email: 'a@b.com' });
  });

  it('con cuenta pero sin email visible: guardada igual (el email es informativo, no la llave)', () => {
    expect(cuentaDe({ anonimo: false, email: null }, null)).toEqual({ estado: 'guardada', email: null });
  });

  it('el choque manda sobre todo: hay una oferta pendiente de entrar con esa cuenta', () => {
    expect(cuentaDe({ anonimo: true, email: null }, { email: 'a@b.com' })).toEqual({ estado: 'choque', email: 'a@b.com' });
    expect(cuentaDe(null, { email: null })).toEqual({ estado: 'choque', email: null });
  });
});
