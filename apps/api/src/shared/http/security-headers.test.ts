import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Controller, Get } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { securityHeaders } from "./security-headers.ts";

@Controller()
class ProbeController {
  @Get("probe")
  probe(): { ok: true } {
    return { ok: true };
  }
}

describe("API security headers", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [ProbeController] }).compile();
    app = moduleRef.createNestApplication();
    app.use(securityHeaders());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("stops advertising the framework", async () => {
    const response = await request(app.getHttpServer()).get("/probe");

    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("forbids sniffing, framing and any resource loading from an API response", async () => {
    const response = await request(app.getHttpServer()).get("/probe");

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["content-security-policy"]).toBe("default-src 'none';frame-ancestors 'none'");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("pins HTTPS for two years, without covering subdomains it does not own", async () => {
    const response = await request(app.getHttpServer()).get("/probe");

    expect(response.headers["strict-transport-security"]).toBe("max-age=63072000");
  });

  it("does not disturb the response body", async () => {
    const response = await request(app.getHttpServer()).get("/probe");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});
