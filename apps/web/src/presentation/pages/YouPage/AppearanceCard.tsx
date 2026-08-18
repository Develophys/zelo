import { MoonStar } from 'lucide-react';
import { Card } from '@/presentation/ui/Card';
import { IconBadge } from '@/presentation/ui/IconBadge';
import { ThemeToggle } from '@/presentation/ui/ThemeToggle';

export function AppearanceCard() {
  return (
    <Card size="md" className="mt-3.5">
      <div className="flex items-center gap-3">
        <IconBadge icon={MoonStar} tone="brand" />
        <div className="min-w-0">
          <p className="text-body font-extrabold text-ink">Aparência</p>
          <p className="text-caption text-muted">O tema escuro pesa menos nos olhos de madrugada.</p>
        </div>
      </div>
      <ThemeToggle />
    </Card>
  );
}
