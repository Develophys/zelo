import type { ScoreBand, ScoreBandTone } from '@/presentation/lib/band-for';

interface ScoreDialProps {
  score: number;
  max: number;
  band: ScoreBand;
}

const TONE_CLASS: Record<ScoreBandTone, { score: string; max: string; pill: string }> = {
  minimal: {
    score: 'text-band-minimal',
    max: 'text-band-minimal/75',
    pill: 'bg-band-minimal-bg text-band-minimal',
  },
  mild: {
    score: 'text-band-mild',
    max: 'text-band-mild/75',
    pill: 'bg-band-mild-bg text-band-mild',
  },
  moderate: {
    score: 'text-band-moderate',
    max: 'text-band-moderate/75',
    pill: 'bg-band-moderate-bg text-band-moderate',
  },
  high: {
    score: 'text-band-high',
    max: 'text-band-high/75',
    pill: 'bg-band-high-bg text-band-high',
  },
  severe: {
    score: 'text-band-severe',
    max: 'text-band-severe/75',
    pill: 'bg-band-severe-bg text-band-severe',
  },
};

export function ScoreDial({ score, max, band }: ScoreDialProps) {
  const tone = TONE_CLASS[band.tone];
  return (
    <div className="text-center">
      {/* The most important output in the product announced as four disconnected
          fragments — "19", "/27", "Moderadamente grave" — with the slash read
          aloud. The visual split stays; assistive tech gets one sentence. */}
      <span data-testid="score-sentence" className="sr-only">
        {score} de {max}. Faixa: {band.label}.
      </span>
      <div aria-hidden="true">
        <span data-testid="score-value" className={`font-serif text-score ${tone.score}`}>
          {score}
        </span>
        <span className={`text-[24px] ${tone.max}`}>/{max}</span>
        <div className="mt-3">
          <span
            className={`inline-block rounded-status px-4 py-1.75 font-sans text-label font-extrabold ${tone.pill}`}
          >
            {band.label}
          </span>
        </div>
      </div>
    </div>
  );
}
