import { isChatGreetingMessage } from "./chatDates";

export const PSYCHOLOGIST_GREETING =
  "Hi, I'm Dr. Maya. This is a safe space — what's on your mind today?";

export const PSYCHOLOGIST_DISPLAY_NAME = "Dr. Maya";

/** History sent to /api/chat — skip placeholder greeting bubbles. */
export function buildCompanionHistoryPayload(
  messages: Array<{ id?: string; role: string; content: string }>,
  limit: number
): Array<{ role: "user" | "assistant"; content: string }> {
  const mapped = messages
    .filter((m) => m.content?.trim())
    .filter((m) => !(m.id && isChatGreetingMessage({ id: m.id, role: m.role })))
    .slice(-limit)
    .map((m) => ({
      role: m.role === "ai" || m.role === "assistant" ? "assistant" as const : "user" as const,
      content: m.content.trim(),
    }));

  if (mapped.length > 0) return mapped;

  // Brand-new chat: pass the on-screen welcome once so the model doesn't
  // repeat a full introduction on the user's first "hi".
  const lonelyGreeting = messages.find(
    (m) => m.id && isChatGreetingMessage({ id: m.id, role: m.role }) && m.content?.trim()
  );
  if (lonelyGreeting) {
    return [{ role: "assistant", content: lonelyGreeting.content.trim() }];
  }

  return [];
}

/** Hide generic therapy follow-up chips when the model didn't personalize them. */
export function areGenericPsychFollowUps(questions: string[]): boolean {
  if (questions.length === 0) return true;
  const generic = new Set([
    "when do these feelings become strongest during your day?",
    "what thoughts usually show up right before you feel this way?",
    "what has helped you feel even 10% better in the past?",
    "when does this feeling become strongest for you?",
    "what has helped you even a little in similar moments before?",
    "would you like a small 5-minute step you can try right now?",
  ]);
  return questions.every((q) => generic.has(q.trim().toLowerCase()));
}
