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

/**
 * What the band label actually means, in the product's own register: a signal
 * and a next step, never a diagnosis. Without this the result screen renders a
 * word like "Grave" and leaves the reader to supply its meaning from memory.
 */
const BAND_MEANING: Record<ScoreBandTone, string> = {
  minimal: 'Poucos sinais neste período.',
  mild: 'Alguns sinais leves. Vale reparar em como você fica nos próximos dias.',
  moderate: 'Sinais moderados. Conversar com alguém pode ajudar a entender o que está pesando.',
  high: 'Sinais importantes. Buscar apoio profissional costuma fazer diferença neste ponto.',
  severe: 'Sinais intensos. Falar com um profissional é o passo mais útil agora.',
};

export function meaningFor(band: ScoreBand): string {
  return BAND_MEANING[band.tone];
}

/** Bands where the screen should offer a way through, not just a number. */
export function bandNeedsSupport(band: ScoreBand): boolean {
  return band.tone === 'high' || band.tone === 'severe';
}

export function bandFor(scaleType: 'PHQ-9' | 'GAD-7', score: number): ScoreBand {
  const bands = scaleType === 'PHQ-9' ? PHQ9_BANDS : GAD7_BANDS;
  const match = bands.find((entry) => score <= entry.max);
  return (match ?? bands[bands.length - 1]!).band;
}
