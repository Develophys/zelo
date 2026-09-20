import { describe, expect, it } from "vitest";
import { assertSameDatabaseTarget } from "./assert-database-target.ts";

const LOCAL = "postgresql://zelo:zelo@localhost:5432/zelo";
const LOCAL_IPV4 = "postgresql://zelo:zelo@127.0.0.1:5432/zelo";
const REMOTE = "postgres://user:pass@db.prisma.io:5432/zelo?sslmode=require";
const REMOTE_POOLED = "postgres://user:pass@ep-x-pooler.sa-east-1.aws.neon.tech/zelo";

describe("assertSameDatabaseTarget", () => {
  it("accepts both pointing at the same local database", () => {
    expect(() =>
      assertSameDatabaseTarget({ DATABASE_URL: LOCAL, DIRECT_DATABASE_URL: LOCAL }),
    ).not.toThrow();
  });

  it("accepts two different remote hosts, which is a legitimate pooled-vs-direct setup", () => {
    expect(() =>
      assertSameDatabaseTarget({ DATABASE_URL: REMOTE_POOLED, DIRECT_DATABASE_URL: REMOTE }),
    ).not.toThrow();
  });

  it("accepts a missing DIRECT_DATABASE_URL, because there is then nothing to disagree with", () => {
    expect(() => assertSameDatabaseTarget({ DATABASE_URL: LOCAL })).not.toThrow();
  });

  it("rejects a remote DIRECT_DATABASE_URL with no DATABASE_URL, the case where the cascade silently falls through to .env's localhost", () => {
    expect(() => assertSameDatabaseTarget({ DIRECT_DATABASE_URL: REMOTE })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("rejects writes aimed at localhost while migrations are aimed at a remote host", () => {
    expect(() =>
      assertSameDatabaseTarget({ DATABASE_URL: LOCAL, DIRECT_DATABASE_URL: REMOTE }),
    ).toThrow(/localhost[\s\S]*db\.prisma\.io|db\.prisma\.io[\s\S]*localhost/);
  });

  it("rejects the reverse split too, writes remote while migrations stay local", () => {
    expect(() =>
      assertSameDatabaseTarget({ DATABASE_URL: REMOTE, DIRECT_DATABASE_URL: LOCAL }),
    ).toThrow();
  });

  it("treats 127.0.0.1 as local, so the split is caught however the loopback is spelled", () => {
    expect(() =>
      assertSameDatabaseTarget({ DATABASE_URL: LOCAL_IPV4, DIRECT_DATABASE_URL: REMOTE }),
    ).toThrow();
  });

  it("names both resolved hosts in the message, because the failure mode is not noticing", () => {
    expect(() =>
      assertSameDatabaseTarget({ DATABASE_URL: LOCAL, DIRECT_DATABASE_URL: REMOTE }),
    ).toThrow(/localhost/);
    expect(() =>
      assertSameDatabaseTarget({ DATABASE_URL: LOCAL, DIRECT_DATABASE_URL: REMOTE }),
    ).toThrow(/db\.prisma\.io/);
  });

  it("refuses to run against a connection string it cannot parse rather than guessing", () => {
    expect(() =>
      assertSameDatabaseTarget({ DATABASE_URL: "not a url", DIRECT_DATABASE_URL: REMOTE }),
    ).toThrow(/DATABASE_URL/);
  });
});
