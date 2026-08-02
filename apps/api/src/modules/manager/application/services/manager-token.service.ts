import { createHmac, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeStringEqual } from "./timing-safe-equal.ts";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

export interface IssuedManagerToken {
  token: string;
  expiresAt: string;
}

export interface DecodedManagerToken {
  managerId: string;
  managerName: string;
  institutionId: string;
}

interface TokenPayload {
  sessionId: string;
  managerId: string;
  managerName: string;
  institutionId: string;
  expiresAtEpoch: number;
}

@Injectable()
export class ManagerTokenService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  issue(managerId: string, managerName: string, institutionId: string): IssuedManagerToken {
    const sessionId = randomUUID();
    const expiresAtEpoch = Date.now() + SESSION_DURATION_MS;
    const payload: TokenPayload = { sessionId, managerId, managerName, institutionId, expiresAtEpoch };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = this.sign(payloadB64);

    return { token: `${payloadB64}.${signature}`, expiresAt: new Date(expiresAtEpoch).toISOString() };
  }

  verify(token: string): DecodedManagerToken | null {
    const [payloadB64, signature] = token.split(".");
    if (!payloadB64 || !signature) return null;

    const expectedSignature = this.sign(payloadB64);
    if (!timingSafeStringEqual(signature, expectedSignature)) return null;

    let payload: TokenPayload;
    try {
      payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
    } catch {
      return null;
    }

    if (
      typeof payload.managerId !== "string" ||
      typeof payload.managerName !== "string" ||
      typeof payload.institutionId !== "string" ||
      !Number.isFinite(payload.expiresAtEpoch)
    ) {
      return null;
    }

    if (Date.now() >= payload.expiresAtEpoch) return null;

    return { managerId: payload.managerId, managerName: payload.managerName, institutionId: payload.institutionId };
  }

  private sign(payloadB64: string): string {
    return createHmac("sha256", this.config.getOrThrow<string>("MANAGER_TOKEN_SECRET"))
      .update(payloadB64)
      .digest("base64url");
  }
}
