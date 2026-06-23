const IST = "Asia/Kolkata";

/** Calendar day in IST as YYYY-MM-DD (for reliable day comparisons). */
export function istCalendarKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Whole days between message calendar day and today in IST (0 = today). */
export function getChatDayDiff(messageDate: Date, now = new Date()): number {
  const msg = new Date(`${istCalendarKey(messageDate)}T12:00:00`);
  const today = new Date(`${istCalendarKey(now)}T12:00:00`);
  return Math.round((today.getTime() - msg.getTime()) / (1000 * 60 * 60 * 24));
}

export function isDifferentChatDay(a: Date, b: Date): boolean {
  return istCalendarKey(a) !== istCalendarKey(b);
}

/** Center pill between message groups (Today / Yesterday / weekday date). */
export function getChatDateLabel(date: Date, now = new Date()): string {
  const diffDays = getChatDayDiff(date, now);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    weekday: "long",
    day: "numeric",
    month: "long",
    year:
      istCalendarKey(date).slice(0, 4) !== istCalendarKey(now).slice(0, 4)
        ? "numeric"
        : undefined,
  }).format(date);
}

/**
 * WhatsApp-style timestamp under each bubble:
 * today → time only; yesterday → "Yesterday"; 2–6d → "N days ago"; older → short date.
 */
export function formatChatMessageTime(date: Date, now = new Date()): string {
  const diffDays = getChatDayDiff(date, now);

  if (diffDays === 0) {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: IST,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  }

  if (diffDays === 1) return "Yesterday";

  if (diffDays >= 2 && diffDays <= 7) {
    return `${diffDays} days ago`;
  }

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    day: "numeric",
    month: "short",
    year:
      istCalendarKey(date).slice(0, 4) !== istCalendarKey(now).slice(0, 4)
        ? "numeric"
        : undefined,
  }).format(date);
}

/** Greeting bubble id — must not sit above real history (breaks date order). */
export const CHAT_GREETING_MESSAGE_ID = "1";

export function isChatGreetingMessage(m: { id: string; role: string }): boolean {
  return m.id === CHAT_GREETING_MESSAGE_ID && m.role === "ai";
}

/** Chronological order for chat lists. */
export function sortMessagesByTime<T extends { timestamp: Date }>(messages: T[]): T[] {
  return [...messages].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );
}
