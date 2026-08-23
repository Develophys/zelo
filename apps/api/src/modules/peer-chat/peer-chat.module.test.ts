import { describe, expect, it } from "vitest";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { PeerChatModule } from "./peer-chat.module.ts";
import { PeerChatGateway } from "./infrastructure/peer-chat.gateway.ts";
import { PEER_PARTNER_REPOSITORY, type PeerPartnerRepository } from "../peer-partner/application/ports/peer-partner-repository.port.ts";
import { NOTIFICATION_PUBLISHER, type NotificationEvent, type NotificationPublisher } from "../notification/application/ports/notification.port.ts";
import { PrismaService } from "../../shared/prisma/prisma.service.ts";
import { PrismaModule } from "../../shared/prisma/prisma.module.ts";

// Only the Prisma-backed repository is stubbed out here (it would otherwise need a
// live database); PeerChatGateway itself is deliberately NOT mocked, because the
// point of this test is to boot the gateway through a real Nest container.
//
// Every other peer-chat test constructs the gateway with `new PeerChatGateway(...)`
// or substitutes it with `useValue`, and neither path runs Nest's gateway-connection
// machinery — a `useValue` provider has no metatype, so `connectAllGateways` skips it.
// That machinery is what lazily loads the websocket driver package
// (@nestjs/platform-socket.io) and calls `process.exit(1)` when it is missing, which
// takes down the whole API process at boot, not just the gateway. This test is the
// one place that exercises it, so a missing/incompatible driver fails loudly here.
const fakeNotificationPublisher: NotificationPublisher = {
  async publish(_event: NotificationEvent): Promise<void> {},
};

const fakePeerPartnerRepository: PeerPartnerRepository = {
  async findByEmail() {
    return null;
  },
  async findBySetPasswordToken() {
    return null;
  },
  async findById() {
    return null;
  },
  async findAllByInstitution() {
    return [];
  },
  async create() {
    throw new Error("not used in this test");
  },
  async update() {
    throw new Error("not used in this test");
  },
  async findLapsedInvites() {
    throw new Error("not used in this test");
  },
  async delete() {
    throw new Error("not used in this test");
  },
};

describe("PeerChatModule bootstrap", () => {
  it("boots a real Nest application with the websocket gateway connected", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), PrismaModule, PeerChatModule],
    })
      .overrideProvider(PEER_PARTNER_REPOSITORY)
      .useValue(fakePeerPartnerRepository)
      .overrideProvider(NOTIFICATION_PUBLISHER)
      .useValue(fakeNotificationPublisher)
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    const app = moduleRef.createNestApplication();

    await app.init();

    expect(app.get(PeerChatGateway)).toBeInstanceOf(PeerChatGateway);
    await app.close();
  });
});
