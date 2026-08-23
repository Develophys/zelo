import { Module } from "@nestjs/common";
import { SignalCheckinController } from "./infrastructure/signal-checkin.controller.ts";
import { RecordSignalCheckinUseCase } from "./application/use-cases/record-signal-checkin.use-case.ts";
import { PrismaSignalCheckinRepository } from "./infrastructure/persistence/prisma-signal-checkin.repository.ts";
import { SIGNAL_CHECKIN_REPOSITORY } from "./application/ports/signal-checkin-repository.port.ts";
import { NotificationModule } from "../notification/notification.module.ts";

@Module({
  imports: [NotificationModule],
  controllers: [SignalCheckinController],
  providers: [
    RecordSignalCheckinUseCase,
    { provide: SIGNAL_CHECKIN_REPOSITORY, useClass: PrismaSignalCheckinRepository },
  ],
})
export class SignalCheckinModule {}
