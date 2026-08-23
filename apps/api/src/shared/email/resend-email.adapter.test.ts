import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ConfigService } from "@nestjs/config";

const sendMock = vi.fn();

vi.mock("resend", () => {
  return {
    Resend: vi.fn().mockImplementation(() => ({
      emails: { send: sendMock },
    })),
  };
});

function fakeConfig(): ConfigService {
  return { getOrThrow: () => "fake-api-key", get: () => undefined } as unknown as ConfigService;
}

describe("ResendEmailAdapter", () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it("throws EmailDeliveryError carrying the API's message when the SDK resolves with an error", async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: "domain not verified" } });

    const { ResendEmailAdapter } = await import("./resend-email.adapter.ts");
    const { EmailDeliveryError } = await import("./email.port.ts");
    const adapter = new ResendEmailAdapter(fakeConfig());

    await expect(
      adapter.send("paulo@zelo-demo.local", "invite", { name: "Paulo", setPasswordUrl: "https://zelo.app/set-password?token=abc" }),
    ).rejects.toThrow(EmailDeliveryError);
    await expect(
      adapter.send("paulo@zelo-demo.local", "invite", { name: "Paulo", setPasswordUrl: "https://zelo.app/set-password?token=abc" }),
    ).rejects.toThrow("domain not verified");
  });

  it("resolves without throwing when the SDK resolves successfully", async () => {
    sendMock.mockResolvedValue({ data: { id: "email-123" }, error: null });

    const { ResendEmailAdapter } = await import("./resend-email.adapter.ts");
    const adapter = new ResendEmailAdapter(fakeConfig());

    await expect(
      adapter.send("paulo@zelo-demo.local", "invite", { name: "Paulo", setPasswordUrl: "https://zelo.app/set-password?token=abc" }),
    ).resolves.toBeUndefined();
  });

  it("normalizes a thrown network rejection into EmailDeliveryError", async () => {
    sendMock.mockRejectedValue(new Error("socket hang up"));

    const { ResendEmailAdapter } = await import("./resend-email.adapter.ts");
    const { EmailDeliveryError } = await import("./email.port.ts");
    const adapter = new ResendEmailAdapter(fakeConfig());

    await expect(
      adapter.send("paulo@zelo-demo.local", "invite", { name: "Paulo", setPasswordUrl: "https://zelo.app/set-password?token=abc" }),
    ).rejects.toThrow(EmailDeliveryError);
    await expect(
      adapter.send("paulo@zelo-demo.local", "invite", { name: "Paulo", setPasswordUrl: "https://zelo.app/set-password?token=abc" }),
    ).rejects.toThrow("socket hang up");
  });
});
