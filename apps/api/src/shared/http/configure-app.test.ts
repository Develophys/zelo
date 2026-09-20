import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Controller, Delete, Get, HttpCode, Patch, Post, Put } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { configureApp } from "./configure-app.ts";

const ALLOWED = "https://www.zelohealth.app";
const FOREIGN = "https://dev.zelohealth.app";

@Controller("probe")
class ProbeController {
  @Get()
  read(): { ok: true } {
    return { ok: true };
  }

  @Post()
  @HttpCode(200)
  create(): { ok: true } {
    return { ok: true };
  }

  @Put()
  replace(): { ok: true } {
    return { ok: true };
  }

  @Patch()
  update(): { ok: true } {
    return { ok: true };
  }

  @Delete()
  remove(): { ok: true } {
    return { ok: true };
  }
}

describe("configureApp", () => {
  let app: INestApplication;

  beforeAll(async () => {
    vi.stubEnv("CORS_ALLOWED_ORIGINS", ALLOWED);
    const moduleRef = await Test.createTestingModule({ controllers: [ProbeController] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  const cookie = "manager_session=abc.def";

  it("answers a preflight from an allowed origin with credentials enabled and the origin echoed", async () => {
    const response = await request(app.getHttpServer())
      .options("/probe")
      .set("Origin", ALLOWED)
      .set("Access-Control-Request-Method", "POST");

    expect(response.headers["access-control-allow-origin"]).toBe(ALLOWED);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("does not grant CORS to an origin that is not in the list", async () => {
    const response = await request(app.getHttpServer())
      .options("/probe")
      .set("Origin", FOREIGN)
      .set("Access-Control-Request-Method", "POST");

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("keeps the security headers in front of everything", async () => {
    const response = await request(app.getHttpServer()).get("/probe");

    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  const stateChanging = [
    ["POST", () => request(app.getHttpServer()).post("/probe")],
    ["PUT", () => request(app.getHttpServer()).put("/probe")],
    ["PATCH", () => request(app.getHttpServer()).patch("/probe")],
    ["DELETE", () => request(app.getHttpServer()).delete("/probe")],
  ] as const;

  it.each(stateChanging)("allows a %s that carries a session cookie from an allowed origin", async (_method, send) => {
    const response = await send().set("Cookie", cookie).set("Origin", ALLOWED);

    expect(response.status).toBe(200);
  });

  it.each(stateChanging)("refuses a %s that carries a session cookie from a foreign origin with 403", async (_method, send) => {
    const response = await send().set("Cookie", cookie).set("Origin", FOREIGN);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ statusCode: 403, message: "Forbidden" });
  });

  it("refuses a state-changing request that carries a session cookie and no Origin header", async () => {
    const response = await request(app.getHttpServer()).post("/probe").set("Cookie", cookie);

    expect(response.status).toBe(403);
  });

  it("refuses when the cookie belongs to any of the three roles", async () => {
    for (const name of ["manager_session", "admin_session", "peer_partner_session"]) {
      const response = await request(app.getHttpServer()).post("/probe").set("Cookie", `${name}=x`).set("Origin", FOREIGN);
      expect(response.status, name).toBe(403);
    }
  });

  it("does not touch a state-changing request that has no session cookie, such as login or an anonymous check-in", async () => {
    const response = await request(app.getHttpServer()).post("/probe").set("Origin", FOREIGN);

    expect(response.status).toBe(200);
  });

  it("does not touch a request whose only cookies are unrelated to the session", async () => {
    const response = await request(app.getHttpServer()).post("/probe").set("Cookie", "theme=dark").set("Origin", FOREIGN);

    expect(response.status).toBe(200);
  });

  it("does not touch a GET, even from a foreign origin with a cookie", async () => {
    const response = await request(app.getHttpServer()).get("/probe").set("Cookie", cookie).set("Origin", FOREIGN);

    expect(response.status).toBe(200);
  });
});
