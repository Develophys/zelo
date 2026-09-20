let clear: () => void = () => {};

export function registerSessionCacheClear(fn: () => void): void {
  clear = fn;
}

export function clearSessionCache(): void {
  clear();
}
