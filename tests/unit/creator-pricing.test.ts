import { describe, expect, it } from "vitest";
import {
  CREATOR_SHARE,
  CREATOR_EARNING_MIN,
  calculateCreatorShare,
} from "@/lib/energy/pricing";

/**
 * Unit: creator share math (docs/creator-system.md §4)
 */
describe("calculateCreatorShare", () => {
  it("10% ของ cost แบบ floor", () => {
    for (const [cost, expected] of [
      [10, 1],
      [15, 1],
      [25, 2],
      [100, 10],
      [123, 12],
    ] as const) {
      expect(calculateCreatorShare(cost), `cost=${cost}`).toBe(expected);
    }
    expect(CREATOR_SHARE).toBe(0.1);
  });

  it("chat เล็กได้ขั้นต่ำ 1 coin", () => {
    expect(CREATOR_EARNING_MIN).toBe(1);
    expect(calculateCreatorShare(1)).toBe(1); // floor(0.1)=0 → min 1
    expect(calculateCreatorShare(5)).toBe(1);
    expect(calculateCreatorShare(9)).toBe(1);
  });

  it("ไม่มีการชาร์จ = ไม่มี earning", () => {
    expect(calculateCreatorShare(0)).toBe(0);
    expect(calculateCreatorShare(-3)).toBe(0);
  });
});
