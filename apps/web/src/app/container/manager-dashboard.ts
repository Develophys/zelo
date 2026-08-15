import { GetManagerSignalsUseCase } from "@/use-cases/get-manager-signals.usecase";
import { HttpManagerSignalsAdapter } from "@/infrastructure/http/http-manager-signals.adapter";
import { GenerateManagerInsightUseCase } from "@/use-cases/generate-manager-insight.usecase";
import { HttpManagerInsightAdapter } from "@/infrastructure/http/http-manager-insight.adapter";
import { GetManagerInsightHistoryUseCase } from "@/use-cases/get-manager-insight-history.usecase";
import { HttpManagerInsightHistoryAdapter } from "@/infrastructure/http/http-manager-insight-history.adapter";
import { ListAccessibleSectorsUseCase } from "@/use-cases/list-accessible-sectors.usecase";
import { HttpManagerSectorsAdapter } from "@/infrastructure/http/http-manager-sectors.adapter";

export const getManagerSignalsUseCase = new GetManagerSignalsUseCase(new HttpManagerSignalsAdapter());
export const generateManagerInsightUseCase = new GenerateManagerInsightUseCase(new HttpManagerInsightAdapter());
export const getManagerInsightHistoryUseCase = new GetManagerInsightHistoryUseCase(
  new HttpManagerInsightHistoryAdapter(),
);
export const listAccessibleSectorsUseCase = new ListAccessibleSectorsUseCase(new HttpManagerSectorsAdapter());
