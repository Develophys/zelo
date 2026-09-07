import { Card } from '@/presentation/ui/Card';
import { Checkbox } from '@/presentation/ui/Checkbox';
import { useConsentStore } from '@/stores/consent.store';

export function AggregateOptInSection() {
  const aggregateOptIn = useConsentStore((state) => state.aggregateOptIn);
  const setAggregateOptIn = useConsentStore((state) => state.setAggregateOptIn);

  return (
    <Card size="md" className="mt-3.5">
      <label className="flex items-start gap-3">
        <p className="flex-1 text-label text-ink-2">
          Autorizo o uso <strong>anônimo e agregado</strong> dos meus sinais para melhorar o
          cuidado da equipe.
        </p>
        <Checkbox
          checked={aggregateOptIn}
          onChange={(event) => setAggregateOptIn(event.target.checked)}
        />
      </label>
    </Card>
  );
}
