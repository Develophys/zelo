interface SessionCache {
  clear: () => void;
  reset: () => void;
}

const NOOP_CACHE: SessionCache = { clear: () => {}, reset: () => {} };
let registered: SessionCache = NOOP_CACHE;

export function registerSessionCache(cache: SessionCache): void {
  registered = cache;
}

export function clearSessionCache(): void {
  registered.clear();
}

export function resetSessionCache(): void {
  registered.reset();
}
