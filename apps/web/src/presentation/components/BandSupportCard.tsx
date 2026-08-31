import { Button } from '@/presentation/ui/Button';
import { Card } from '@/presentation/ui/Card';
import { CrisisCallLink } from '@/presentation/components/CrisisCallLink';
import { getCrisisLine } from '@/presentation/lib/crisis-line';

interface BandSupportCardProps {
  onTalk: () => void;
}

/**
 * Shown for a high or severe band when there is no item-9 signal.
 *
 * `riskSignal` is PHQ-9 item 9 only, by design — it is the acute-risk
 * escalation and never crosses the network. But gating every offer of help on
 * it meant a doctor scoring 24/27 who did not tick that item saw the same
 * screen as one scoring 3/27: a number and a link to the AI chat.
 *
 * Deliberately calm rather than danger-toned. Nothing here indicates acute
 * risk, and dressing a severe score as an emergency would be its own harm.
 * RiskSignalCallout stays reserved for the signal it was calibrated for.
 */
export function BandSupportCard({ onTalk }: BandSupportCardProps) {
  const line = getCrisisLine();

  return (
    <Card tone="brand-tint" data-testid="band-support">
      <p className="text-body font-extrabold text-ink">Você não precisa resolver isso sozinho(a).</p>
      <p className="mt-1 text-pretty text-caption text-muted">
        Um resultado assim costuma pedir mais do que um app. Falar com alguém é um bom próximo
        passo — hoje, se der.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <Button variant="primary" onClick={onTalk}>
          Falar com alguém agora
        </Button>
        <CrisisCallLink line={line} className="w-full justify-center text-brand" />
      </div>
    </Card>
  );
}
