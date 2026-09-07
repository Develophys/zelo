const TERMINATOR = /[.!?…]/g;

export function boundaryIndices(text: string): number[] {
  const indices: number[] = [];
  TERMINATOR.lastIndex = 0;

  let match: RegExpExecArray | null = TERMINATOR.exec(text);
  while (match !== null) {
    const next = text[match.index + 1];
    if (next === undefined || /\s/.test(next)) {
      indices.push(match.index);
    }
    match = TERMINATOR.exec(text);
  }

  return indices;
}
