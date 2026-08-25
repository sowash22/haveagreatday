import { describe, expect, it } from "vitest";
import { readBrowserReminders, reminderBody, zonedTimeToEpoch, type BrowserReminder } from "../src/reminders.ts";

describe("browser reminders", () => {
  it("turns a forecast-local time into the correct instant", () => {
    expect(zonedTimeToEpoch("2026-08-24T07:00", "America/Los_Angeles")).toBe(Date.parse("2026-08-24T14:00:00Z"));
    expect(zonedTimeToEpoch("2026-08-24T07:00", "Europe/London")).toBe(Date.parse("2026-08-24T06:00:00Z"));
    expect(zonedTimeToEpoch("not-a-time", "Europe/London")).toBeNull();
  });

  it("drops malformed and expired stored reminders", () => {
    const now = Date.parse("2026-08-24T12:00:00Z");
    const valid: BrowserReminder = { id: "one", groupKey: "day", notifyAt: now + 1_000, startAt: now + 60_000, place: "Portland", windowLabel: "7 AM to 9 AM", url: "/?date=2026-08-24" };
    expect(readBrowserReminders([valid, { ...valid, id: "old", startAt: now - 1 }, { nope: true }], now)).toEqual([valid]);
  });

  it("describes on-time and late reminders naturally", () => {
    const now = Date.parse("2026-08-24T12:00:00Z");
    const reminder: BrowserReminder = { id: "one", groupKey: "day", notifyAt: now, startAt: now + 15 * 60_000, place: "Sydney", windowLabel: "4 PM to 6 PM", url: "/" };
    expect(reminderBody(reminder, now)).toContain("starts in 15 minutes");
    expect(reminderBody(reminder, reminder.startAt - 60_000)).toContain("starts shortly");
  });
});
