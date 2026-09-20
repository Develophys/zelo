import type { INestApplication } from "@nestjs/common";
import { resolveAllowedOrigins } from "./allowed-origins.ts";
import { originCheck } from "./origin-check.ts";
import { securityHeaders } from "./security-headers.ts";

export function configureApp(app: INestApplication): void {
  const allowedOrigins = resolveAllowedOrigins();
  app.use(securityHeaders());

  // Frontend and backend are never same-origin: local dev runs them on separate
  // ports (5173/3000, or 8080/3000 under docker-compose), and the real deployment
  // splits them across Vercel and Fly.io. Without CORS, every browser-issued
  // fetch() to this API — health check, chat, assessment submission, manager
  // login/signals — is silently blocked by the browser before this app ever sees
  // the request. CORS_ALLOWED_ORIGINS lets a real deployment lock this down to
  // its actual frontend domain(s); the defaults cover both local dev entry points.
  app.enableCors({ origin: allowedOrigins, credentials: true });
  app.use(originCheck(allowedOrigins));
}
