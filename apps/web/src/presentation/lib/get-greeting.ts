// Plantão noturno, pronto-socorro, UTI: staff check in at every hour, not just 9-to-5 —
// the greeting should meet them at the hour they're actually in, not default to "Olá."
export function getGreeting(hour: number): string {
  // The small hours get their own greeting rather than being folded into the
  // evening: someone opening this at 04:30 is mid-shift, not having a late
  // night, and "Boa noite." reads as if the app has not noticed.
  if (hour >= 0 && hour < 5) return 'Boa madrugada.';
  if (hour >= 5 && hour < 12) return 'Bom dia.';
  if (hour >= 12 && hour < 18) return 'Boa tarde.';
  return 'Boa noite.';
}
