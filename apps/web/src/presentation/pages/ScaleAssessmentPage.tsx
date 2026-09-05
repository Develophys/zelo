import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { CrisisCallLink } from '@/presentation/components/CrisisCallLink';
import { getCrisisLine } from '@/presentation/lib/crisis-line';
import { PHQ9_RISK_ITEM_INDEX } from '@/domain/assessment-scales/phq9';
import { BackButton } from '@/presentation/ui/BackButton';
import { Button } from '@/presentation/ui/Button';
import { ProgressBar } from '@/presentation/ui/ProgressBar';
import { WaveText } from '@/presentation/ui/WaveText';
import { QuestionCard } from '@/presentation/components/QuestionCard';
import { AssessmentReview } from '@/presentation/components/AssessmentReview';
import type { AssessmentScale } from '@/domain/assessment-scales/scales';
import { useSubmitAssessment } from '@/presentation/hooks/useSubmitAssessment';
import { routes } from '@/presentation/lib/routes';
import { clearDraft, recallDraft, rememberDraft } from '@/presentation/lib/assessment-draft';

interface ScaleAssessmentPageProps {
  scale: AssessmentScale;
}

export function ScaleAssessmentPage({ scale }: ScaleAssessmentPageProps) {
  const navigate = useNavigate();
  const { mutateAsync, isPending } = useSubmitAssessment();
  const resumed = useRef(recallDraft(scale));
  const [answers, setAnswers] = useState<(number | undefined)[]>(
    () => resumed.current?.answers ?? new Array(scale.questions.length).fill(undefined),
  );
  // One cursor for the whole instrument: 0..total-1 are questions, `total` is
  // the review. Answering the last item advances here rather than submitting.
  const [questionIndex, setQuestionIndex] = useState(() => resumed.current?.questionIndex ?? 0);
  const [submitError, setSubmitError] = useState(false);
  const [showResumed, setShowResumed] = useState(() => (resumed.current?.questionIndex ?? 0) > 0);

  const total = scale.questions.length;

  useEffect(() => {
    rememberDraft({ scaleType: scale.type, answers, questionIndex });
  }, [scale.type, answers, questionIndex]);

  const isReview = questionIndex === total;
  const question = scale.questions[questionIndex];

  const recordAnswer = (value: number) => {
    setSubmitError(false);
    setShowResumed(false);
    setAnswers((current) => {
      const next = [...current];
      next[questionIndex] = value;
      return next;
    });
  };

  const commitAnswer = (value: number) => {
    recordAnswer(value);
    setQuestionIndex((index) => index + 1);
  };

  const handleSubmit = async () => {
    if (isPending || !answers.every((n) => typeof n === 'number')) {
      return;
    }
    setSubmitError(false);

    try {
      const result = await mutateAsync({ scaleType: scale.type, answers });
      clearDraft();
      navigate(routes.result, {
        state: {
          scaleType: scale.type,
          totalScore: result.totalScore,
          max: scale.maxScore,
          riskSignal: result.riskSignal,
          // The use case has always reported this; nothing ever read it, so an
          // upload that failed looked exactly like one that worked.
          pendingSync: !result.submissionSucceeded,
        },
      });
    } catch {
      setSubmitError(true);
    }
  };

  // Shown on the self-harm item regardless of the answer. Gating it on a
  // non-zero response would turn the line's arrival into a verdict on what was
  // just selected, on the one screen where honesty matters most.
  const isRiskItem = !isReview && scale.type === 'PHQ-9' && questionIndex === PHQ9_RISK_ITEM_INDEX;
  const crisisLine = getCrisisLine();

  return (
    <PhoneShell bottomNav centered>
      <div className="md:pt-4">
        <div className="flex items-center gap-3">
          <BackButton
            testId="question-back"
            onClick={() => setQuestionIndex((index) => Math.max(0, index - 1))}
            disabled={questionIndex === 0 || isPending}
            className="-ml-2 flex-none"
          />
          <div className="flex-1">
            <ProgressBar
              value={Math.round((Math.min(questionIndex + 1, total) / total) * 100)}
              label={
                isReview
                  ? 'Progresso da avaliação: revisão das respostas'
                  : `Progresso da avaliação: pergunta ${questionIndex + 1} de ${total}`
              }
            />
          </div>
          <span className="font-mono text-mono-data text-muted">
            {Math.min(questionIndex + 1, total)}/{total}
          </span>
        </div>

        {showResumed && (
          <p
            data-testid="assessment-resumed"
            className="mt-4 rounded-card border border-line bg-canvas-alt p-3 text-pretty text-caption text-ink-2"
          >
            Suas respostas anteriores continuam aqui. Retomamos de onde você parou.
          </p>
        )}

        {!isReview && <p className="mt-6.5 text-caption text-muted">{scale.prompt}</p>}

        <p role="status" className="sr-only">
          {isReview
            ? 'Revisão: confira suas respostas antes de enviar.'
            : `Pergunta ${questionIndex + 1} de ${total}: ${question}`}
        </p>

        <div aria-busy={isPending}>
          {isReview ? (
            <div className="mt-6.5">
              <AssessmentReview
                scale={scale}
                answers={answers}
                onEdit={setQuestionIndex}
                disabled={isPending}
              />
              <div className="mt-8">
                <Button variant="primary" onClick={handleSubmit} disabled={isPending}>
                  Enviar respostas
                </Button>
              </div>
            </div>
          ) : (
            <QuestionCard
              question={question!}
              options={scale.options}
              selected={answers[questionIndex]}
              onSelect={recordAnswer}
              onCommit={commitAnswer}
              advanceLabel={questionIndex === total - 1 ? 'Revisar respostas' : 'Próxima'}
              disabled={isPending}
            />
          )}
          {isRiskItem && (
            <div className="mt-5 rounded-card border border-line bg-surface p-4">
              <p className="text-pretty text-label text-ink-2">
                Se precisar falar com alguém agora, a linha está aqui — a qualquer hora,
                em qualquer resposta.
              </p>
              <CrisisCallLink line={crisisLine} className="mt-2 text-brand" />
            </div>
          )}
          {isPending && (
            <p className="mt-4 text-center text-caption text-muted">
              <WaveText text="Enviando…" />
            </p>
          )}
        </div>

        {submitError && (
          <div className="mt-4">
            <p role="alert" className="text-caption text-danger">
              Não foi possível enviar suas respostas. Elas continuam salvas aqui.
            </p>
            <div className="mt-3">
              <Button variant="outline" onClick={handleSubmit} disabled={isPending}>
                Tentar novamente
              </Button>
            </div>
          </div>
        )}
      </div>
    </PhoneShell>
  );
}
