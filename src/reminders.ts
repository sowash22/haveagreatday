export const REMINDER_LEAD_MS = 15 * 60 * 1_000;

export type BrowserReminder = {
  id: string;
  groupKey: string;
  notifyAt: number;
  startAt: number;
  place: string;
  windowLabel: string;
  url: string;
};

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function formattedParts(date: Date, timeZone: string): DateTimeParts | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
    const result = { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute") };
    return Object.values(result).every(Number.isFinite) ? result : null;
  } catch {
    return null;
  }
}

export function zonedTimeToEpoch(localTime: string, timeZone: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localTime);
  if (!match) return null;
  const target: DateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
  const targetAsUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
  if (!Number.isFinite(targetAsUtc)) return null;

  let candidate = targetAsUtc;
  for (let pass = 0; pass < 4; pass += 1) {
    const shown = formattedParts(new Date(candidate), timeZone);
    if (!shown) return null;
    const shownAsUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute);
    const correction = targetAsUtc - shownAsUtc;
    candidate += correction;
    if (correction === 0) break;
  }

  const confirmed = formattedParts(new Date(candidate), timeZone);
  return confirmed && Object.keys(target).every((key) => confirmed[key as keyof DateTimeParts] === target[key as keyof DateTimeParts]) ? candidate : null;
}

export function readBrowserReminders(value: unknown, now = Date.now()): BrowserReminder[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): BrowserReminder[] => {
    if (!item || typeof item !== "object") return [];
    const reminder = item as Partial<BrowserReminder>;
    if (
      typeof reminder.id !== "string" || !reminder.id ||
      typeof reminder.groupKey !== "string" || !reminder.groupKey ||
      typeof reminder.notifyAt !== "number" || !Number.isFinite(reminder.notifyAt) ||
      typeof reminder.startAt !== "number" || !Number.isFinite(reminder.startAt) || reminder.startAt <= now ||
      typeof reminder.place !== "string" || !reminder.place ||
      typeof reminder.windowLabel !== "string" || !reminder.windowLabel ||
      typeof reminder.url !== "string" || !reminder.url.startsWith("/")
    ) return [];
    return [reminder as BrowserReminder];
  });
}

export function reminderBody(reminder: BrowserReminder, now = Date.now()): string {
  const minutes = Math.max(1, Math.round((reminder.startAt - now) / 60_000));
  const timing = minutes <= 2 ? "starts shortly" : `starts in ${minutes} minutes`;
  return `Your ${reminder.windowLabel} outdoor window in ${reminder.place} ${timing}.`;
}
