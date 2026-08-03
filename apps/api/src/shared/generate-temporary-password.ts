import { randomBytes } from "node:crypto";

// URL-safe base64 of 9 random bytes = 12 characters, no ambiguous punctuation
// (`+`, `/`, `=`) that could confuse someone copy-typing it from a screen.
export function generateTemporaryPassword(): string {
  return randomBytes(9).toString("base64url");
}
