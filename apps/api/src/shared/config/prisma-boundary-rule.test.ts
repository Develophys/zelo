import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// This rule went inert once: it forbade `node_modules/@prisma/client`, which no
// file in this repo imports, while the real client is reached through the
// generated output path. `lint:boundaries` stayed green and proved nothing.
// The rule's target is coupled to schema.prisma's `generator client { output }`,
// so moving that output silently breaks the guard the same way again.
const API_ROOT = resolve(import.meta.dirname, "../../..");

function readGeneratorOutput(): string {
  const schema = readFileSync(resolve(API_ROOT, "prisma/schema.prisma"), "utf8");
  const match = schema.match(/generator\s+client\s*\{[^}]*output\s*=\s*"([^"]+)"/);
  if (!match) throw new Error("could not find `generator client { output }` in schema.prisma");
  return match[1];
}

function readBoundaryRuleTarget(): string {
  const config = readFileSync(resolve(API_ROOT, ".dependency-cruiser.cjs"), "utf8");
  const match = config.match(
    /name:\s*"application-no-prisma-imports"[\s\S]*?to:\s*\{\s*path:\s*"([^"]+)"/,
  );
  if (!match) {
    throw new Error("could not find the application-no-prisma-imports rule's `to.path`");
  }
  return match[1];
}

describe("application-no-prisma-imports boundary rule", () => {
  it("targets the path Prisma actually generates the client to", () => {
    const generatorOutput = readGeneratorOutput();
    const ruleTarget = readBoundaryRuleTarget();

    const normalized = generatorOutput.replace(/^\.\.\//, "");

    expect(
      ruleTarget.includes(normalized),
      `schema.prisma generates the client to "${generatorOutput}" (normalized: "${normalized}") ` +
        `but the dependency-cruiser rule targets "${ruleTarget}". They must agree, or the rule ` +
        `silently stops matching and lint:boundaries goes green while the boundary is unguarded.`,
    ).toBe(true);
  });

  it("still covers the node_modules package path, so installing @prisma/client cannot bypass it", () => {
    expect(readBoundaryRuleTarget()).toContain("@prisma/client");
  });
});
