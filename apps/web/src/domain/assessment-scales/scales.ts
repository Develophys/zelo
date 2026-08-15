import type { AssessmentScaleType } from '@zelo/domain';
import { FREQUENCY_RESPONSE_OPTIONS } from './frequency-scale';
import { GAD7_QUESTIONS } from './gad7';
import { PHQ9_QUESTIONS } from './phq9';

export interface AssessmentScale {
  type: Exclude<AssessmentScaleType, 'MBI-HSS'>;
  prompt: string;
  questions: readonly string[];
  options: readonly { value: number; label: string }[];
  maxScore: number;
}

const HIGHEST_FREQUENCY_VALUE = Math.max(...FREQUENCY_RESPONSE_OPTIONS.map(({ value }) => value));

const TWO_WEEK_FREQUENCY_PROMPT =
  'Nas últimas 2 semanas, com que frequência você foi incomodado(a) por:';

export const PHQ9_SCALE: AssessmentScale = {
  type: 'PHQ-9',
  prompt: TWO_WEEK_FREQUENCY_PROMPT,
  questions: PHQ9_QUESTIONS,
  options: FREQUENCY_RESPONSE_OPTIONS,
  maxScore: PHQ9_QUESTIONS.length * HIGHEST_FREQUENCY_VALUE,
};

export const GAD7_SCALE: AssessmentScale = {
  type: 'GAD-7',
  prompt: TWO_WEEK_FREQUENCY_PROMPT,
  questions: GAD7_QUESTIONS,
  options: FREQUENCY_RESPONSE_OPTIONS,
  maxScore: GAD7_QUESTIONS.length * HIGHEST_FREQUENCY_VALUE,
};
