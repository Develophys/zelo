import { describe, expect, it, vi } from "vitest";
import { requireSession } from "./require-session";

class Rejected extends Error {}

function build(overrides: Partial<Parameters<typeof requireSession<{ name: string }>>[0]> = {}) {
  const options = {
    loginRoute: "/manager/login",
    isLoggedIn: () => false,
    confirm: vi.fn().mockResolvedValue({ name: "Ana" }),
    isRejected: (error: unknown) => error instanceof Rejected,
    onConfirmed: vi.fn(),
    onRejected: vi.fn(),
    ...overrides,
  };
  return { options, loader: requireSession(options) };
}

describe("requireSession", () => {
  it("renders at once when the flag says logged in, and confirms with /me in the background", async () => {
    const { options, loader } = build({ isLoggedIn: () => true });

    await expect(loader()).resolves.toBeNull();
    await Promise.resolve();

    expect(options.confirm).toHaveBeenCalledTimes(1);
    expect(options.onConfirmed).toHaveBeenCalledWith({ name: "Ana" });
  });

  it("ends the session when the background confirmation is rejected", async () => {
    const { options, loader } = build({ isLoggedIn: () => true, confirm: vi.fn().mockRejectedValue(new Rejected()) });

    await expect(loader()).resolves.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(options.onRejected).toHaveBeenCalledTimes(1);
  });

  it("ignores a background failure that is not a rejection, such as a network error", async () => {
    const { options, loader } = build({ isLoggedIn: () => true, confirm: vi.fn().mockRejectedValue(new Error("offline")) });

    await expect(loader()).resolves.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(options.onRejected).not.toHaveBeenCalled();
  });

  it("waits for /me when the flag is absent, calls onConfirmed and continues if it answers", async () => {
    const { options, loader } = build();

    await expect(loader()).resolves.toBeNull();

    expect(options.confirm).toHaveBeenCalledTimes(1);
    expect(options.onConfirmed).toHaveBeenCalledWith({ name: "Ana" });
  });

  it("redirects to login when the flag is absent and /me answers 401", async () => {
    const { loader } = build({ confirm: vi.fn().mockRejectedValue(new Rejected()) });

    const result = await loader();

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get("Location")).toBe("/manager/login");
  });

  it("lets a network failure reach the route's error boundary instead of bouncing to login", async () => {
    const { loader } = build({ confirm: vi.fn().mockRejectedValue(new Error("offline")) });

    await expect(loader()).rejects.toThrow("offline");
  });
});
