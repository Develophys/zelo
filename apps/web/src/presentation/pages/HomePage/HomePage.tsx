import { MessageCircle, Users } from 'lucide-react';
import { useNavigate } from 'react-router';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { CardButton } from '@/presentation/ui/CardButton';
import { IconBadge } from '@/presentation/ui/IconBadge';
import { routes } from '@/presentation/lib/routes';
import { getGreeting } from '@/presentation/lib/get-greeting';
import { InstitutionLinkCard } from '@/presentation/components/InstitutionLinkCard';
import { CheckInHeroCard } from './CheckInHeroCard';
import { FollowUpCard } from './FollowUpCard';
import { HistoryChartCard } from './HistoryChartCard';

export function HomePage() {
  const navigate = useNavigate();

  return (
    <PhoneShell
      sidebar
      bottomNav
      centered
      headerOverride={{ title: getGreeting(new Date().getHours()) }}
    >
      <div className="flex flex-col">
        <FollowUpCard />
        <InstitutionLinkCard className="mt-4" />
        <CheckInHeroCard />
        <HistoryChartCard />

        <div className="mt-3.5 flex gap-3">
          <CardButton onClick={() => navigate(routes.chat)} className="flex-1">
            <IconBadge icon={MessageCircle} />
            <p className="mt-2 text-body font-extrabold text-ink">Conversar agora</p>
          </CardButton>
          <CardButton onClick={() => navigate(routes.peers)} className="flex-1">
            <IconBadge icon={Users} />
            <p className="mt-2 text-body font-extrabold text-ink">Falar com um par</p>
          </CardButton>
        </div>
      </div>
    </PhoneShell>
  );
}
