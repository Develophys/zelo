import type { INestApplication } from "@nestjs/common";
import { resolveAllowedOrigins } from "./allowed-origins.ts";
import { originCheck } from "./origin-check.ts";
import { securityHeaders } from "./security-headers.ts";

export function configureApp(app: INestApplication): void {
  const allowedOrigins = resolveAllowedOrigins();
  app.use(securityHeaders());
  app.enableCors({ origin: allowedOrigins, credentials: true });
  app.use(originCheck(allowedOrigins));
}
