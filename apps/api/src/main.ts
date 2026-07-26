import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.ts";

// Frontend and backend are never same-origin: local dev runs them on separate
// ports (5173/3000, or 8080/3000 under docker-compose), and the real deployment
// splits them across Vercel and Fly.io. Without CORS, every browser-issued
// fetch() to this API — health check, chat, assessment submission, manager
// login/signals — is silently blocked by the browser before this app ever sees
// the request. CORS_ALLOWED_ORIGINS lets a real deployment lock this down to
// its actual frontend domain(s); the defaults cover both local dev entry points.
const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173", "http://localhost:8080"];

function resolveAllowedOrigins(): string[] {
  const configured = process.env.CORS_ALLOWED_ORIGINS;
  if (!configured) return DEFAULT_ALLOWED_ORIGINS;
  return configured.split(",").map((origin) => origin.trim()).filter((origin) => origin.length > 0);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: resolveAllowedOrigins() });
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Zelo API listening on port ${port}`);
}

bootstrap();
