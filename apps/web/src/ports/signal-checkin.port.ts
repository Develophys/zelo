export interface SignalCheckinParams {
  institutionId: string;
  sectorId: string;
  deviceSignalId: string;
  concerning: boolean;
}

export interface SignalAbandonmentParams {
  institutionId: string;
  sectorId: string;
  deviceSignalId: string;
}

export interface SignalChatDraftParams {
  institutionId: string;
  sectorId: string;
  deviceSignalId: string;
}

export interface SignalFollowUpParams {
  institutionId: string;
  sectorId: string;
  deviceSignalId: string;
  event: "sent" | "answered";
}

export interface SignalCheckinPort {
  checkin(params: SignalCheckinParams): Promise<void>;
  abandon(params: SignalAbandonmentParams): Promise<void>;
  chatDraft(params: SignalChatDraftParams): Promise<void>;
  followUp(params: SignalFollowUpParams): Promise<void>;
}
