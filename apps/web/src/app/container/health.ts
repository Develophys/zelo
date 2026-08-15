import { CheckApiHealthUseCase } from "@/use-cases/check-api-health.usecase";
import { HttpApiHealthAdapter } from "@/infrastructure/http/http-api-health.adapter";

export const checkApiHealthUseCase = new CheckApiHealthUseCase(new HttpApiHealthAdapter());
