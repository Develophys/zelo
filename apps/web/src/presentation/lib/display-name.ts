export function displayName(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
