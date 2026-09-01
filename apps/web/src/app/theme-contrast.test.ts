import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.css'),
  'utf8',
);

type Palette = Record<string, string>;

function colorsIn(block: string): Palette {
  const tokens: Palette = {};
  for (const match of block.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    const [, name, value] = match;
    if (name && value) tokens[name] = value;
  }
  return tokens;
}

function token(tokens: Palette, name: string): string {
  const value = tokens[name];
  if (!value) throw new Error(`--color-${name} is not defined in this theme`);
  return value;
}

function blockAfter(marker: string): string {
  const start = CSS.indexOf(marker);
  if (start === -1) throw new Error(`index.css no longer contains ${marker}`);
  const open = CSS.indexOf('{', start);
  const end = CSS.indexOf('\n}', open);
  return CSS.slice(open, end);
}

const LIGHT = colorsIn(blockAfter('@theme'));
const DARK_OVERRIDES = colorsIn(blockAfter("[data-theme='dark']"));
const DARK = { ...LIGHT, ...DARK_OVERRIDES };

// An accent preference that shipped an unreadable combination would be worse
// than no preference at all, so every accent runs the whole pair matrix rather
// than a spot check. `sage` is the default and carries no override block.
const ACCENTS = ['sage', 'teal', 'indigo', 'clay'] as const;
const ACCENT_ROLES = [
  'brand',
  'brand-hover',
  'brand-ink',
  'brand-fill',
  'brand-fill-hover',
  'surface-brand',
];

const accentOverrides = (accent: (typeof ACCENTS)[number], theme: 'light' | 'dark'): Palette =>
  accent === 'sage'
    ? {}
    : colorsIn(
        blockAfter(
          theme === 'dark'
            ? `[data-theme='dark'][data-accent='${accent}']`
            : `[data-accent='${accent}']`,
        ),
      );

const palette = (accent: (typeof ACCENTS)[number], theme: 'light' | 'dark'): Palette => ({
  ...(theme === 'dark' ? DARK : LIGHT),
  ...accentOverrides(accent, theme),
});

const THEMES = ACCENTS.flatMap((accent) =>
  (['light', 'dark'] as const).map(
    (theme) => [`${theme} · ${accent}`, palette(accent, theme)] as const,
  ),
);

type Rgb = readonly [number, number, number];

const channels = (hex: string): Rgb => {
  const s = hex.slice(1);
  const full = s.length === 3 ? [...s].map((c) => c + c).join('') : s;
  const at = (i: number) => parseInt(full.slice(i, i + 2), 16) / 255;
  return [at(0), at(2), at(4)];
};

const alpha = (hex: string): number => (hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1);

