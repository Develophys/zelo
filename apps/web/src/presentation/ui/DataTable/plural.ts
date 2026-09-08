/**
 * Panel nouns (gestor, setor, par) all pluralise by appending "es". A "-ção"
 * noun (instituição) doesn't fit that shape — it swaps the ending for "ções"
 * instead (instituição -> instituições), the regular pattern for the whole
 * word class (nação, ação, informação, ...), not a one-off exception.
 */
export function plural(singular: string): string {
  if (singular.endsWith('ção')) return `${singular.slice(0, -3)}ções`;
  return `${singular}es`;
}
