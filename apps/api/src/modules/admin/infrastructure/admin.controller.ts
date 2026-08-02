import { BadRequestException, Body, Controller, HttpCode, Inject, Post, UnauthorizedException } from "@nestjs/common";
import { z } from "zod";
import { LoginAdminUseCase, InvalidAdminCredentialsError } from "../application/use-cases/login-admin.use-case.ts";
import type { IssuedAdminToken } from "../application/services/admin-token.service.ts";

const LoginRequestSchema = z.object({ name: z.string().min(1).max(200), password: z.string().min(1).max(200) });

@Controller("admin")
export class AdminController {
  constructor(@Inject(LoginAdminUseCase) private readonly loginAdmin: LoginAdminUseCase) {}

  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown): Promise<IssuedAdminToken> {
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    try {
      return await this.loginAdmin.execute(parsed.data.name, parsed.data.password);
    } catch (error) {
      if (error instanceof InvalidAdminCredentialsError) {
        throw new UnauthorizedException();
      }
      throw error;
    }
  }
}
