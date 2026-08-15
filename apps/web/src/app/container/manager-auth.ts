import { LoginManagerUseCase } from "@/use-cases/login-manager.usecase";
import { FinishManagerSetupUseCase } from "@/use-cases/finish-manager-setup.usecase";
import { HttpManagerAuthAdapter } from "@/infrastructure/http/http-manager-auth.adapter";

const managerAuthAdapter = new HttpManagerAuthAdapter();
export const loginManagerUseCase = new LoginManagerUseCase(managerAuthAdapter);
export const finishManagerSetupUseCase = new FinishManagerSetupUseCase(managerAuthAdapter);
