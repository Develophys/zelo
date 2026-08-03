import { BadRequestException, Body, Controller, HttpCode, Inject, Post, UnauthorizedException } from "@nestjs/common";
import { z } from "zod";
import { LoginPeerPartnerUseCase, InvalidPeerPartnerCredentialsError } from "../application/use-cases/login-peer-partner.use-case.ts";
import { FinishPeerPartnerSetupUseCase, InvalidOrExpiredPeerPartnerSetupTokenError } from "../application/use-cases/finish-peer-partner-setup.use-case.ts";
import type { IssuedPeerPartnerToken } from "../application/services/peer-partner-token.service.ts";

const LoginRequestSchema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });
const FinishSetupRequestSchema = z.object({ token: z.string().min(1), password: z.string().min(8).max(200) });

@Controller("peer-partner")
export class PeerPartnerController {
  constructor(
    @Inject(LoginPeerPartnerUseCase) private readonly loginPeerPartner: LoginPeerPartnerUseCase,
    @Inject(FinishPeerPartnerSetupUseCase) private readonly finishPeerPartnerSetup: FinishPeerPartnerSetupUseCase,
  ) {}

  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown): Promise<IssuedPeerPartnerToken> {
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      return await this.loginPeerPartner.execute(parsed.data.email, parsed.data.password);
    } catch (error) {
      if (error instanceof InvalidPeerPartnerCredentialsError) {
        throw new UnauthorizedException();
      }
      throw error;
    }
  }

  @Post("finish-setup")
  @HttpCode(200)
  async finishSetup(@Body() body: unknown): Promise<void> {
    const parsed = FinishSetupRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      await this.finishPeerPartnerSetup.execute(parsed.data);
    } catch (error) {
      if (error instanceof InvalidOrExpiredPeerPartnerSetupTokenError) {
        throw new UnauthorizedException();
      }
      throw error;
    }
  }
}
