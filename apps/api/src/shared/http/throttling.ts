import { SetMetadata } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { ThrottlerOptions } from "@nestjs/throttler";
import { resolveClientAddress } from "./client-address.ts";

export const LOGIN_THROTTLE_KEY = "zelo:login-throttle";

export const LoginThrottle = () => SetMetadata(LOGIN_THROTTLE_KEY, true);

const FIFTEEN_MINUTES_MS = 900_000;
const MAX_EMAIL_LENGTH = 200;

function isNotLoginRoute(context: ExecutionContext): boolean {
  return Reflect.getMetadata(LOGIN_THROTTLE_KEY, context.getHandler()) !== true;
}

interface ThrottledRequest {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  body?: { email?: unknown } | null;
}

function clientAddressOf(req: ThrottledRequest): string {
  return resolveClientAddress(req.headers, req.ip);
}

function accountTracker(req: ThrottledRequest): string {
  const email = req.body?.email;
  const account = typeof email === "string" ? email.trim().toLowerCase().slice(0, MAX_EMAIL_LENGTH) : "";
  return `${clientAddressOf(req)}:${account}`;
}

export const THROTTLER_OPTIONS: ThrottlerOptions[] = [
  { ttl: 60_000, limit: 100 },
  { name: "login-address", ttl: FIFTEEN_MINUTES_MS, limit: 20, skipIf: isNotLoginRoute },
  { name: "login-account", ttl: FIFTEEN_MINUTES_MS, limit: 5, skipIf: isNotLoginRoute, getTracker: accountTracker },
];

export class ClientAddressThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: ThrottledRequest): Promise<string> {
    return clientAddressOf(req);
  }
}
