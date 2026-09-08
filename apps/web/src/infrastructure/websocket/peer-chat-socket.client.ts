import { io, type Socket } from "socket.io-client";
import { API_BASE_URL } from '../http/api-base-url';


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
