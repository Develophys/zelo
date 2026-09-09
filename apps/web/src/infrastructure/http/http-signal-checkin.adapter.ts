import type { SignalAbandonmentParams, SignalCheckinParams, SignalCheckinPort } from "@/ports/signal-checkin.port";
import { API_BASE_URL } from './api-base-url';

export class HttpSignalCheckinAdapter implements SignalCheckinPort {
  async checkin(params: SignalCheckinParams): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/signals/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`signal checkin failed with status ${response.status}`);
    }
  }

  async abandon(params: SignalAbandonmentParams): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/signals/abandon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`signal abandonment failed with status ${response.status}`);
    }
  }
}
