import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A `px` font size answers page zoom but ignores the browser's own font-size
 * preference — the setting someone with low vision is most likely to have
 * already set once, everywhere, instead of zooming each site. `rem` answers
 * both.
 *
 * The rule has to cover the call sites too: tokens in `rem` would still leave
 * every bracketed `text-[Npx]` pinned, and those are exactly the smallest type
 * in the app.
 */
const SIZE_TOKEN = /^\s*(--text-[a-z0-9-]+)\s*:\s*([^;]+);/gm;
const MODIFIER = /--(line-height|letter-spacing|font-weight)$/;
const BRACKETED_PX = /\btext-\[[0-9.]+px\]/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) return [];
    return [full];
  });
}

describe('type scale', () => {
  it('declares every font size token in rem, so the browser font-size preference is honoured', () => {
    const css = readFileSync(join(__dirname, 'index.css'), 'utf8');
    const offenders = [...css.matchAll(SIZE_TOKEN)]
      .filter(([, name]) => !MODIFIER.test(name!))
      .map(([, name, value]) => [name!, value!.replace(/\/\*.*?\*\//g, '').trim()] as const)
      .filter(([, value]) => !value.endsWith('rem'))
      .map(([name, value]) => `${name}: ${value}`);

    expect(offenders).toEqual([]);
  });

  it('sets no font size in bracketed px, which would opt that element out of the same preference', () => {
    const offenders = sourceFiles(join(__dirname, '..', 'presentation')).flatMap((file) => {
      const matches = readFileSync(file, 'utf8').match(BRACKETED_PX) ?? [];
      return matches.map((match) => `${file.replace(/.*[\/]src[\/]/, '')}: ${match}`);
    });

    expect(offenders).toEqual([]);
  });
});
