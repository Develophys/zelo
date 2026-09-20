import { describe, expect, it } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { PeerPartnerAuthGuard } from "./peer-partner-auth.guard.ts";
import { PeerPartnerTokenService } from "../application/services/peer-partner-token.service.ts";
import type { PeerPartnerRepository, PeerPartnerRow } from "../application/ports/peer-partner-repository.port.ts";

class FakePeerPartnerRepository implements PeerPartnerRepository {
  rows: PeerPartnerRow[] = [];
  async findByEmail(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
  }
  async findBySetPasswordToken(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
  }
  async findById(id: string): Promise<PeerPartnerRow | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }
  async findAllByInstitution(): Promise<never> {
    throw new Error("not used in this test");
  }
  async create(): Promise<never> {
    throw new Error("not used in this test");
  }
  async update(): Promise<void> {
    throw new Error("not used in this test");
  }
  async findLapsedInvites(): Promise<never> {
    throw new Error("not used in this test");
  }
  async delete(): Promise<never> {
    throw new Error("not used in this test");
  }
}

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

function contextWith(headers: { authorization?: string; cookie?: string }): { context: ExecutionContext; request: Partial<Request> } {
  const request: Partial<Request> = { headers: headers as Request["headers"] };
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  return { context, request };
}

function peerPartnerRow(overrides: Partial<PeerPartnerRow> = {}): PeerPartnerRow {
  return {
    id: "peer-1",
    name: "Dra. Ana",
    email: "ana@zelo-demo.local",
    passwordHash: "hash",
    setPasswordTokenExpiresAt: null,
    institutionId: "institution-1",
    specialty: "Clínica médica",
    isActive: true,
    ...overrides,
  };
}

describe("PeerPartnerAuthGuard", () => {
  const tokenService = new PeerPartnerTokenService(fakeConfig("test-secret"));

  function buildGuard(rows: PeerPartnerRow[]): PeerPartnerAuthGuard {
    const repository = new FakePeerPartnerRepository();
    repository.rows = rows;
    return new PeerPartnerAuthGuard(tokenService, repository);
  }

  it("allows a valid token in the peer_partner_session cookie and attaches the peer partner, including specialty", async () => {
    const guard = buildGuard([peerPartnerRow()]);
    const { token } = tokenService.issue("peer-1", "Dra. Ana", "institution-1");
    const { context, request } = contextWith({ cookie: `peer_partner_session=${token}` });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.peerPartner).toEqual({ id: "peer-1", name: "Dra. Ana", institutionId: "institution-1", specialty: "Clínica médica" });
  });

  it("still allows a valid Bearer token while the migration is in progress", async () => {
    const guard = buildGuard([peerPartnerRow()]);
    const { token } = tokenService.issue("peer-1", "Dra. Ana", "institution-1");
    const { context } = contextWith({ authorization: `Bearer ${token}` });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("rejects a request with no session", async () => {
    const guard = buildGuard([peerPartnerRow()]);
    const { context } = contextWith({});

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a malformed or tampered token", async () => {
    const guard = buildGuard([peerPartnerRow()]);
    const { context } = contextWith({ cookie: "peer_partner_session=not-a-real-token" });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("does not let a Bearer header rescue a cookie that is present but invalid", async () => {
    const guard = buildGuard([peerPartnerRow()]);
    const { token } = tokenService.issue("peer-1", "Dra. Ana", "institution-1");
    const { context } = contextWith({ cookie: "peer_partner_session=forged.token", authorization: `Bearer ${token}` });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a still-valid token whose peer partner has since been deactivated", async () => {
    const guard = buildGuard([peerPartnerRow({ isActive: false })]);
    const { token } = tokenService.issue("peer-1", "Dra. Ana", "institution-1");
    const { context } = contextWith({ cookie: `peer_partner_session=${token}` });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a still-valid token whose peer partner row no longer exists", async () => {
    const guard = buildGuard([]);
    const { token } = tokenService.issue("peer-1", "Dra. Ana", "institution-1");
    const { context } = contextWith({ cookie: `peer_partner_session=${token}` });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});
