import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CSS = readFileSync(path.join(WEB_ROOT, 'src', 'app', 'index.css'), 'utf8');
const HTML = readFileSync(path.join(WEB_ROOT, 'index.html'), 'utf8');
const THEME_TS = readFileSync(
  path.join(WEB_ROOT, 'src', 'presentation', 'lib', 'theme.ts'),
  'utf8',
);

/**
 * The browser chrome colour has to be a literal in three places — the meta tag,
 * the pre-paint script in index.html, and META_THEME_COLOR in theme.ts — because
 * none of them can read a custom property. Nothing makes them track
 * --color-canvas, so they can drift apart silently and the address bar ends up a
 * different colour from the page under it.
 */
function canvasFor(theme: 'light' | 'dark'): string {
  const marker = theme === 'light' ? '@theme' : "[data-theme='dark']";
  const start = CSS.indexOf(marker);
  expect(start, `index.css no longer contains ${marker}`).toBeGreaterThan(-1);
  const block = CSS.slice(CSS.indexOf('{', start), CSS.indexOf('\n}', start));
  const match = block.match(/--color-canvas:\s*(#[0-9a-fA-F]{3,8})\s*;/);
  expect(match, `--color-canvas is not defined in the ${theme} block`).not.toBeNull();
  return match![1]!.toLowerCase();
}

describe('theme-color literals track --color-canvas', () => {
  it('matches the light canvas in theme.ts, the meta tag and the pre-paint script', () => {
    const light = canvasFor('light');

    expect(THEME_TS).toContain(`light: '${light}'`);
    expect(HTML).toContain(`<meta name="theme-color" content="${light}" />`);
    expect(HTML.toLowerCase()).toContain(`'${light}'`);
  });

  it('matches the dark canvas in theme.ts and the pre-paint script', () => {
    const dark = canvasFor('dark');

    expect(THEME_TS).toContain(`dark: '${dark}'`);
    expect(HTML.toLowerCase()).toContain(`'${dark}'`);
  });
});
