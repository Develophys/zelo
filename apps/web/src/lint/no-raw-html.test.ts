import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ESLint } from "eslint";

const WEB_ROOT = path.resolve(__dirname, "../..");
const eslint = new ESLint({ cwd: WEB_ROOT, overrideConfigFile: path.join(WEB_ROOT, "eslint.config.mjs") });

async function lint(code: string, file = "src/probe.tsx") {
  const [result] = await eslint.lintText(code, { filePath: path.join(WEB_ROOT, file) });
  return result!.messages.filter((message) => message.severity === 2).map((message) => message.ruleId);
}

describe("raw-HTML and dynamic-code lint rules", () => {
  beforeAll(async () => {
    await lint("export {};");
  }, 60_000);

  it.each([
    ["dangerouslySetInnerHTML in JSX", `export const A = ({ html }: { html: string }) => <div dangerouslySetInnerHTML={{ __html: html }} />;`, "no-restricted-syntax"],
    ["dangerouslySetInnerHTML through createElement props", `import { createElement } from "react";\nexport const a = (html: string) => createElement("div", { dangerouslySetInnerHTML: { __html: html } });`, "no-restricted-syntax"],
    ["assigning innerHTML", `export function f(el: HTMLElement, html: string) { el.innerHTML = html; }`, "no-restricted-syntax"],
    ["assigning outerHTML", `export function f(el: HTMLElement, html: string) { el.outerHTML = html; }`, "no-restricted-syntax"],
    ["appending to innerHTML", `export function f(el: HTMLElement, html: string) { el.innerHTML += html; }`, "no-restricted-syntax"],
    ["insertAdjacentHTML", `export function f(el: HTMLElement, html: string) { el.insertAdjacentHTML("beforeend", html); }`, "no-restricted-syntax"],
    ["document.write", `export function f(html: string) { document.write(html); }`, "no-restricted-syntax"],
    ["document.writeln", `export function f(html: string) { document.writeln(html); }`, "no-restricted-syntax"],
    ["eval()", `export const f = (code: string) => eval(code);`, "no-eval"],
    ["new Function()", `export const f = (code: string) => new Function(code);`, "no-new-func"],
    ["setTimeout with a string", `export const f = () => setTimeout("alert(1)", 10);`, "no-implied-eval"],
    ["a javascript: URL", `export const A = () => <a href="javascript:alert(1)">x</a>;`, "no-script-url"],
  ])("rejects %s", async (_label, code, ruleId) => {
    expect(await lint(code)).toContain(ruleId);
  });

  it.each([
    ["plain JSX text and attributes", `export const A = ({ name }: { name: string }) => <a href="https://example.com" title={name}>{name}</a>;`],
    ["textContent assignment", `export function f(el: HTMLElement, text: string) { el.textContent = text; }`],
    ["reading innerHTML", `export const f = (el: HTMLElement) => el.innerHTML.length;`],
    ["a stream write that is not document.write", `export const f = (out: { write(s: string): void }) => out.write("x");`],
    ["setTimeout with a function", `export const f = () => setTimeout(() => undefined, 10);`],
  ])("allows %s", async (_label, code) => {
    expect(await lint(code)).toEqual([]);
  });

  it("applies to test files too, so a test cannot smuggle the pattern in", async () => {
    expect(await lint(`export function f(el: HTMLElement, html: string) { el.innerHTML = html; }`, "src/probe.test.ts")).toContain("no-restricted-syntax");
  });
});
