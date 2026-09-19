import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule } from "@nestjs/throttler";
import { validateEnv } from "./shared/config/env.validation.ts";
import { ClientAddressThrottlerGuard, THROTTLER_OPTIONS } from "./shared/http/throttling.ts";
import { PrismaModule } from "./shared/prisma/prisma.module.ts";
import { HealthModule } from "./modules/health/health.module.ts";
import { ChatModule } from "./modules/chat/chat.module.ts";
import { AssessmentModule } from "./modules/assessment/assessment.module.ts";
import { ManagerModule } from "./modules/manager/manager.module.ts";
import { PeerPartnerModule } from "./modules/peer-partner/peer-partner.module.ts";
import { InstitutionModule } from "./modules/institution/institution.module.ts";
import { SignalCheckinModule } from "./modules/signal-checkin/signal-checkin.module.ts";
import { AdminModule } from "./modules/admin/admin.module.ts";
import { PeerChatModule } from "./modules/peer-chat/peer-chat.module.ts";
import { NotificationModule } from "./modules/notification/notification.module.ts";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot(THROTTLER_OPTIONS),
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
    ChatModule,
    AssessmentModule,
    ManagerModule,
    PeerPartnerModule,
    InstitutionModule,
    SignalCheckinModule,
    AdminModule,
    PeerChatModule,
    NotificationModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ClientAddressThrottlerGuard }],
})
export class AppModule {}
