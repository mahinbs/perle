function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getChatDateLabel(date: Date, now = new Date()): string {
  const today = startOfDay(now);
  const messageDay = startOfDay(date);
  const diffMs = today.getTime() - messageDay.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: messageDay.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  }).format(date);
}

export function isDifferentChatDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() !== startOfDay(b).getTime();
}
