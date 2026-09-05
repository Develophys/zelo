import { afterEach, describe, expect, it, vi } from 'vitest';
import { GAD7_SCALE, PHQ9_SCALE } from '@/domain/assessment-scales/scales';
import { clearDraft, recallDraft, rememberDraft } from './assessment-draft';

const KEY = 'zelo.assessment-draft';

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('assessment draft', () => {
  it('rejects a draft whose answer count no longer matches the scale', () => {
    rememberDraft({ scaleType: 'PHQ-9', answers: [1, 2, 0], questionIndex: 3 });

    expect(recallDraft(PHQ9_SCALE)).toBeNull();
  });

  it('restores a draft whose shape still matches the scale', () => {
    const answers: (number | undefined)[] = new Array(PHQ9_SCALE.questions.length).fill(undefined);
    answers[0] = 3;
    answers[1] = 1;
    rememberDraft({ scaleType: 'PHQ-9', answers, questionIndex: 2 });

    expect(recallDraft(PHQ9_SCALE)).toEqual({
      scaleType: 'PHQ-9',
      answers,
      questionIndex: 2,
    });
  });

  // JSON has no `undefined`, and every consumer downstream tests for
  // `typeof answer === 'number'` before submitting.
  it('brings an unanswered slot back as undefined, not the null JSON stored', () => {
    const answers = new Array<number | undefined>(PHQ9_SCALE.questions.length).fill(undefined);
    answers[0] = 2;
    rememberDraft({ scaleType: 'PHQ-9', answers, questionIndex: 1 });

    const restored = recallDraft(PHQ9_SCALE)!;
    expect(restored.answers[1]).toBeUndefined();
    expect(Object.hasOwn(restored.answers, 1)).toBe(true);
  });

  it('never hands one scale the answers of another', () => {
    rememberDraft({
      scaleType: 'PHQ-9',
      answers: new Array(PHQ9_SCALE.questions.length).fill(0),
      questionIndex: 4,
    });

    expect(recallDraft(GAD7_SCALE)).toBeNull();
  });

  it('rejects a draft carrying an answer outside the scale options', () => {
    const answers = new Array<number | undefined>(PHQ9_SCALE.questions.length).fill(0);
    answers[2] = 9;
    sessionStorage.setItem(KEY, JSON.stringify({ scaleType: 'PHQ-9', answers, questionIndex: 3 }));

    expect(recallDraft(PHQ9_SCALE)).toBeNull();
  });

  it('rejects a cursor past the review step', () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({
        scaleType: 'PHQ-9',
        answers: new Array(PHQ9_SCALE.questions.length).fill(0),
        questionIndex: PHQ9_SCALE.questions.length + 1,
      }),
    );

    expect(recallDraft(PHQ9_SCALE)).toBeNull();
  });

  it('survives malformed storage rather than throwing on mount', () => {
    sessionStorage.setItem(KEY, '{not json');
    expect(recallDraft(PHQ9_SCALE)).toBeNull();
  });

  it('degrades quietly when storage is blocked, so the instrument still opens', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });

    expect(() =>
      rememberDraft({ scaleType: 'GAD-7', answers: [0], questionIndex: 0 }),
    ).not.toThrow();
  });

  it('forgets the draft once the instrument has been submitted', () => {
    rememberDraft({
      scaleType: 'PHQ-9',
      answers: new Array(PHQ9_SCALE.questions.length).fill(1),
      questionIndex: PHQ9_SCALE.questions.length,
    });
    clearDraft();

    expect(recallDraft(PHQ9_SCALE)).toBeNull();
  });
});
