import { Pencil } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { AssessmentScale } from '@/domain/assessment-scales/scales';
import { CrisisCallLink } from '@/presentation/components/CrisisCallLink';
import { getCrisisLine } from '@/presentation/lib/crisis-line';

interface AssessmentReviewProps {
  scale: AssessmentScale;
  answers: (number | undefined)[];
  onEdit: (questionIndex: number) => void;
  disabled?: boolean;
  riskItemIndex?: number;
  // False only when review is the page's very first view (a resumed draft
  // landing straight here), matching QuestionCard's own arrival convention.
  focusOnMount?: boolean;
}

/**
 * The instrument assumes a respondent can review and revise before scoring, and
 * the last PHQ-9 item is the suicidality one — so the final tap records an
 * answer and lands here instead of firing the submission.
 */
export function AssessmentReview({
  scale,
  answers,
  onEdit,
  disabled = false,
  riskItemIndex,
  focusOnMount = true,
}: AssessmentReviewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const crisisLine = getCrisisLine();

  // Mount-only: this component is remounted fresh every time review is
  // (re)entered, so there's no later render of this same instance to react to.
  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, []);

  return (
    <div>
      <h2 ref={headingRef} tabIndex={-1} className="mb-1 font-serif text-h2 text-ink">
        Confira suas respostas
      </h2>
      <p className="mb-6 text-pretty text-caption text-muted">
        Toque em qualquer resposta para mudá-la. Nada foi enviado ainda. Não tem pressa — revise
        no seu tempo.
      </p>

      <ul className="flex flex-col gap-2">
        {scale.questions.map((question, index) => {
          const answer = scale.options.find((option) => option.value === answers[index]);
          const total = scale.questions.length;

          // A group of exactly 1 left dangling by the fixed group size reads
          // worse than a slightly bigger (but still ≤4) previous group.
          const startsNewGroup = index > 0 && index % 3 === 0 && total - index > 1;

          return (
            <li key={question} className={startsNewGroup ? 'mt-1 border-t border-line pt-3' : undefined}>
              <button
                type="button"
                data-testid={`review-edit-${index}`}
                onClick={() => onEdit(index)}
                disabled={disabled}
                aria-label={`Mudar a resposta da pergunta ${index + 1}: ${question}`}
                className="flex w-full min-h-11 cursor-pointer items-center gap-3 rounded-control border border-line bg-surface px-4 py-3 text-left duration-200 ease-out enabled:hover:border-track enabled:hover:shadow-card disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span className="flex-none font-mono text-mono-data text-muted">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block line-clamp-2 text-caption text-muted">{question}</span>
                  <span className="block text-label font-semibold text-ink">
                    {answer?.label ?? '—'}
                  </span>
                </span>
                <Pencil size={16} aria-hidden="true" className="flex-none text-brand" />
              </button>
              {index === riskItemIndex && (
                <div className="mt-2 rounded-card border border-line bg-surface p-3">
                  <p className="text-pretty text-label text-ink-2">
                    Se precisar falar com alguém agora, a linha está aqui.
                  </p>
                  <CrisisCallLink line={crisisLine} className="mt-1 text-brand" />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
