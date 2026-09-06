import { describe, expect, it, afterEach } from "vitest";
import { buildSetPasswordUrl } from "./build-set-password-url.ts";

describe("buildSetPasswordUrl", () => {
  afterEach(() => {
    delete process.env.WEB_APP_BASE_URL;
  });

  it("builds a manager finish-setup URL under the default base when WEB_APP_BASE_URL is unset", () => {
    delete process.env.WEB_APP_BASE_URL;
    expect(buildSetPasswordUrl("manager", "abc123")).toBe("http://localhost:5173/manager/finish-setup/abc123");
  });

  it("builds a peer-partner finish-setup URL", () => {
    delete process.env.WEB_APP_BASE_URL;
    expect(buildSetPasswordUrl("peer-partner", "abc123")).toBe("http://localhost:5173/peer/finish-setup/abc123");
  });

  it("uses WEB_APP_BASE_URL when set", () => {
    process.env.WEB_APP_BASE_URL = "https://app.zelo.example";
    expect(buildSetPasswordUrl("manager", "abc123")).toBe("https://app.zelo.example/manager/finish-setup/abc123");
  });
});
