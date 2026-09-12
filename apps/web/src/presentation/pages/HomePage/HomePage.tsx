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
  // The institution ask is administrative housekeeping — it must never share
  // a view with a distress signal, not just sit below it in scroll order
  // (see the ordering comment below, which only solved half of this). Two
  // signals count: the pulse-check "não" (tied to showAcknowledgment, not
  // the whole answered cycle, so it lifts on the same schedule the
  // acknowledgment itself does) and a recent high/severe PHQ-9/GAD-7 result
  // — the app's authoritative distress signal per PRODUCT.md, which the
  // pulse check alone never covered. Either way, a days-old disclosure no
  // longer holds the institution nudge back indefinitely.
  const justDisclosedDistress = (showAcknowledgment && answer === 'no') || recentSevereAssessment;

  return (
    <PhoneShell
      sidebar
      bottomNav
      centered
      headerOverride={{ title: getGreeting(new Date().getHours()) }}
    >
      {/* Ordered so a tired doctor can act before deciding. The check-in leads;
          a pending follow-up sits with it because it is the same question asked
          later. Then the two ways to reach a person — nobody in distress should
          have to scroll past a chart to find them. The chart only reports, so it
          drops below the actions, and the hospital-link prompt is last: it is
          housekeeping that serves the institution's aggregate, not the reason
          this person opened the app. */}
      <div className="flex flex-col">
        <CheckInHeroCard />
        <FollowUpCard className="mt-3.5 short:mt-2" />

        <div className="mt-3.5 short:mt-2 flex gap-3">
          <CardButton tone="accent" onClick={() => navigate(routes.chat)} className="flex-1">
            <IconBadge icon={MessageCircle} />
            <p className="mt-2 text-body font-extrabold text-ink">Conversar agora</p>
            {/* Named before the tap, not just on the chat screen's own
                disclaimer after it — PRODUCT.md treats AI-vs-human honesty
                as a hard principle, and this is the first screen it's
                relevant on. */}
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
