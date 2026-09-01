import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { PeerChatSocketClient } from "@/infrastructure/websocket/peer-chat-socket.client";
import type { PeerChatMessage } from "@/presentation/components/PeerChatRoom";

// "error" is load-bearing, as it is in usePeerPartnerConnection: without a
// member for it the union cannot express a dropped socket, so the UI has no
// state to render one from and a searching doctor waits forever.
export type PeerRequestState =
  | "idle"
  | "searching"
  | "matched"
  | "no_peer_available"
  | "connection_lost"
  | "error";

export function usePeerRequest() {
  const [state, setState] = useState<PeerRequestState>("idle");
  const [specialty, setSpecialty] = useState<string | null>(null);
  const [messages, setMessages] = useState<PeerChatMessage[]>([]);
  const [peerLeft, setPeerLeft] = useState(false);

  const clientRef = useRef<PeerChatSocketClient | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const requestIdRef = useRef<string | null>(null);
  // socket.io fires `disconnect` for a deliberate teardown too, so leaving has
  // to be distinguishable from losing the transport.
  const leavingRef = useRef(false);

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
    leavingRef.current = false;

    const client = new PeerChatSocketClient();
    clientRef.current = client;
    const socket = client.connect();
    socketRef.current = socket;

    socket.on("no_peer_available", () => setState("no_peer_available"));

    // The person on this side of the socket is the one in distress. A failure
    // here has to say so rather than leaving "Procurando…" on screen.
    socket.on("connect_error", () => setState("error"));
    socket.on("disconnect", () => {
      if (leavingRef.current) return;
      // A conversation the doctor ended is `idle`, and `peer_left` already
      // carries "the other person ended it". What is left is the transport
      // failing underneath a live conversation, which used to be represented
      // as nothing at all: the composer stayed enabled and every message was
      // appended locally, so the doctor watched their own words arrive
      // nowhere.
      setState((current) => (current === "matched" ? "connection_lost" : "error"));
    });
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
    if (!requestIdRef.current || !socketRef.current?.connected) return;
    socketRef.current?.emit("message", { requestId: requestIdRef.current, text });
    setMessages((prev) => [...prev, { from: "me", text }]);
  }, []);

  const leave = useCallback(() => {
    leavingRef.current = true;
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
