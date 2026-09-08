const LOCAL_FALLBACK = 'http://localhost:3000';

/**
 * Uma base sem esquema (`api.zelohealth.app`) não é URL absoluta: o template
 * `${base}/manager/login` vira caminho relativo, o navegador resolve contra a
 * página atual e a chamada bate no próprio site estático. Nada quebra no
 * build, nada quebra no carregamento — só o login, com um 405 que não aponta
 * para a causa. Por isso aqui é erro, e não um aviso.
 *
 * A mesma regra roda em build time no vite.config.ts, para o deploy quebrar
 * antes de ir ao ar em vez de quebrar no aparelho do usuário.
 */
export function resolveApiBaseUrl(raw: string | undefined): string {
  // trim() também remove o BOM (U+FEFF é WhiteSpace na spec), que é como um
  // pipe de shell consegue contaminar o valor sem deixar rastro visível.
  const value = raw?.trim();
  if (!value) return LOCAL_FALLBACK;

  if (!/^https?:\/\//i.test(value)) {
    throw new Error(
      `VITE_API_BASE_URL precisa começar com http:// ou https://. Recebido: "${value}". ` +
        'Sem esquema o valor vira caminho relativo e as chamadas de API batem no próprio site.',
    );
  }

  return value.replace(/\/+$/, '');
}

export const API_BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
