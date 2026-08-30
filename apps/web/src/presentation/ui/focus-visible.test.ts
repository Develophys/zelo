import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Suppressing the UA outline without drawing a ring leaves a control with no
 * visible focus at all. Every class string that removes the outline must supply
 * its own indicator — checked per string literal, so an unrelated class on
 * another line cannot satisfy the rule by accident.
 */
const SUPPRESSES_OUTLINE = /(?:^|[\s'"`])(?:has-)?(?:focus-visible:)?outline-none(?![\w-])/;
const DRAWS_RING = /(?:has-)?focus-visible:(?:ring|outline)-(?!none)/;

const PRESENTATION = join(__dirname, '..');

/**
 * Elements that are not keyboard-reachable, so there is no focus to indicate.
 * Listed explicitly: an exception here is a decision someone made, not a gap.
 */
const NOT_FOCUSABLE = new Map([
  ['pages/YouPage/RevokeConsentSection.tsx', 'programmatic tabIndex={-1} focus target'],
  ['ui/ToastViewport.tsx', 'pointer-events-none popover container'],
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) return [];
    return [full];
  });
}

function stringLiterals(source: string): string[] {
  return source.match(/(['"`])(?:\\.|(?!\1)[\s\S])*\1/g) ?? [];
}

describe('focus visibility', () => {
  it('never removes the focus outline without drawing a ring', () => {
    const offenders = sourceFiles(PRESENTATION).flatMap((file) => {
      const key = relative(PRESENTATION, file).replace(/\\/g, '/');
      if (NOT_FOCUSABLE.has(key)) return [];

      return stringLiterals(readFileSync(file, 'utf8'))
        .filter((literal) => SUPPRESSES_OUTLINE.test(literal) && !DRAWS_RING.test(literal))
        .map((literal) => `${key}: ${literal.slice(0, 100)}`);
    });

    expect(offenders).toEqual([]);
  });

  it('keeps the not-focusable allowlist honest', () => {
    const stillSuppressing = [...NOT_FOCUSABLE.keys()].filter((key) =>
      stringLiterals(readFileSync(join(PRESENTATION, key), 'utf8')).some((literal) =>
        SUPPRESSES_OUTLINE.test(literal),
      ),
    );

    expect(stillSuppressing).toEqual([...NOT_FOCUSABLE.keys()]);
  });
});
