import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { CardButton } from '@/presentation/ui/CardButton';
import { routes } from '@/presentation/lib/routes';

export function AssessmentSelectPage() {
  const navigate = useNavigate();

  return (
    <PhoneShell sidebar bottomNav centered>
      <div className="md:pt-4">
        <p className="text-pretty text-body text-ink-2">
          Escolha uma escala validada. Leva cerca de 5 minutos.
        </p>
        <div className="mt-5 flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-4">
          <CardButton
            onClick={() => navigate(routes.phq9)}
            className="flex items-center justify-between md:flex-col md:items-start md:gap-6 md:p-6"
          >
            <div>
              <p className="text-body font-extrabold text-ink">PHQ-9</p>
              <p className="text-caption text-muted">Humor e sinais de depressão</p>
            </div>
            <ArrowRight size={18} className="flex-none text-brand md:self-end" aria-hidden="true" />
          </CardButton>

          <CardButton
            onClick={() => navigate(routes.gad7)}
            className="flex items-center justify-between md:flex-col md:items-start md:gap-6 md:p-6"
          >
            <div>
              <p className="text-body font-extrabold text-ink">GAD-7</p>
              <p className="text-caption text-muted">Ansiedade</p>
            </div>
            <ArrowRight size={18} className="flex-none text-brand md:self-end" aria-hidden="true" />
          </CardButton>

          {/* Recessed with muted tokens rather than opacity: opacity composites
              the whole subtree, which drops this card's text to ~2.5:1 and is
              invisible to any token-level contrast test. */}
          <div className="flex items-center justify-between rounded-card bg-canvas-alt p-4.5 md:col-span-2 md:p-6">
            <div>
              <p className="text-body font-extrabold text-muted">MBI-HSS</p>
              <p className="text-caption text-muted">Burnout ocupacional</p>
            </div>
            <span className="rounded-status bg-line px-3 py-1 font-mono text-eyebrow text-ink-2">
              em breve
            </span>
          </div>
        </div>
      </div>
    </PhoneShell>
  );
}
