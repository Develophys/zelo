import { MessageCircle, Users } from 'lucide-react';
import { useNavigate } from 'react-router';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { CardButton } from '@/presentation/ui/CardButton';
import { IconBadge } from '@/presentation/ui/IconBadge';
import { routes } from '@/presentation/lib/routes';
import { getGreeting } from '@/presentation/lib/get-greeting';
import { InstitutionLinkCard } from '@/presentation/components/InstitutionLinkCard';
import { useFollowUpAnswer } from '@/presentation/hooks/useFollowUpAnswer';
import { CheckInHeroCard } from './CheckInHeroCard';
import { FollowUpCard } from './FollowUpCard';
import { HistoryChartCard } from './HistoryChartCard';

export function HomePage() {
  const navigate = useNavigate();
  const { answer, showAcknowledgment, recentSevereAssessment } = useFollowUpAnswer();
  // Institution ask must never share a view with a distress signal, whether that's a "não" pulse-check or a severe assessment.
  const justDisclosedDistress = (showAcknowledgment && answer === 'no') || recentSevereAssessment;

  return (
    <PhoneShell
      sidebar
      bottomNav
      centered
      headerOverride={{ title: getGreeting(new Date().getHours()) }}
    >
      {/* Ordered by urgency: check-in, follow-up, ways to reach a person, then the reporting chart, then institution housekeeping last. */}
      <div className="flex flex-col">
        <CheckInHeroCard />
        <FollowUpCard className="mt-3.5 short:mt-2" />

        <div className="mt-3.5 short:mt-2 flex gap-3">
          <CardButton tone="accent" onClick={() => navigate(routes.chat)} className="flex-1">
            <IconBadge icon={MessageCircle} />
            <p className="mt-2 text-body font-extrabold text-ink">Conversar agora</p>
            {/* Disclosed before the tap, not just after — PRODUCT.md's AI-vs-human honesty principle. */}
            <p className="mt-0.5 text-caption text-muted">Acolhimento por IA</p>
          </CardButton>
          <CardButton tone="accent" onClick={() => navigate(routes.peers)} className="flex-1">
            <IconBadge icon={Users} />
            <p className="mt-2 text-body font-extrabold text-ink">Falar com um par</p>
            <p className="mt-0.5 text-caption text-muted">Colega anônimo</p>
          </CardButton>
        </div>

        <HistoryChartCard />
        <InstitutionLinkCard
          className="mt-3.5 short:mt-2"
          suppressNudge={justDisclosedDistress}
        />
      </div>
    </PhoneShell>
  );
}
