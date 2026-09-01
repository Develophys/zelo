import { isResultState, type ResultLocationState } from './is-result-state';

const KEY = 'zelo.last-result';

/**
 * Remembers the current result for the length of the browser session, so a
 * refresh, a share-sheet round trip, or a PWA that was backgrounded and
 * reopened does not lose it.
 *
 * `sessionStorage`, not `localStorage`, on purpose: a result from days ago
 * restored onto a screen that presents it as *the* result would be its own
 * small dishonesty. A session is roughly the sitting, which is the window where
 * "take me back to what I just saw" is the right answer.
 *
 * Stays on the device. `riskSignal` never crossing the network is a product
 * commitment about the network, and this is the same phone the record is
 * already encrypted onto.
 */
export function rememberResult(state: ResultLocationState): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private mode, a full quota, a blocked origin — recall is a convenience,
    // never a requirement. The caller falls back to the redirect.
  }
}

export function recallResult(): ResultLocationState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isResultState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
