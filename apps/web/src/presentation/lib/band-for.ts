export type ScoreBandTone = 'minimal' | 'mild' | 'moderate' | 'high' | 'severe';

export interface ScoreBand {
  label: string;
  tone: ScoreBandTone;
}

interface BandEntry {
  max: number;
  band: ScoreBand;
}

const PHQ9_BANDS: BandEntry[] = [
  { max: 4, band: { label: 'Mínimo', tone: 'minimal' } },
  { max: 9, band: { label: 'Leve', tone: 'mild' } },
  { max: 14, band: { label: 'Moderado', tone: 'moderate' } },
  { max: 19, band: { label: 'Moderadamente grave', tone: 'high' } },
  { max: 27, band: { label: 'Grave', tone: 'severe' } },
];

const GAD7_BANDS: BandEntry[] = [
  { max: 4, band: { label: 'Mínimo', tone: 'minimal' } },
  { max: 9, band: { label: 'Leve', tone: 'mild' } },
  { max: 14, band: { label: 'Moderado', tone: 'moderate' } },
  { max: 21, band: { label: 'Grave', tone: 'severe' } },
];

export function bandFor(scaleType: 'PHQ-9' | 'GAD-7', score: number): ScoreBand {
  const bands = scaleType === 'PHQ-9' ? PHQ9_BANDS : GAD7_BANDS;
  const match = bands.find((entry) => score <= entry.max);
  return (match ?? bands[bands.length - 1]!).band;
}
