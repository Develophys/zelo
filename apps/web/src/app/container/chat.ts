import { AnonymizeTextUseCase } from "@/use-cases/anonymize-text.usecase";
import { SendChatMessageUseCase } from "@/use-cases/send-chat-message.usecase";
import { HttpChatGatewayAdapter } from "@/infrastructure/http/http-chat-gateway.adapter";
import { RequestHumanHandoffUseCase } from "@/use-cases/request-human-handoff.usecase";

export const sendChatMessageUseCase = new SendChatMessageUseCase(
  new HttpChatGatewayAdapter(),
  new AnonymizeTextUseCase(),
);
export const requestHumanHandoffUseCase = new RequestHumanHandoffUseCase();
