/** YYYY-MM-DD in the given IANA timezone (fallback Asia/Bangkok). */
export function dayKeyInTimezone(timeZone?: string | null, date = new Date()): string {
  const tz = timeZone && timeZone.trim().length > 0 ? timeZone.trim() : "Asia/Bangkok";
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(date);
  }
}
