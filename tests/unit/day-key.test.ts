import { describe, expect, it } from "vitest";
import { dayKeyInTimezone } from "@/lib/time/day-key";

describe("dayKeyInTimezone", () => {
  it("formats YYYY-MM-DD in Asia/Bangkok", () => {
    const d = new Date("2026-11-10T17:00:00.000Z"); // 00:00 Bangkok next day
    expect(dayKeyInTimezone("Asia/Bangkok", d)).toBe("2026-11-11");
  });

  it("falls back to Bangkok on invalid timezone", () => {
    const d = new Date("2026-01-01T00:00:00.000Z");
    expect(dayKeyInTimezone("Not/AZone", d)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
