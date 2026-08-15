import { useNavigate } from 'react-router';
import { Button } from '@/presentation/ui/Button';
import { Card } from '@/presentation/ui/Card';
import { routes } from '@/presentation/lib/routes';

export function CheckInHeroCard() {
  const navigate = useNavigate();

  return (
    <div className="mt-5">
      <Card size="lg" tone="brand" className="flex flex-col">
        <h2 className="text-h2">Como você está hoje?</h2>
        <p className="mt-1 text-label opacity-85">Um check-in de 5 minutos, só para você.</p>
        <Button
          className="bg-white font-bold! text-brand! focus-visible:ring-white"
          variant="outline"
          onClick={() => navigate(routes.assessment)}
        >
          Fazer check-in
        </Button>
      </Card>
    </div>
  );
}
