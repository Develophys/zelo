import { useNavigate } from 'react-router';
import { Button } from '@/presentation/ui/Button';
import { Card } from '@/presentation/ui/Card';
import { routes } from '@/presentation/lib/routes';

export function CheckInHeroCard() {
  const navigate = useNavigate();

  return (
    <div>
      <Card size="lg" tone="brand" className="flex flex-col">
        <h2 className="text-h2">Como você está hoje?</h2>
        <p className="mt-1 text-label text-on-fill-2">Um check-in de 5 minutos, só para você.</p>
        <Button
          variant="inverse"
          className="focus-visible:ring-on-fill focus-visible:ring-offset-2 focus-visible:ring-offset-brand-fill"
          onClick={() => navigate(routes.assessment)}
        >
          Fazer check-in
        </Button>
      </Card>
    </div>
  );
}
