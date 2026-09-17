import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { lazyPage } from "./lazy-route";

type PageModule = { SomePage: () => null };

const originalLocation = window.location;

function stubReload() {
  const reload = vi.fn();
  Object.defineProperty(window, "location", {
    writable: true,
    configurable: true,
    value: { ...originalLocation, reload },
  });
  return reload;
}

describe("lazyPage", () => {
  beforeEach(() => {
    stubReload();
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      writable: true,
      configurable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
  });

  it("resolves the named export from the loaded module", async () => {
    const Page = () => null;
    const load = vi.fn<() => Promise<PageModule>>().mockResolvedValue({ SomePage: Page });

    const resolved = await lazyPage(load, "SomePage")();

    expect(resolved).toBe(Page);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("retries the import once when the first attempt fails, so a single dropped request does not strand the navigation", async () => {
    const Page = () => null;
    const load = vi
      .fn<() => Promise<PageModule>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ SomePage: Page });

    const resolved = await lazyPage(load, "SomePage")();

    expect(resolved).toBe(Page);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("reloads the page when both attempts fail, because a chunk missing after a deploy can only be fixed by fetching a fresh index.html", async () => {
    const reload = stubReload();
    const load = vi
      .fn<() => Promise<PageModule>>()
      .mockRejectedValue(new Error("Failed to fetch dynamically imported module"));

    await expect(lazyPage(load, "SomePage")()).rejects.toThrow();

    expect(load).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
