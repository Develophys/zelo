import { useState } from "react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { BackButton } from "@/presentation/ui/BackButton";
import { ProgressBar } from "@/presentation/ui/ProgressBar";
import { QuestionCard } from "@/presentation/components/QuestionCard";
import { QuestionCardSkeleton } from "@/presentation/components/QuestionCardSkeleton";
import { GAD7_QUESTIONS } from "@/domain/assessment-scales/gad7";
import { FREQUENCY_RESPONSE_OPTIONS } from "@/domain/assessment-scales/frequency-scale";
import { useSubmitAssessment } from "@/presentation/hooks/useSubmitAssessment";
import { routes } from "@/presentation/lib/routes";

export function Gad7AssessmentPage() {
  const navigate = useNavigate();
  const { mutateAsync, isPending } = useSubmitAssessment();
  const [answers, setAnswers] = useState<(number | undefined)[]>(() =>
    new Array(GAD7_QUESTIONS.length).fill(undefined),
  );
  const [questionIndex, setQuestionIndex] = useState(0);
  const [submitError, setSubmitError] = useState(false);

  const total = GAD7_QUESTIONS.length;
  const isLast = questionIndex === total - 1;

  const handleBack = () => {
    if (questionIndex === 0) {
      navigate(routes.assessment);
      return;
    }
    setQuestionIndex((index) => index - 1);
  };

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
      const result = await mutateAsync({ scaleType: "GAD-7", answers: nextAnswers as number[] });
      navigate(routes.result, {
        state: { scaleType: "GAD-7", totalScore: result.totalScore, max: 21, riskSignal: result.riskSignal },
      });
    } catch {
      setSubmitError(true);
    }
  };

  return (
    <PhoneShell centered>
      <div className="flex min-h-full flex-col pt-6">
        <div className="flex items-center gap-3">
          <BackButton onClick={handleBack} />
          <div className="flex-1">
            <ProgressBar
              value={((questionIndex + 1) / total) * 100}
              label={`Progresso da avaliação: pergunta ${questionIndex + 1} de ${total}`}
            />
          </div>
          <span className="font-mono text-[12px] text-muted-2">
            {questionIndex + 1}/{total}
          </span>
        </div>

        <p className="mt-[26px] text-caption text-muted-2">
          Nas últimas 2 semanas, com que frequência você foi incomodado(a) por:
        </p>

        {isPending ? (
          <QuestionCardSkeleton />
        ) : (
          <QuestionCard
            question={GAD7_QUESTIONS[questionIndex]!}
            options={FREQUENCY_RESPONSE_OPTIONS}
            selected={answers[questionIndex]}
            onSelect={handleSelect}
          />
        )}

        {submitError && (
          <p className="mt-4 text-caption text-danger">
            Não foi possível enviar. Toque em uma opção para tentar novamente.
          </p>
        )}
      </div>
    </PhoneShell>
  );
}
