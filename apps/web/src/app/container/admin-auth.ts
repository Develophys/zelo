import { LoginAdminUseCase } from "@/use-cases/login-admin.usecase";
import { HttpAdminAuthAdapter } from "@/infrastructure/http/http-admin-auth.adapter";

export const loginAdminUseCase = new LoginAdminUseCase(new HttpAdminAuthAdapter());
