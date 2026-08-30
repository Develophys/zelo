import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SECTOR_PILL_CLASS } from './SectorPillPicker';

/**
 * `brand` is a text role and `brand-fill` is a fill role. In dark mode they
 * diverge hard — brand is a light mint, brand-fill stays deep — so painting
 * `text-on-fill` (near white) onto `bg-brand` measures about 1.5:1.
 *
 * theme-contrast.test.ts checks token pairs that are meant to be used together;
 * it cannot catch a component reaching for a pair that should never exist. This
 * closes that gap from the other side, at the call site.
 */
const FILL_ON_TEXT_ROLE = /\bbg-(brand|danger|warn|success)(?![\w-])/;
const ON_FILL_TEXT = /\btext-on-fill(-2)?(?![\w-])/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) return [];
    return [full];
  });
}

// Class strings are built as literals or templates, so checking each string
// literal on its own keeps unrelated classes on other lines from colliding.
function stringLiterals(source: string): string[] {
  return source.match(/(['"`])(?:\\.|(?!\1)[\s\S])*\1/g) ?? [];
}

describe('brand token pairing', () => {
  it('paints on-fill text only onto a fill role, never onto a text role', () => {
    const offenders = sourceFiles(join(__dirname, '..')).flatMap((file) =>
      stringLiterals(readFileSync(file, 'utf8'))
        .filter((literal) => FILL_ON_TEXT_ROLE.test(literal) && ON_FILL_TEXT.test(literal))
        .map((literal) => `${file}: ${literal.slice(0, 120)}`),
    );

    expect(offenders).toEqual([]);
  });

  it('fills the selected sector pill with the fill role', () => {
    expect(SECTOR_PILL_CLASS(true)).toMatch(/\bbg-brand-fill\b/);
    expect(SECTOR_PILL_CLASS(true)).not.toMatch(/\bbg-brand(?![\w-])/);
  });
});
