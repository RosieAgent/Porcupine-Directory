// A published, role-based ordering rule, not a reputation or popularity score.
export const CONFIRMATION_FRESH_DAYS = 180;
export const CONFIRMATION_FRESH_MS = CONFIRMATION_FRESH_DAYS * 86400000;
export function isFreshConfirmation(value: string | null, now = Date.now()) {
  if (!value) return false;
  const time = Date.parse(value);
  return (
    Number.isFinite(time) && time <= now && time > now - CONFIRMATION_FRESH_MS
  );
}
export function confirmationPriority(
  entry: { selfConfirmedAt: string | null; editorReviewedAt: string | null },
  now = Date.now(),
) {
  return (
    (isFreshConfirmation(entry.editorReviewedAt, now) ? 2 : 0) +
    (isFreshConfirmation(entry.selfConfirmedAt, now) ? 1 : 0)
  );
}
export function confirmationDate(value: string) {
  return (
    new Intl.DateTimeFormat("en-US", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "America/New_York",
    }).format(new Date(value)) + " (New Hampshire time)"
  );
}
