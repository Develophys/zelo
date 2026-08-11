// Plantão noturno, pronto-socorro, UTI: staff check in at every hour, not just 9-to-5 —
// the greeting should meet them at the hour they're actually in, not default to "Olá."
export function getGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Bom dia.';
  if (hour >= 12 && hour < 18) return 'Boa tarde.';
  return 'Boa noite.';
}
