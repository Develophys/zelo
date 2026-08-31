import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { PeerChatSocketClient } from "@/infrastructure/websocket/peer-chat-socket.client";
import type { PeerChatMessage } from "@/presentation/components/PeerChatRoom";

// "error" is load-bearing: without a member for it the union could not express
// a failed or dropped socket, so the UI had no state to render one from.
export type PeerPartnerConnectionState =
  | "connecting"
  | "idle"
  | "incoming_request"
  | "matched"
  | "error";
const ACCEPT_TIMEOUT_SECONDS = 30;

export function usePeerPartnerConnection(token: string | null) {
  const [state, setState] = useState<PeerPartnerConnectionState>("connecting");
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const [incomingRequest, setIncomingRequest] = useState<{ requestId: string; sectorName?: string } | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(ACCEPT_TIMEOUT_SECONDS);
  const [messages, setMessages] = useState<PeerChatMessage[]>([]);
  const [peerLeft, setPeerLeft] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearCountdown = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = null;
  }, []);

  useEffect(() => {
    if (!token) return;

    const client = new PeerChatSocketClient();
    const socket = client.connect(token);
    socketRef.current = socket;
    setState("connecting");

    // Availability is reported by the socket, not assumed at mount. Optimistic
    // "idle" told a volunteer they were on duty while the connection was dead,
    // so a doctor's request would go unanswered with nobody aware of it.
    socket.on("connect", () => setState("idle"));
    socket.on("connect_error", () => setState("error"));
    socket.on("disconnect", () => setState("error"));

    socket.on("incoming_request", (payload: { requestId: string; sectorName?: string }) => {
      setIncomingRequest(payload);
      setState("incoming_request");
      setSecondsRemaining(ACCEPT_TIMEOUT_SECONDS);
      clearCountdown();
      countdownRef.current = setInterval(() => {
        setSecondsRemaining((prev) => Math.max(0, prev - 1));
      }, 1000);
    });

    socket.on("matched", (payload: { requestId: string }) => {
      clearCountdown();
      requestIdRef.current = payload.requestId;
      setIncomingRequest(null);
      setMessages([]);
      setPeerLeft(false);
      setState("matched");
    });

    socket.on("message", (payload: { text: string }) => {
      setMessages((prev) => [...prev, { from: "peer", text: payload.text }]);
    });

    socket.on("peer_left", () => setPeerLeft(true));

    return () => {
      clearCountdown();
      client.disconnect();
    };
  }, [token, clearCountdown, reconnectNonce]);

  const reconnect = useCallback(() => {
    setState("connecting");
    setReconnectNonce((nonce) => nonce + 1);
  }, []);

  const accept = useCallback(() => {
    if (!incomingRequest) return;
    socketRef.current?.emit("accept_request", { requestId: incomingRequest.requestId });
  }, [incomingRequest]);

  const decline = useCallback(() => {
    if (!incomingRequest) return;
    socketRef.current?.emit("decline_request", { requestId: incomingRequest.requestId });
    clearCountdown();
    setIncomingRequest(null);
    setState("idle");
  }, [incomingRequest, clearCountdown]);

  const sendMessage = useCallback((text: string) => {
    if (!requestIdRef.current) return;
    socketRef.current?.emit("message", { requestId: requestIdRef.current, text });
    setMessages((prev) => [...prev, { from: "me", text }]);
  }, []);

  const leave = useCallback(() => {
    if (requestIdRef.current) {
      socketRef.current?.emit("leave_conversation", { requestId: requestIdRef.current });
    }
    requestIdRef.current = null;
    setMessages([]);
    setPeerLeft(false);
    setState("idle");
  }, []);

  return { state, incomingRequest, secondsRemaining, messages, peerLeft, accept, decline, sendMessage, leave, reconnect };
}
