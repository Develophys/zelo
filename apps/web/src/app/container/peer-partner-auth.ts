import { LoginPeerPartnerUseCase } from "@/use-cases/login-peer-partner.usecase";
import { FinishPeerPartnerSetupUseCase } from "@/use-cases/finish-peer-partner-setup.usecase";
import { RequestPeerPartnerPasswordResetUseCase } from "@/use-cases/request-peer-partner-password-reset.usecase";
import { HttpPeerPartnerAuthAdapter } from "@/infrastructure/http/http-peer-partner-auth.adapter";

const peerPartnerAuthAdapter = new HttpPeerPartnerAuthAdapter();
export const loginPeerPartnerUseCase = new LoginPeerPartnerUseCase(peerPartnerAuthAdapter);
export const finishPeerPartnerSetupUseCase = new FinishPeerPartnerSetupUseCase(peerPartnerAuthAdapter);
export const requestPeerPartnerPasswordResetUseCase = new RequestPeerPartnerPasswordResetUseCase(peerPartnerAuthAdapter);
