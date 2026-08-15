import { Button } from '@/presentation/ui/Button';

interface RiskSignalCalloutProps {
  onConnect: () => void;
}

export function RiskSignalCallout({ onConnect }: RiskSignalCalloutProps) {
  return (
    <div className="rounded-2xl border border-danger-border bg-danger-bg p-4.5">
      <p className="text-body font-extrabold text-danger">Notamos um sinal importante.</p>
      <p className="mt-1 text-caption text-danger-ink">
        Você não está sozinho(a). Podemos te conectar com alguém agora.
      </p>
      <Button variant="danger" onClick={onConnect} className="mt-4">
        Falar com alguém agora
      </Button>
    </div>
  );
}
