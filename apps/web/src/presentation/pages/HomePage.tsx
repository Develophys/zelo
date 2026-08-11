import { MessageCircle, Users } from 'lucide-react';
import { useNavigate } from 'react-router';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { BottomNav } from '@/presentation/layout/BottomNav';
import { NAV_TABS, type NavTabId } from '@/presentation/layout/nav-tabs';
import { Card } from '@/presentation/ui/Card';
import { CardButton } from '@/presentation/ui/CardButton';
import { Button } from '@/presentation/ui/Button';
import { IconBadge } from '@/presentation/ui/IconBadge';
import { PrivacyBadge } from '@/presentation/ui/PrivacyBadge';
import { routes } from '@/presentation/lib/routes';
import { useAssessmentHistory } from '@/presentation/hooks/useAssessmentHistory';
import { ShouldShowFollowUpPromptUseCase } from '@/use-cases/should-show-followup-prompt.usecase';
import { useFollowUpStore } from '@/stores/followup.store';
import { useInstitutionLinkStore } from '@/stores/institution-link.store';
import {
  describeHistoryWeek,
  findPeakIndex,
  mostRecentAssessmentDate,
  toBarHeights,
} from '@/presentation/lib/weekly-history-chart';
import { EMPTY_POINTS } from '@/presentation/lib/home.constants';
import { getGreeting } from '@/presentation/lib/get-greeting';

const shouldShowFollowUpPromptUseCase = new ShouldShowFollowUpPromptUseCase();

export function HomePage() {
  const navigate = useNavigate();
  const { data: history } = useAssessmentHistory();
  const points = history ?? EMPTY_POINTS;
  const bars = toBarHeights(points);
  const latestIndex = points.length - 1;
  const peakIndex = findPeakIndex(points);

  const answer = useFollowUpStore((state) => state.answer);
  const recordAnswer = useFollowUpStore((state) => state.recordAnswer);
  const showFollowUpPrompt = shouldShowFollowUpPromptUseCase.execute({
    mostRecentAssessmentAt: mostRecentAssessmentDate(points),
    alreadyAnswered: answer !== null,
    now: new Date(),
  });

  const institutionId = useInstitutionLinkStore((state) => state.institutionId);

  const handleNavigate = (tab: NavTabId) => {
    const target = NAV_TABS.find((t) => t.id === tab);
    if (target) navigate(target.route);
  };

  return (
    <PhoneShell nav centered footer={<BottomNav active="home" onNavigate={handleNavigate} />}>
      <div className="flex flex-col pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-caption text-muted">Bom te ver por aqui</p>
            <h1 className="text-h1 text-ink">{getGreeting(new Date().getHours())}</h1>
          </div>
          <PrivacyBadge />
        </div>

        {showFollowUpPrompt && (
          <div className="mt-4">
            <Card>
              <p className="text-body font-extrabold text-ink">Como você está, um tempo depois?</p>
              <div className="mt-3 flex gap-3">
                <Button
                  className="p-2!"
                  variant="outline"
                  full={false}
                  onClick={() => recordAnswer('yes')}
                >
                  Estou bem
                </Button>
                <Button
                  className="p-2!"
                  variant="outline"
                  full={false}
                  onClick={() => recordAnswer('no')}
                >
                  Não estou bem
                </Button>
              </div>
            </Card>
          </div>
        )}

        {institutionId === null && (
          <div className="mt-4">
            <Card tone="brand-tint">
              <p className="text-body font-extrabold text-ink">Ainda não vinculado a um hospital</p>
              <p className="mt-1 text-caption text-muted">
                Vincule para aparecer nos números do seu time, de forma anônima.
              </p>
              <div className="mt-3">
                <Button
                  variant="outline"
                  full={false}
                  onClick={() => navigate(routes.linkInstitution)}
                >
                  Vincular agora
                </Button>
              </div>
            </Card>
          </div>
        )}

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

        <div className="mt-3.5">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
              <p className="text-body font-extrabold text-ink">Seu histórico</p>
              <p className="font-mono text-mono-data text-muted-2">últimas 6 semanas</p>
            </div>
            <ul className="sr-only">
              {points.map((point, index) => (
                <li key={index}>{describeHistoryWeek(point, index, latestIndex, peakIndex)}</li>
              ))}
            </ul>
            <div className="mt-3 flex h-14 items-end gap-2" aria-hidden="true">
              {bars.map((bar, index) => (
                <div
                  key={index}
                  data-testid="history-bar"
                  className={`w-full rounded-md ${
                    !bar.hasData
                      ? 'bg-line'
                      : index === latestIndex
                        ? 'bg-brand'
                        : index === peakIndex
                          ? 'bg-warn'
                          : 'bg-track'
                  }`}
                  style={{ height: `${bar.height}%` }}
                />
              ))}
            </div>
            <div className="mt-2 flex gap-3" aria-hidden="true">
              <span className="flex items-center gap-1 font-mono text-mono-data text-muted-2">
                <span className="h-2 w-2 rounded-full bg-brand" />
                Mais recente
              </span>
              <span className="flex items-center gap-1 font-mono text-mono-data text-muted-2">
                <span className="h-2 w-2 rounded-full bg-warn" />
                Pico
              </span>
            </div>
          </Card>
        </div>

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

        <Button
          variant="ghost"
          full={false}
          onClick={() => navigate(routes.manager)}
          className="w-fit mt-4 text-left text-label! underline"
        >
          Ver painel do gestor
        </Button>
      </div>
    </PhoneShell>
  );
}
