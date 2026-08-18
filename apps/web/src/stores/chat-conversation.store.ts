import { create } from 'zustand';

export interface ChatUiMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  interrupted?: boolean;
}

let lastMessageId = 0;

export function nextMessageId() {
  lastMessageId += 1;
  return lastMessageId;
}

interface ChatConversationState {
  messages: ChatUiMessage[];
  setMessages: (update: (previous: ChatUiMessage[]) => ChatUiMessage[]) => void;
  clear: () => void;
}

/**
 * Deliberately in memory only — no `persist` middleware. The conversation has
 * to survive in-app navigation (the chat's own shortcuts lead to /assessment
 * and /crisis), but writing what a doctor typed in distress to disk is a
 * different privacy risk than holding it for the session. Closing the tab
 * still erases it.
 */
export const useChatConversationStore = create<ChatConversationState>((set) => ({
  messages: [],
  setMessages: (update) => set((state) => ({ messages: update(state.messages) })),
  clear: () => set({ messages: [] }),
}));
