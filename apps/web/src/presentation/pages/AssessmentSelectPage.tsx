import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { CardButton } from '@/presentation/ui/CardButton';
import { routes } from '@/presentation/lib/routes';
import { GAD7_SCALE, PHQ9_SCALE } from '@/domain/assessment-scales/scales';

// A range, not a point estimate: a flat per-question rate can't account for
// the self-harm item reading slower than the rest, so a single rounded
// number risks feeling broken exactly when it matters most.
const SECONDS_PER_QUESTION_LOW = 15;
const SECONDS_PER_QUESTION_HIGH = 30;

function estimate(questionCount: number): string {
  const low = Math.max(1, Math.floor((questionCount * SECONDS_PER_QUESTION_LOW) / 60));
  const high = Math.max(low + 1, Math.ceil((questionCount * SECONDS_PER_QUESTION_HIGH) / 60));
  return `${questionCount} perguntas · ${low}–${high} minutos`;
}

export function AssessmentSelectPage() {
  const navigate = useNavigate();

  return (
    <PhoneShell sidebar bottomNav centered>
      <div className="md:pt-4">
        <p className="text-pretty text-body text-ink-2">Escolha uma escala validada.</p>
        <div className="mt-5 flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-4">
          <CardButton
            onClick={() => navigate(routes.phq9)}
            className="flex items-center justify-between md:flex-col md:items-start md:gap-6 md:p-6"
          >
            <div>
              <p className="text-body font-extrabold text-ink">PHQ-9</p>
              <p className="text-caption text-muted">{PHQ9_SCALE.description}</p>
              <p className="mt-1 font-mono text-mono-data text-muted-2">
                {estimate(PHQ9_SCALE.questions.length)}
              </p>
            </div>
            <ArrowRight size={18} className="flex-none text-brand md:self-end" aria-hidden="true" />
          </CardButton>

          <CardButton
            onClick={() => navigate(routes.gad7)}
            className="flex items-center justify-between md:flex-col md:items-start md:gap-6 md:p-6"
          >
            <div>
              <p className="text-body font-extrabold text-ink">GAD-7</p>
              <p className="text-caption text-muted">{GAD7_SCALE.description}</p>
              <p className="mt-1 font-mono text-mono-data text-muted-2">
                {estimate(GAD7_SCALE.questions.length)}
              </p>
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
