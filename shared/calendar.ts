import { DateTime } from "luxon";
import { EVENT_TIMEZONE } from "./event-sources.js";
import type { DirectoryEvent } from "./contracts.js";

export function currentMonth() {
  return DateTime.now().setZone(EVENT_TIMEZONE).toFormat("yyyy-MM");
}
export function monthDate(month: string) {
  return DateTime.fromISO(month + "-01", { zone: EVENT_TIMEZONE });
}
export function calendarRange(month: string) {
  const start = monthDate(month);
  const from = start.minus({ days: start.weekday % 7 });
  return { from: from.toJSDate(), to: from.plus({ days: 42 }).toJSDate() };
}
export function toCalendarEvent(event: DirectoryEvent) {
  const start = DateTime.fromISO(event.startsAt).setZone(EVENT_TIMEZONE);
  const end = DateTime.fromISO(event.endsAt ?? event.startsAt).setZone(
    EVENT_TIMEZONE,
  );
  return {
    id: event.id,
    title: event.title,
    url: "/events/" + event.id,
    allDay: event.allDay,
    start: event.allDay ? start.toISODate()! : event.startsAt,
    // Source dates include their last day; FullCalendar's all-day end is exclusive.
    end: event.allDay
      ? end.plus({ days: 1 }).toISODate()!
      : (event.endsAt ?? undefined),
  };
}
