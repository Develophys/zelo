import { describe, expect, it } from 'vitest';
import { resolveApiBaseUrl } from './api-base-url';

describe('resolveApiBaseUrl', () => {
  it('falls back to the local API when nothing is configured', () => {
    expect(resolveApiBaseUrl(undefined)).toBe('http://localhost:3000');
    expect(resolveApiBaseUrl('')).toBe('http://localhost:3000');
  });

  it('keeps an absolute URL as it is', () => {
    expect(resolveApiBaseUrl('https://api.zelohealth.app')).toBe('https://api.zelohealth.app');
    expect(resolveApiBaseUrl('http://localhost:3000')).toBe('http://localhost:3000');
  });

  // Um valor sem esquema não é URL absoluta: `${base}/manager/login` vira
  // caminho relativo e o navegador resolve contra a própria página, então a
  // chamada bate no site estático e volta 405. Custou um deploy inteiro em
  // produção para ser diagnosticado, porque nada falhava até o usuário tentar
  // entrar.
  it('rejects a host without a scheme, which would silently become a relative path', () => {
    expect(() => resolveApiBaseUrl('api.zelohealth.app')).toThrow(/esquema/i);
    expect(() => resolveApiBaseUrl('//api.zelohealth.app')).toThrow(/esquema/i);
  });

  // O valor chegou uma vez com BOM na frente, gravado por um pipe do
  // PowerShell. `﻿https://...` também não é URL absoluta.
  it('survives a value stored with surrounding whitespace or a BOM', () => {
    expect(resolveApiBaseUrl('﻿https://api.zelohealth.app')).toBe('https://api.zelohealth.app');
    expect(resolveApiBaseUrl('  https://api.zelohealth.app  ')).toBe('https://api.zelohealth.app');
  });

  it('drops a trailing slash so paths do not end up doubled', () => {
    expect(resolveApiBaseUrl('https://api.zelohealth.app/')).toBe('https://api.zelohealth.app');
  });
});
