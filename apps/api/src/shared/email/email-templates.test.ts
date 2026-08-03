import { describe, expect, it } from "vitest";
import { renderEmailTemplate } from "./email-templates.ts";

describe("renderEmailTemplate", () => {
  it("renders the invite template with the person's name and the set-password link", () => {
    const { subject, html } = renderEmailTemplate("invite", { name: "Dra. Ana", setPasswordUrl: "https://example.com/manager/finish-setup?token=abc" });

    expect(subject).toBe("Finalize seu cadastro no Zelo");
    expect(html).toContain("Dra. Ana");
    expect(html).toContain("https://example.com/manager/finish-setup?token=abc");
    expect(html).toContain("48 horas");
  });

  it("renders the password-reset template with the person's name and the set-password link", () => {
    const { subject, html } = renderEmailTemplate("password-reset", { name: "Dra. Ana", setPasswordUrl: "https://example.com/manager/finish-setup?token=xyz" });

    expect(subject).toBe("Redefinição de senha no Zelo");
    expect(html).toContain("Dra. Ana");
    expect(html).toContain("https://example.com/manager/finish-setup?token=xyz");
    expect(html).toContain("48 horas");
  });
});
