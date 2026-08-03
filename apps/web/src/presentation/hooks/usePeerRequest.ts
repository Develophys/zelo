import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { PeerChatSocketClient } from "@/infrastructure/websocket/peer-chat-socket.client";
import type { PeerChatMessage } from "@/presentation/components/PeerChatRoom";

export type PeerRequestState = "idle" | "searching" | "matched" | "no_peer_available";

export function usePeerRequest() {
  const [state, setState] = useState<PeerRequestState>("idle");
  const [specialty, setSpecialty] = useState<string | null>(null);
  const [messages, setMessages] = useState<PeerChatMessage[]>([]);
  const [peerLeft, setPeerLeft] = useState(false);

  const clientRef = useRef<PeerChatSocketClient | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const requestIdRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
    };
  }, []);

  const requestPeer = useCallback((institutionId: string, sectorName?: string) => {
    clientRef.current?.disconnect();

    setState("searching");
    setMessages([]);
    setPeerLeft(false);

    const client = new PeerChatSocketClient();
    clientRef.current = client;
    const socket = client.connect();
    socketRef.current = socket;

    socket.on("no_peer_available", () => setState("no_peer_available"));
    socket.on("matched", (payload: { requestId: string; specialty: string }) => {
      requestIdRef.current = payload.requestId;
      setSpecialty(payload.specialty);
      setState("matched");
    });
    socket.on("message", (payload: { text: string }) => {
      setMessages((prev) => [...prev, { from: "peer", text: payload.text }]);
    });
    socket.on("peer_left", () => setPeerLeft(true));

    socket.emit("request-peer", { institutionId, sectorName });
  }, []);

  const sendMessage = useCallback((text: string) => {
    if (!requestIdRef.current) return;
    socketRef.current?.emit("message", { requestId: requestIdRef.current, text });
    setMessages((prev) => [...prev, { from: "me", text }]);
  }, []);

  const leave = useCallback(() => {
    if (requestIdRef.current) {
      socketRef.current?.emit("leave_conversation", { requestId: requestIdRef.current });
    }
    clientRef.current?.disconnect();
    clientRef.current = null;
    socketRef.current = null;
    requestIdRef.current = null;
    setState("idle");
    setSpecialty(null);
    setMessages([]);
    setPeerLeft(false);
  }, []);

  return { state, specialty, messages, peerLeft, requestPeer, sendMessage, leave };
}
