import type { AssessmentScale } from '@/domain/assessment-scales/scales';

const KEY = 'zelo.assessment-draft';

export interface AssessmentDraft {
  scaleType: AssessmentScale['type'];
  answers: (number | undefined)[];
  questionIndex: number;
}

/**
 * Keeps an instrument that is still being answered for the length of the
 * browser session, so a phone call, a refresh, a PWA evicted under memory
 * pressure, or an `autoUpdate` service worker landing mid-session does not
 * cost nine answers — including the self-harm item. Starting over is not what
 * an exhausted person does; abandoning is.
 *
 * `sessionStorage` for the same reason `last-result` uses it: an instrument
 * begun days ago restored as if it were this sitting's would misdate the
 * "últimas 2 semanas" the questions ask about. Stays on the device — this is
 * the phone the record is already encrypted onto.
 */
export function rememberDraft(draft: AssessmentDraft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Private mode, a full quota, a blocked origin — resuming is a rescue,
    // never a requirement. The instrument still works from the first item.
  }
}

function isDraft(value: unknown, scale: AssessmentScale): value is AssessmentDraft {
  if (typeof value !== 'object' || value === null) return false;
  const draft = value as Partial<AssessmentDraft>;
  return (
    draft.scaleType === scale.type &&
    Array.isArray(draft.answers) &&
    draft.answers.length === scale.questions.length &&
    draft.answers.every(
      (answer) =>
        answer === undefined ||
        answer === null ||
        (typeof answer === 'number' && scale.options.some(({ value }) => value === answer)),
    ) &&
    typeof draft.questionIndex === 'number' &&
    Number.isInteger(draft.questionIndex) &&
    draft.questionIndex >= 0 &&
    draft.questionIndex <= scale.questions.length
  );
}

export function recallDraft(scale: AssessmentScale): AssessmentDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isDraft(parsed, scale)) return null;
    // JSON has no `undefined`: an unanswered slot round-trips as `null`, and
    // every consumer downstream tests for `typeof answer === 'number'`.
    return { ...parsed, answers: parsed.answers.map((answer) => answer ?? undefined) };
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to do: the draft is scoped to the session either way.
  }
}
