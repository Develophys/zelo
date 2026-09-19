import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import request from "supertest";
import { ClientAddressThrottlerGuard, LoginThrottle, THROTTLER_OPTIONS } from "./throttling.ts";

@Controller()
class ProbeController {
  @Post("login")
  @HttpCode(200)
  @LoginThrottle()
  login(@Body() _body: unknown): { ok: true } {
    return { ok: true };
  }

  @Get("open")
  open(): { ok: true } {
    return { ok: true };
  }
}

describe("request throttling", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot(THROTTLER_OPTIONS)],
      controllers: [ProbeController],
      providers: [{ provide: APP_GUARD, useClass: ClientAddressThrottlerGuard }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function login(ip: string, email: unknown) {
    return request(app.getHttpServer()).post("/login").set("Fly-Client-IP", ip).send({ email, password: "irrelevant" });
  }

  it("allows five attempts on one account from one address and blocks the sixth", async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect((await login("198.51.100.1", "ana@zelo-demo.local")).status).toBe(200);
    }

    expect((await login("198.51.100.1", "ana@zelo-demo.local")).status).toBe(429);
  });

  it("counts the same account across letter case and surrounding spaces", async () => {
    await login("198.51.100.2", "Bia@Zelo-Demo.local");
    await login("198.51.100.2", " bia@zelo-demo.local ");
    await login("198.51.100.2", "BIA@ZELO-DEMO.LOCAL");
    await login("198.51.100.2", "bia@zelo-demo.local");
    await login("198.51.100.2", "bia@zelo-demo.local");

    expect((await login("198.51.100.2", "bia@zelo-demo.local")).status).toBe(429);
  });

  it("does not let a blocked account lock out a colleague behind the same address", async () => {
    for (let attempt = 1; attempt <= 6; attempt += 1) await login("198.51.100.3", "carla@zelo-demo.local");

    expect((await login("198.51.100.3", "davi@zelo-demo.local")).status).toBe(200);
  });

  it("does not let a blocked address lock out the same account from another address", async () => {
    for (let attempt = 1; attempt <= 6; attempt += 1) await login("198.51.100.4", "eva@zelo-demo.local");

    expect((await login("198.51.100.5", "eva@zelo-demo.local")).status).toBe(200);
  });

  it("caps the total login attempts one address can make across different accounts", async () => {
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      expect((await login("198.51.100.6", `user-${attempt}@zelo-demo.local`)).status).toBe(200);
    }

    expect((await login("198.51.100.6", "user-21@zelo-demo.local")).status).toBe(429);
    expect((await login("198.51.100.7", "user-1@zelo-demo.local")).status).toBe(200);
  });

  it.each([
    ["a missing email", "198.51.100.8", undefined],
    ["a non-string email", "198.51.100.14", { not: "a string" }],
  ])("still throttles by address when the body has %s, without throwing", async (_label, ip, email) => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect((await login(ip, email)).status).toBe(200);
    }

    expect((await login(ip, email)).status).toBe(429);
  });

  it("keys on the real client address rather than the socket address, which behind Fly's proxy is shared", async () => {
    for (let attempt = 1; attempt <= 6; attempt += 1) await login("198.51.100.9", "fabio@zelo-demo.local");

    expect((await login("198.51.100.10", "fabio@zelo-demo.local")).status).toBe(200);
  });

  it("falls back to the socket address when Fly-Client-IP is absent", async () => {
    const send = () => request(app.getHttpServer()).post("/login").send({ email: "gil@zelo-demo.local", password: "x" });
    for (let attempt = 1; attempt <= 5; attempt += 1) expect((await send()).status).toBe(200);

    expect((await send()).status).toBe(429);
  });

  it("leaves routes without the login decorator on the global budget only", async () => {
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      expect((await request(app.getHttpServer()).get("/open").set("Fly-Client-IP", "198.51.100.11")).status).toBe(200);
    }
  });

  it("gives each client address its own global budget", async () => {
    for (let attempt = 1; attempt <= 100; attempt += 1) {
      await request(app.getHttpServer()).get("/open").set("Fly-Client-IP", "198.51.100.12");
    }

    expect((await request(app.getHttpServer()).get("/open").set("Fly-Client-IP", "198.51.100.12")).status).toBe(429);
    expect((await request(app.getHttpServer()).get("/open").set("Fly-Client-IP", "198.51.100.13")).status).toBe(200);
  });
});
