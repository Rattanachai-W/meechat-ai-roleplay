import { describe, expect, it } from "vitest";
import { displayNameFromEmail } from "@/lib/auth/provision-domain-user";

describe("displayNameFromEmail", () => {
  it("uses local part", () => {
    expect(displayNameFromEmail("alice@example.com")).toBe("alice");
  });

  it("falls back when local part empty", () => {
    expect(displayNameFromEmail("@example.com")).toBe("user");
  });
});
