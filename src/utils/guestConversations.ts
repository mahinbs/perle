import type { AnswerResult } from "../types";

export interface GuestConversation {
  id: string;
  title: string;
  chat_mode: string;
  created_at: string;
  updated_at: string;
  messages: { query: string; answer: string; created_at: string }[];
}

const GUEST_CONVERSATIONS_KEY = "syntraiq-guest-conversations";

export function getGuestConversations(): GuestConversation[] {
  try {
    const raw = localStorage.getItem(GUEST_CONVERSATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveGuestConversations(convs: GuestConversation[]) {
  try {
    localStorage.setItem(GUEST_CONVERSATIONS_KEY, JSON.stringify(convs));
  } catch (e) {
    console.error("Failed to save guest conversations", e);
  }
}

export function saveGuestConversationHistory(
  conversationId: string,
  history: AnswerResult[]
) {
  if (!conversationId) return;
  const convs = getGuestConversations();
  let conv = convs.find((c) => c.id === conversationId);
  
  // Format messages into the query/answer format used by API
  const messages = history.map((h) => ({
    query: h.query,
    answer: h.chunks.map((c) => c.text).join(""),
    created_at: new Date(h.timestamp || Date.now()).toISOString(),
  }));

  const firstQuery = history[0]?.query || "New Conversation";
  const title = firstQuery.slice(0, 40) + (firstQuery.length > 40 ? "..." : "");

  if (conv) {
    conv.messages = messages;
    conv.title = title;
    conv.updated_at = new Date().toISOString();
  } else {
    convs.unshift({
      id: conversationId,
      title,
      chat_mode: 'normal',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      messages,
    });
  }
  
  saveGuestConversations(convs);
}

export function deleteGuestConversation(conversationId: string) {
  const convs = getGuestConversations();
  const filtered = convs.filter((c) => c.id !== conversationId);
  saveGuestConversations(filtered);
}