const over = (fg: string, bg: string): string => {
  const a = alpha(fg);
  const f = channels(fg);
  const b = channels(bg);
  const blend = (i: 0 | 1 | 2) =>
    Math.round((f[i] * a + b[i] * (1 - a)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${blend(0)}${blend(1)}${blend(2)}`;
};

const luminance = (hex: string): number => {
  const [r, g, b] = channels(hex);
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};

const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)];
  const [hi, lo] = x >= y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
};

// [foreground, background, minimum ratio, what the pair is]
const TEXT_PAIRS: readonly [string, string, number, string][] = [
  ['ink', 'canvas', 4.5, 'body text on canvas'],
  ['ink', 'surface', 4.5, 'body text on a card'],
  ['ink', 'canvas-alt', 4.5, 'body text on the alt canvas'],
  ['ink', 'surface-brand', 4.5, 'body text on the brand tint'],
  ['ink-2', 'canvas', 4.5, 'secondary text on canvas'],
  ['ink-2', 'surface', 4.5, 'secondary text on a card'],
  ['muted', 'canvas', 4.5, 'caption on canvas'],
  ['muted', 'surface', 4.5, 'caption on a card'],
  ['muted', 'canvas-alt', 4.5, 'caption on the alt canvas'],
  ['muted', 'surface-brand', 4.5, 'caption on the brand tint'],
  ['muted-2', 'canvas', 4.5, 'muted-2 on canvas'],
  ['muted-2', 'surface', 4.5, 'muted-2 on a card'],
  ['brand', 'canvas', 4.5, 'link and brand text on canvas'],
  ['brand', 'surface', 4.5, 'link and brand text on a card'],
  ['brand', 'canvas-alt', 4.5, 'brand text on the alt canvas'],
  ['brand', 'surface-brand', 4.5, 'soft-button and active-nav label on the tint'],
  ['brand-hover', 'canvas', 4.5, 'brand hover text on canvas'],
  ['brand-hover', 'track', 4.5, 'soft-button label on hover'],
  ['brand-hover', 'surface', 4.5, 'brand hover text on a card'],
  ['brand-ink', 'surface-brand', 4.5, 'offline-alert text and text selection'],
  ['on-fill', 'brand-fill', 4.5, 'primary button and user chat bubble'],
  ['on-fill', 'brand-fill-hover', 4.5, 'primary button on hover'],
  ['on-fill', 'danger-fill', 4.5, 'danger button'],
  [
    'on-fill',
    'danger-strong-fill',
    4.5,
    'crisis call button — the one control that must never fail',
  ],
  ['on-fill-2', 'brand-fill', 4.5, 'secondary text on a brand card'],
  ['brand-fill', 'on-fill', 4.5, 'brand label on the white pill inside a brand card'],
  ['warn-ink', 'warn-bg', 4.5, 'chat disclaimer banner'],
  ['success', 'canvas', 4.5, 'ativar bulk-action icon on canvas'],
  ['success', 'surface', 4.5, 'ativar bulk-action icon on a card'],
  ['success', 'success-bg', 4.5, 'ativar bulk-action icon on its own hover tint'],
  ['danger', 'canvas', 4.5, 'error text on canvas'],
  ['danger', 'surface', 4.5, 'error text on a card'],
  ['danger', 'danger-bg', 4.5, 'error text on the error tint'],
  ['danger-ink', 'danger-bg', 4.5, 'error body on the error tint'],
  ['danger-strong', 'canvas', 4.5, 'crisis text on canvas'],
  ['danger-strong', 'surface', 4.5, 'crisis text on a card'],
  ['danger-strong', 'danger-strong-bg', 4.5, 'crisis text on the crisis tint'],
  ['band-minimal', 'band-minimal-bg', 4.5, 'minimal band on its own tint'],
  ['band-minimal', 'surface', 4.5, 'minimal band on a card'],
  ['band-mild', 'band-mild-bg', 4.5, 'mild band on its own tint'],
  ['band-mild', 'surface', 4.5, 'mild band on a card'],
  ['band-moderate', 'band-moderate-bg', 4.5, 'moderate band on its own tint'],
  ['band-moderate', 'surface', 4.5, 'moderate band on a card'],
  ['band-high', 'band-high-bg', 4.5, 'high band on its own tint'],
  ['band-high', 'surface', 4.5, 'high band on a card'],
  ['band-severe', 'band-severe-bg', 4.5, 'severe band on its own tint'],
  ['band-severe', 'surface', 4.5, 'severe band on a card'],
];

const GRAPHIC_PAIRS: readonly [string, string, number, string][] = [
  ['brand-fill', 'canvas', 3, 'primary button shape against canvas'],
  ['brand-fill', 'surface', 3, 'primary button shape against a card'],
  ['brand-fill', 'canvas-alt', 3, 'splash and sidebar logo tile'],
  ['danger-fill', 'canvas', 3, 'danger button shape against canvas'],
  ['danger-fill', 'surface', 3, 'danger button shape against a card'],
  ['danger-strong-fill', 'danger-strong-bg', 3, 'crisis call button inside the crisis box'],
  ['danger-strong-fill', 'surface', 3, 'crisis call button on a card'],
  ['brand', 'canvas', 3, 'focus ring and progress fill against canvas'],
  ['brand', 'surface', 3, 'focus ring and chart bars against a card'],
  ['brand', 'track', 3, 'progress fill against its own track'],
  ['muted', 'track', 3, 'the disabled send arrow on its own disabled fill'],
  ['on-fill', 'brand-fill', 3, 'focus ring on a brand-filled control'],
  ['warn', 'surface', 3, 'chart legend dot and the manager percentage'],
  ['warn', 'warn-bg', 3, 'warn mark on the warn tint'],
  // WCAG 1.4.11 covers visual information required to identify a component and
  // its state. For an input and an unchecked box the border IS the control —
  // there is nothing else marking where it begins — so these must reach 3:1 on
  // every surface they sit on. Purely structural hairlines (card edges, section
  // rules, dividers) are decoration and deliberately absent from this list.
  ['control-edge', 'surface', 3, 'input and unchecked box on a card'],
  ['control-edge', 'canvas', 3, 'input and unchecked box on the page'],
  ['control-edge', 'canvas-alt', 3, 'input and unchecked box on the alt canvas'],
  ['control-edge', 'surface-brand', 3, 'input and unchecked box on the brand tint'],
];

/**
 * Text drawn over a tinted surface — a token composited onto another at an
 * alpha, which is how several rows and buttons are built. These were invisible
 * to this file until now: it parses literal hex out of index.css, and every
 * `/40`-style alpha lives in TSX, so a pair could fail here and pass everything.
 *
 * [text token, tint token, tint alpha, what the tint sits on, min ratio, where]
 */
const TINTED_TEXT_PAIRS: readonly [string, string, number, string, number, string][] = [
  ['muted', 'warn-bg', 0.4, 'canvas', 4.5, 'date on an unread notification row'],
];

const SHARED_BY_DESIGN = new Set(['on-fill-2']);

describe.each(THEMES)('%s theme', (themeName, tokens) => {
  it.each(TEXT_PAIRS)('%s on %s reaches AA for text (>= %s:1) — %s', (fg, bg, min) => {
    expect(contrast(token(tokens, fg), token(tokens, bg))).toBeGreaterThanOrEqual(min);
  });

  it.each(GRAPHIC_PAIRS)('%s on %s reaches AA for non-text (>= %s:1) — %s', (fg, bg, min) => {
    expect(contrast(token(tokens, fg), token(tokens, bg))).toBeGreaterThanOrEqual(min);
  });

  it.each(TINTED_TEXT_PAIRS)(
    '%s over %s/%s on %s reaches AA for text (>= %s:1) — %s',
    (fg, tint, tintAlpha, base, min) => {
      const composited = over(
        `${token(tokens, tint)}${Math.round(tintAlpha * 255)
          .toString(16)
          .padStart(2, '0')}`,
        token(tokens, base),
      );
      expect(contrast(token(tokens, fg), composited)).toBeGreaterThanOrEqual(min);
    },
  );

  it(`resolves every ${themeName} token to a colour`, () => {
    expect(Object.keys(tokens).length).toBeGreaterThan(20);
  });
});

describe('theme completeness', () => {
  it('gives every light token a dark counterpart, so a new colour cannot ship half-themed', () => {
    const unthemed = Object.keys(LIGHT).filter(
      (name) => !SHARED_BY_DESIGN.has(name) && !(name in DARK_OVERRIDES),
    );
    expect(unthemed).toEqual([]);
  });

  it("inverts the elevation model rather than reusing the light theme's green tint", () => {
    expect(luminance(token(LIGHT, 'surface'))).toBeGreaterThan(luminance(token(LIGHT, 'canvas')));
    expect(luminance(token(DARK, 'surface'))).toBeGreaterThan(luminance(token(DARK, 'canvas')));
    expect(luminance(token(DARK, 'canvas'))).toBeLessThan(luminance(token(LIGHT, 'canvas')));
  });

  it('keeps the modal scrim dark in both themes, so it never inverts into a white wash', () => {
    expect(luminance(token(LIGHT, 'scrim'))).toBeLessThan(0.1);
    expect(luminance(token(DARK, 'scrim'))).toBeLessThan(0.1);
  });
});

describe('accent presets', () => {
  const OVERRIDABLE = ACCENTS.filter((accent) => accent !== 'sage');

  it.each(OVERRIDABLE.flatMap((a) => (['light', 'dark'] as const).map((t) => [a, t] as const)))(
    '%s defines every brand role in the %s theme, so no accent falls back to sage',
    (accent, theme) => {
      expect(Object.keys(accentOverrides(accent, theme)).sort()).toEqual([...ACCENT_ROLES].sort());
    },
  );

  it('changes the brand colour and nothing else — accents are not a second theme', () => {
    for (const accent of OVERRIDABLE) {
      for (const theme of ['light', 'dark'] as const) {
        expect(Object.keys(accentOverrides(accent, theme)).every((r) => ACCENT_ROLES.includes(r))).toBe(
          true,
        );
      }
    }
  });

  it('leaves sage as the default, with no override block of its own', () => {
    expect(CSS).not.toContain("[data-accent='sage']");
  });
});

describe.each(ACCENTS)('filled-control rim · %s', (accent) => {
  const light = palette(accent, 'light');
  const dark = palette(accent, 'dark');
  const FILLS = ['brand-fill', 'brand-fill-hover', 'danger-fill', 'danger-strong-fill'] as const;
  const LIFTED = [
    'surface-brand',
    'surface',
    'canvas',
    'canvas-alt',
    'danger-strong-bg',
    'danger-bg',
  ] as const;

  it.each(FILLS)('is invisible over %s in the light theme, which needs no rim', (fill) => {
    expect(over(token(light, 'fill-edge'), token(light, fill))).toBe(token(light, fill));
  });

  it.each(FILLS.flatMap((fill) => LIFTED.map((surface) => [fill, surface] as const)))(
    'separates a %s control from %s in the dark theme',
    (fill, surface) => {
      const rim = over(token(dark, 'fill-edge'), token(dark, fill));
      expect(contrast(rim, token(dark, surface))).toBeGreaterThanOrEqual(3);
    },
  );

  it('stays a rim rather than an outline — visible against its own fill, but quietly', () => {
    const rim = over(token(dark, 'fill-edge'), token(dark, 'brand-fill'));
    const againstOwnFill = contrast(rim, token(dark, 'brand-fill'));
    expect(againstOwnFill).toBeGreaterThan(1.15);
    expect(againstOwnFill).toBeLessThan(1.6);
  });
});
