import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// jsdom evaluates no media queries and computes no animations, so the reduced
// motion policy cannot be asserted through a rendered component. The stylesheet
// itself is the contract: `motion-essential` on an element is inert without
// these rules, and the blanket sweep is the exact snippet people paste back in.
const css = readFileSync(join(process.cwd(), 'src/app/index.css'), 'utf8');

const reducedMotionBlock = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));

describe('reduced motion policy', () => {
  it('sweeps animations with the animation-name longhand, because the shorthand also resets animation-delay and would collapse the staggered dots into one flat pulse', () => {
    expect(reducedMotionBlock).toMatch(/animation-name:\s*none\s*!important/);
    expect(reducedMotionBlock).not.toMatch(/animation:\s*none/);
  });

  it('gives back an opacity animation to anything marked motion-essential, so removing vestibular motion does not also remove the only signal that something is happening', () => {
    expect(reducedMotionBlock).toMatch(
      /\.motion-essential\s*\{[^}]*animation-name:\s*motion-essential-pulse\s*!important/,
    );
    expect(css).toMatch(/@keyframes motion-essential-pulse/);
  });

  it('keeps the replacement free of transforms, which are the thing the user asked not to see', () => {
    const keyframes = css.slice(css.indexOf('@keyframes motion-essential-pulse'));
    const body = keyframes.slice(0, keyframes.indexOf('@media'));

    expect(body).toMatch(/opacity:/);
    expect(body).not.toMatch(/transform:|translate|scale|rotate/);
  });

  it('still kills decorative animation by default, so a new entrance effect does not have to opt out to be safe', () => {
    expect(reducedMotionBlock).toMatch(/\*\s*\{[^}]*animation-name:\s*none/);
    expect(reducedMotionBlock).not.toMatch(/animate-rise-in|animate-grow-in|animate-focus-in/);
  });
});
