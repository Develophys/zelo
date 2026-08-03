import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { validateEnv } from "./shared/config/env.validation.ts";
import { PrismaModule } from "./shared/prisma/prisma.module.ts";
import { HealthModule } from "./modules/health/health.module.ts";
import { ChatModule } from "./modules/chat/chat.module.ts";
import { AssessmentModule } from "./modules/assessment/assessment.module.ts";
import { ManagerModule } from "./modules/manager/manager.module.ts";
import { InstitutionModule } from "./modules/institution/institution.module.ts";
import { SignalCheckinModule } from "./modules/signal-checkin/signal-checkin.module.ts";
import { AdminModule } from "./modules/admin/admin.module.ts";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Global rate limit — 100 requests/60s per IP. Guards every endpoint, including
    // POST /manager/login, which (correctly, per its timing-safety fix) now runs a real
    // scrypt hash on every request, valid or not. Without a cap, that's an easy CPU-flood
    // target on a small deployment. 100/min is generous enough not to trip normal usage
    // or the existing test suite while still bounding worst-case throughput.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    HealthModule,
    ChatModule,
    AssessmentModule,
    ManagerModule,
    InstitutionModule,
    SignalCheckinModule,
    AdminModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
