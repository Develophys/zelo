import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WEB_ROOT = path.resolve(__dirname, "..");

interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

function siteHeaders(): Map<string, string> {
  const config = JSON.parse(readFileSync(path.join(WEB_ROOT, "vercel.json"), "utf8")) as { headers: HeaderRule[] };
  const rule = config.headers.find((entry) => entry.source === "/(.*)");
  if (!rule) throw new Error("vercel.json has no headers rule for /(.*)");
  return new Map(rule.headers.map((header) => [header.key.toLowerCase(), header.value]));
}

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...sources] = part.split(/\s+/);
        return [name!, sources] as [string, string[]];
      }),
  );
}

function inlineScriptHashes(): string[] {
  const html = readFileSync(path.join(WEB_ROOT, "index.html"), "utf8");
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    (match) => `'sha256-${createHash("sha256").update(match[1]!.replaceAll(String.fromCharCode(13, 10), String.fromCharCode(10))).digest("base64")}'`,
  );
}

describe("site security headers (vercel.json)", () => {
  const headers = siteHeaders();
  const csp = directives(headers.get("content-security-policy") ?? "");

  it("allows exactly the inline scripts index.html has, by hash, and no other inline script", () => {
    const hashes = inlineScriptHashes();

    expect(hashes.length).toBeGreaterThan(0);
    expect(csp.get("script-src")).toEqual(["'self'", ...hashes]);
  });

  it("never allows eval or inline event handlers in script-src", () => {
    const scriptSources = csp.get("script-src") ?? [];

    expect(scriptSources).not.toContain("'unsafe-eval'");
    expect(scriptSources).not.toContain("'unsafe-inline'");
    expect(scriptSources).not.toContain("*");
  });

  it("locks framing, plugins, base URI and form targets", () => {
    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'self'"]);
    expect(csp.get("form-action")).toEqual(["'self'"]);
    expect(csp.get("default-src")).toEqual(["'self'"]);
  });

  it("lets the app talk only to itself and to Zelo's own API origins, over https and wss", () => {
    const apiHosts = ["zelo-api.fly.dev", "zelo-api-dev.fly.dev", "api.zelohealth.app", "api-dev.zelohealth.app"];

    expect(csp.get("connect-src")).toEqual(["'self'", ...apiHosts.flatMap((host) => [`https://${host}`, `wss://${host}`])]);
  });

  it("has no wildcard host in any directive, since a wildcard lets injected script send data to an attacker's app on the same platform", () => {
    for (const [name, sources] of csp) {
      expect(sources.filter((source) => source.includes("*")), name).toEqual([]);
    }
  });

  it("keeps images, fonts, workers and the manifest on the app's own origin", () => {
    expect(csp.get("img-src")).toEqual(["'self'", "data:", "blob:"]);
    expect(csp.get("font-src")).toEqual(["'self'"]);
    expect(csp.get("worker-src")).toEqual(["'self'", "blob:"]);
    expect(csp.get("manifest-src")).toEqual(["'self'"]);
  });

  it("sets the companion headers", () => {
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("permissions-policy")).toBe("camera=(self), microphone=(), geolocation=(), payment=(), usb=()");
  });
});

describe("Docker nginx parity (docker/nginx-security-headers.conf)", () => {
  const snippet = readFileSync(path.resolve(WEB_ROOT, "../../docker/nginx-security-headers.conf"), "utf8");

  function nginxHeader(name: string): string | undefined {
    return snippet.match(new RegExp(`add_header ${name} "([^"]*)" always;`))?.[1];
  }

  it("sends the same policy as Vercel, except that connect-src targets the local API", () => {
    const site = directives(siteHeaders().get("content-security-policy") ?? "");
    const docker = directives(nginxHeader("Content-Security-Policy") ?? "");

    expect(docker.get("connect-src")).toEqual(["'self'", "http://localhost:3000", "ws://localhost:3000"]);
    for (const [name, sources] of site) {
      if (name !== "connect-src") expect(docker.get(name), name).toEqual(sources);
    }
    expect([...docker.keys()].sort()).toEqual([...site.keys()].sort());
  });

  it("sets the same companion headers as Vercel", () => {
    const site = siteHeaders();

    for (const name of ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"]) {
      expect(nginxHeader(name), name).toBe(site.get(name.toLowerCase()));
    }
  });
});
