import { useState } from 'react';
import { useNavigate } from 'react-router';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { ProgressBar } from '@/presentation/ui/ProgressBar';
import { WaveText } from '@/presentation/ui/WaveText';
import { QuestionCard } from '@/presentation/components/QuestionCard';
import type { AssessmentScale } from '@/domain/assessment-scales/scales';
import { useSubmitAssessment } from '@/presentation/hooks/useSubmitAssessment';
import { routes } from '@/presentation/lib/routes';

interface ScaleAssessmentPageProps {
  scale: AssessmentScale;
}

export function ScaleAssessmentPage({ scale }: ScaleAssessmentPageProps) {
  const navigate = useNavigate();
  const { mutateAsync, isPending } = useSubmitAssessment();
  const [answers, setAnswers] = useState<(number | undefined)[]>(() =>
    new Array(scale.questions.length).fill(undefined),
  );
  const [questionIndex, setQuestionIndex] = useState(0);
  const [submitError, setSubmitError] = useState(false);

  const total = scale.questions.length;
  const isLast = questionIndex === total - 1;
  const question = scale.questions[questionIndex]!;

  const handleSelect = async (value: number) => {
    setSubmitError(false);
    const nextAnswers = [...answers];
    nextAnswers[questionIndex] = value;
    setAnswers(nextAnswers);

    if (!isLast) {
      setQuestionIndex((index) => index + 1);
      return;
    }

    try {
      if (nextAnswers.every((n) => typeof n === 'number')) {
        const result = await mutateAsync({ scaleType: scale.type, answers: nextAnswers });
        navigate(routes.result, {
          state: {
            scaleType: scale.type,
            totalScore: result.totalScore,
            max: scale.maxScore,
            riskSignal: result.riskSignal,
          },
        });
      }
    } catch {
      setSubmitError(true);
    }
  };

  return (
    <PhoneShell centered>
      <div className="md:pt-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <ProgressBar
              value={Math.round(((questionIndex + 1) / total) * 100)}
              label={`Progresso da avaliação: pergunta ${questionIndex + 1} de ${total}`}
            />
          </div>
          <span className="font-mono text-mono-data text-muted">
            {questionIndex + 1}/{total}
          </span>
        </div>

        <p className="mt-6.5 text-caption text-muted">{scale.prompt}</p>

        <p role="status" className="sr-only">
          Pergunta {questionIndex + 1} de {total}: {question}
        </p>

        <div aria-busy={isPending}>
          <QuestionCard
            question={question}
            options={scale.options}
            selected={answers[questionIndex]}
            onSelect={handleSelect}
            disabled={isPending}
          />
          {isPending && (
            <p className="mt-4 text-center text-caption text-muted">
              <WaveText text="Enviando…" />
            </p>
          )}
        </div>

        {submitError && (
          <p role="alert" className="mt-4 text-caption text-danger">
            Não foi possível enviar. Selecione uma opção para tentar novamente.
          </p>
        )}
      </div>
    </PhoneShell>
  );
}
