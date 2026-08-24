/** Panel nouns (gestor, setor, par) all pluralise by appending "es". */
export function plural(singular: string): string {
  return `${singular}es`;
}
