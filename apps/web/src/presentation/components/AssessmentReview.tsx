import { Pencil } from 'lucide-react';
import type { AssessmentScale } from '@/domain/assessment-scales/scales';

interface AssessmentReviewProps {
  scale: AssessmentScale;
  answers: (number | undefined)[];
  onEdit: (questionIndex: number) => void;
  disabled?: boolean;
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
}: AssessmentReviewProps) {
  return (
    <div>
      <h2 className="mb-1 font-serif text-h2 text-ink">Confira suas respostas</h2>
      <p className="mb-6 text-caption text-muted">
        Toque em qualquer resposta para mudá-la. Nada foi enviado ainda.
      </p>

      <ul className="flex flex-col gap-2">
        {scale.questions.map((question, index) => {
          const answer = scale.options.find((option) => option.value === answers[index]);

          return (
            <li key={question}>
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
                  <span className="block truncate text-caption text-muted">{question}</span>
                  <span className="block text-label font-semibold text-ink">
                    {answer?.label ?? '—'}
                  </span>
                </span>
                <Pencil size={16} aria-hidden="true" className="flex-none text-brand" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
