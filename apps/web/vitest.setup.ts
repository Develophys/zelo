import "@testing-library/jest-dom/vitest";
import { afterEach, expect } from "vitest";
import { cleanup } from "@testing-library/react";
import { toHaveNoViolations } from "vitest-axe/dist/matchers.js";

// vitest-axe@0.1.0 ships two ways to register the matcher, and neither
// fully works against the installed vitest@2.1.x:
//   - `vitest-axe/matchers`'s root .d.ts re-exports everything as
//     `export type *`, so `toHaveNoViolations` can't be imported as a
//     value from there (hence the deep `dist/matchers.js` import above).
//   - `vitest-axe/extend-expect`'s type augmentation targets the pre-2.x
//     `Vi.Assertion` global namespace; Vitest 2.x moved matcher types onto
//     `Assertion<T>` in the "vitest" module itself, so that augmentation is
//     a no-op here. This declaration re-adds the matcher's type directly,
//     following the same pattern @testing-library/jest-dom/vitest.d.ts uses.
declare module "vitest" {
  interface Assertion<T> {
    toHaveNoViolations(): T;
  }
}

expect.extend({ toHaveNoViolations });

// jsdom does not implement matchMedia; components that check
// prefers-reduced-motion (e.g. SplashPage's typewriter effect) need a stub.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// jsdom 25 doesn't implement HTMLDialogElement's showModal()/close() (long-
// standing gap: https://github.com/jsdom/jsdom/issues/3294). The shared
// Modal (apps/web/src/presentation/ui/Modal.tsx) calls both, so tests need a
// minimal stand-in: toggle the `open` attribute and fire the `close` event
// `close()` is supposed to dispatch. This does not reproduce the browser's
// native focus trap or Escape-triggered auto-close — Modal handles Escape
// itself via a keydown handler for exactly this reason, and focus-trap
// correctness is a manual/browser check, not a unit test target.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

/**
 * @testing-library/react's automatic post-test cleanup only self-registers
 * when `afterEach` is a *global* (i.e. vitest's `test.globals: true`). This
 * project keeps globals off and imports `describe`/`it`/`expect` explicitly
 * from "vitest" in every test file, so that auto-detection never fires and
 * each test's rendered DOM leaks into the next one in the same file. Task 5's
 * ChatPage.test.tsx (two `it` blocks, each calling `render(<ChatPage />)`)
 * surfaced this: without an explicit cleanup, the second test's
 * `getByText(/não substitui atendimento profissional/i)` matched two
 * disclaimer elements (one per leaked render) and failed. Registering
 * cleanup explicitly here fixes it without turning on implicit globals.
 */
afterEach(() => {
  cleanup();
});
