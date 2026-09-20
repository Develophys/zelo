import { describe, expect, it, vi } from "vitest";

const collaborator = {
  greet(): string {
    return "original";
  },
};

describe("vitest.config.ts restoreMocks", () => {
  it("lets a test install a spy inside its own it block and walk away without restoring it", () => {
    vi.spyOn(collaborator, "greet").mockReturnValue("stubbed");

    expect(collaborator.greet()).toBe("stubbed");
  });

  it("hands the next test in the file the real collaborator back, not the previous test's spy", () => {
    expect(
      vi.isMockFunction(collaborator.greet),
      "The previous test's spy is still installed. `restoreMocks: true` is missing from " +
        "apps/api/vitest.config.ts — without it a spy installed inside an `it` stays installed " +
        "for every later test in the same file, so a test can pass on a stub it never asked for.",
    ).toBe(false);

    expect(collaborator.greet()).toBe("original");
  });
});
