import { describe, expect, it, afterEach } from "vitest";
import { renderEmailTemplate } from "./email-templates.ts";

describe("renderEmailTemplate", () => {
  afterEach(() => {
    delete process.env.WEB_APP_BASE_URL;
  });

  it("renders the invite template with the person's name and the set-password link", () => {
    const { subject, html } = renderEmailTemplate("invite", { name: "Dra. Ana", setPasswordUrl: "https://example.com/manager/finish-setup?token=abc" });

    expect(subject).toBe("Finalize seu cadastro no Zelo");
    expect(html).toContain("Dra. Ana");
    expect(html).toContain("https://example.com/manager/finish-setup?token=abc");
    expect(html).toContain("48 horas");
    expect(html).toContain('src="http://localhost:5173/zelo_logo.png"');
    expect(html).toContain("#2f6b5e");
    expect(html).toContain("Zelo Health");
  });

  it("renders the password-reset template with the person's name and the set-password link", () => {
    const { subject, html } = renderEmailTemplate("password-reset", { name: "Dra. Ana", setPasswordUrl: "https://example.com/manager/finish-setup?token=xyz" });

    expect(subject).toBe("Redefinição de senha no Zelo");
    expect(html).toContain("Dra. Ana");
    expect(html).toContain("https://example.com/manager/finish-setup?token=xyz");
    expect(html).toContain("48 horas");
    expect(html).toContain('src="http://localhost:5173/zelo_logo.png"');
    expect(html).toContain("#2f6b5e");
    expect(html).toContain("Zelo Health");
  });

  it("builds the logo URL from WEB_APP_BASE_URL when set", () => {
    process.env.WEB_APP_BASE_URL = "https://zelohealth.app";
    const { html } = renderEmailTemplate("invite", { name: "Dra. Ana", setPasswordUrl: "https://example.com/x" });

    expect(html).toContain('src="https://zelohealth.app/zelo_logo.png"');
  });

  it("escapes HTML in the recipient's name so it can't inject markup into the invite email", () => {
    const { html } = renderEmailTemplate("invite", {
      name: "<script>alert('xss')</script>",
      setPasswordUrl: "https://example.com/manager/finish-setup?token=abc",
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
  });

  it("escapes HTML in the recipient's name so it can't inject markup into the password-reset email", () => {
    const { html } = renderEmailTemplate("password-reset", {
      name: "<img src=x onerror=alert(1)>",
      setPasswordUrl: "https://example.com/manager/finish-setup?token=xyz",
    });

    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("leaves setPasswordUrl unescaped in the href", () => {
    const { html } = renderEmailTemplate("invite", { name: "Dra. Ana", setPasswordUrl: "https://example.com/manager/finish-setup?token=abc&ref=1" });

    expect(html).toContain('href="https://example.com/manager/finish-setup?token=abc&ref=1"');
  });
});
