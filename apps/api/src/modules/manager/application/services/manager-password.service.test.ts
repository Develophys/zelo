import { describe, expect, it } from "vitest";
import { ManagerPasswordService } from "./manager-password.service.ts";

describe("ManagerPasswordService", () => {
  it("hashes a password and verifies the same password against it", async () => {
    const service = new ManagerPasswordService();
    const stored = await service.hash("correct horse battery staple");

    expect(await service.verify("correct horse battery staple", stored)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const service = new ManagerPasswordService();
    const stored = await service.hash("correct horse battery staple");

    expect(await service.verify("wrong password", stored)).toBe(false);
  });

  it("produces a different stored hash each time (random salt), even for the same password", async () => {
    const service = new ManagerPasswordService();
    const first = await service.hash("same password");
    const second = await service.hash("same password");

    expect(first).not.toBe(second);
    expect(await service.verify("same password", first)).toBe(true);
    expect(await service.verify("same password", second)).toBe(true);
  });

  it("rejects a malformed stored value", async () => {
    const service = new ManagerPasswordService();

    expect(await service.verify("anything", "not-a-valid-stored-hash")).toBe(false);
  });
});
