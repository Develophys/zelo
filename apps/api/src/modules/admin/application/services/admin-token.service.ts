import { createHmac, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeStringEqual } from "./timing-safe-equal.ts";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

export interface IssuedAdminToken {
  token: string;
  expiresAt: string;
}

export interface DecodedAdminToken {
  adminId: string;
  adminName: string;
}

interface TokenPayload {
  sessionId: string;
  adminId: string;
  adminName: string;
  expiresAtEpoch: number;
}

@Injectable()
export class AdminTokenService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  issue(adminId: string, adminName: string): IssuedAdminToken {
    const sessionId = randomUUID();
    const expiresAtEpoch = Date.now() + SESSION_DURATION_MS;
    const payload: TokenPayload = { sessionId, adminId, adminName, expiresAtEpoch };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = this.sign(payloadB64);

    return { token: `${payloadB64}.${signature}`, expiresAt: new Date(expiresAtEpoch).toISOString() };
  }

  verify(token: string): DecodedAdminToken | null {
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

    if (typeof payload.adminId !== "string" || typeof payload.adminName !== "string" || !Number.isFinite(payload.expiresAtEpoch)) {
      return null;
    }

    if (Date.now() >= payload.expiresAtEpoch) return null;

    return { adminId: payload.adminId, adminName: payload.adminName };
  }

  private sign(payloadB64: string): string {
    return createHmac("sha256", this.config.getOrThrow<string>("ADMIN_TOKEN_SECRET"))
      .update(payloadB64)
      .digest("base64url");
  }
}
