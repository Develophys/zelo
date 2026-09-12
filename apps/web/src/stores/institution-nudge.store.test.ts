import { describe, expect, it, beforeEach } from "vitest";
import { useInstitutionNudgeStore } from "./institution-nudge.store";

describe("useInstitutionNudgeStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useInstitutionNudgeStore.setState({ dismissedAt: null });
  });

  it("starts with no dismissal", () => {
    expect(useInstitutionNudgeStore.getState().dismissedAt).toBeNull();
  });

  it("dismiss persists the timestamp to localStorage", () => {
    useInstitutionNudgeStore.getState().dismiss();

    expect(useInstitutionNudgeStore.getState().dismissedAt).not.toBeNull();

    const persisted = JSON.parse(localStorage.getItem("zelo.institution-nudge")!);
    expect(persisted.state.dismissedAt).not.toBeNull();
  });
});
