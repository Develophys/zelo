import { Card } from "@/presentation/ui/Card";
import { ScoreDial } from "@/presentation/ui/ScoreDial";
import { meaningFor, type ScoreBand } from "@/presentation/lib/band-for";

interface ResultBandCardProps {
  scaleType: "PHQ-9" | "GAD-7";
  score: number;
  max: number;
  band: ScoreBand;
}

export function ResultBandCard({ scaleType, score, max, band }: ResultBandCardProps) {
  return (
    <Card size="lg" className="text-center">
      <p className="text-caption text-muted-2">Sua pontuação {scaleType}</p>
      <div className="mt-2">
        <ScoreDial score={score} max={max} band={band} />
      </div>
      <p data-testid="band-meaning" className="mt-3 text-pretty text-caption text-muted">
        {meaningFor(band)}
      </p>
    </Card>
  );
}
