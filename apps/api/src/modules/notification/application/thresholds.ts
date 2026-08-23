// The single point per-institution settings will later replace — see
// docs/superpowers/specs/2026-08-23-institution-settings-design.md. Nothing
// else in the codebase may hardcode these numbers.

/** A sector's weekly concerning rate at or above this fires a level alert. */
export const RISK_RATE_THRESHOLD = 0.4;

/**
 * Deliberately above the k-anonymity floor of 5. At n=5 a single person moves
 * the rate by 20 points (2/5 is 40%, 3/5 is 60%), so a rate threshold applied
 * there fires and un-fires on noise. A denominator above the visibility floor
 * is what makes the number a signal rather than a coin flip.
 */
export const RISK_MIN_CHECK_INS = 10;

/** A week-over-week rise of this many points fires a delta alert. */
export const RISK_DELTA_THRESHOLD = 0.15;

/** Read notifications older than this are purged. Unread ones never are. */
export const RETENTION_DAYS = 90;
