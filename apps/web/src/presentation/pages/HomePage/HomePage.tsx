import { MessageCircle, Users } from 'lucide-react';
import { useNavigate } from 'react-router';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { BottomNav } from '@/presentation/layout/BottomNav';
import { NAV_TABS, type NavTabId } from '@/presentation/layout/nav-tabs';
import { CardButton } from '@/presentation/ui/CardButton';
import { IconBadge } from '@/presentation/ui/IconBadge';
import { routes } from '@/presentation/lib/routes';
import { InstitutionLinkCard } from '@/presentation/components/InstitutionLinkCard';
import { CheckInHeroCard } from './CheckInHeroCard';
import { FollowUpCard } from './FollowUpCard';
import { HistoryChartCard } from './HistoryChartCard';
import { HomeGreeting } from './HomeGreeting';

export function HomePage() {
  const navigate = useNavigate();

  const handleNavigate = (tab: NavTabId) => {
    const target = NAV_TABS.find((t) => t.id === tab);
    if (target) navigate(target.route);
  };

  return (
    <PhoneShell nav centered footer={<BottomNav active="home" onNavigate={handleNavigate} />}>
      <div className="flex flex-col pt-6">
        <HomeGreeting />
        <FollowUpCard className="mt-4" />
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
