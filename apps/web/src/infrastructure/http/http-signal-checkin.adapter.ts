import type { SignalCheckinParams, SignalCheckinPort } from "@/ports/signal-checkin.port";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

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
}
