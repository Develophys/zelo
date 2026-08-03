import { io, type Socket } from "socket.io-client";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export class PeerChatSocketClient {
  private socket: Socket | null = null;

  connect(token?: string): Socket {
    this.socket = io(API_BASE_URL, token ? { auth: { token } } : {});
    return this.socket;
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }
}
