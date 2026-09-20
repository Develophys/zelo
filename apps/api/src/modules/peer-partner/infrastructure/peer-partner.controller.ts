import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import type { Request, Response } from "express";
import { LoginPeerPartnerUseCase, InvalidPeerPartnerCredentialsError } from "../application/use-cases/login-peer-partner.use-case.ts";
import { FinishPeerPartnerSetupUseCase, InvalidOrExpiredPeerPartnerSetupTokenError } from "../application/use-cases/finish-peer-partner-setup.use-case.ts";
import { RequestPeerPartnerPasswordResetUseCase } from "../application/use-cases/request-peer-partner-password-reset.use-case.ts";
import type { IssuedPeerPartnerToken } from "../application/services/peer-partner-token.service.ts";
import { PeerPartnerAuthGuard } from "./peer-partner-auth.guard.ts";
import { LoginThrottle } from "@/shared/http/throttling.js";
import { clearSessionCookie, setSessionCookie } from "@/shared/http/session-cookie.js";
import { passwordSchema } from "@zelo/domain";

const LoginRequestSchema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });
const FinishSetupRequestSchema = z.object({ token: z.string().min(1), password: passwordSchema });
const ForgotPasswordRequestSchema = z.object({ email: z.string().email().max(200) });

@Controller("peer-partner")
export class PeerPartnerController {
  constructor(
    @Inject(LoginPeerPartnerUseCase) private readonly loginPeerPartner: LoginPeerPartnerUseCase,
    @Inject(FinishPeerPartnerSetupUseCase) private readonly finishPeerPartnerSetup: FinishPeerPartnerSetupUseCase,
    @Inject(RequestPeerPartnerPasswordResetUseCase) private readonly requestPasswordReset: RequestPeerPartnerPasswordResetUseCase,
  ) {}

  @Post("login")
  @HttpCode(200)
  @LoginThrottle()
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response): Promise<IssuedPeerPartnerToken> {
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      const issued = await this.loginPeerPartner.execute(parsed.data.email, parsed.data.password);
      setSessionCookie(response, "peerPartner", issued.token);
      return issued;
    } catch (error) {
      if (error instanceof InvalidPeerPartnerCredentialsError) {
        throw new UnauthorizedException();
      }
      throw error;
    }
  }

  @Post("logout")
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: Response): void {
    clearSessionCookie(response, "peerPartner");
  }

  @Get("me")
  @UseGuards(PeerPartnerAuthGuard)
  me(@Req() request: Request): { name: string; specialty: string } {
    const peerPartner = request.peerPartner!;
    return { name: peerPartner.name, specialty: peerPartner.specialty };
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

  @Post("forgot-password")
  @HttpCode(200)
  // Stricter than the global 100/60s: this is the one unauthenticated route
  // that takes a bare email address, so it needs its own cooldown against
  // both inbox-spamming a specific target and brute-force email enumeration
  // (the handler itself never discloses whether the email matched anyone).
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  async forgotPassword(@Body() body: unknown): Promise<void> {
    const parsed = ForgotPasswordRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    await this.requestPasswordReset.execute(parsed.data.email);
  }
}
