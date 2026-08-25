import { describe, expect, it, vi, afterEach } from "vitest";
import crypto from "node:crypto";

/**
 * Unit: payment core (src/lib/payments/service.ts) — ไม่แตะ DB/เครือข่าย
 * (happy-path เครดิต + idempotency อยู่ที่ tests/integration/payments.test.ts)
 */

async function freshService() {
  // resetModules ให้ env.ts parse process.env ใหม่ — จำลองการตั้งค่าต่างกันแต่ละเคส
  vi.resetModules();
  const mod = await import("@/lib/payments/service");
  return mod;
}

function stubPaymentsEnv(values: Record<string, string | undefined>) {
  const originals: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(values)) {
    originals[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return () => {
    for (const [k, v] of Object.entries(originals)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.resetModules();
  };
}

afterEach(() => {
  vi.resetModules();
});

describe("resolvePaymentsMode", () => {
  it("PAYMENTS_ENABLED ไม่ใช่ true → off เสมอ", async () => {
    const restore = stubPaymentsEnv({
      PAYMENTS_ENABLED: undefined,
      PAYMENTS_MODE: undefined,
      STRIPE_SECRET_KEY: "sk_test_x",
    });
    try {
      expect((await freshService()).resolvePaymentsMode()).toBe("off");
    } finally {
      restore();
    }
  });

  it("mock mode ชนะ แม้มี STRIPE_SECRET_KEY (dev/E2E)", async () => {
    const restore = stubPaymentsEnv({
      PAYMENTS_ENABLED: "true",
      PAYMENTS_MODE: "mock",
      STRIPE_SECRET_KEY: "sk_test_x",
    });
    try {
      expect((await freshService()).resolvePaymentsMode()).toBe("mock");
    } finally {
      restore();
    }
  });

  it("enabled + มี STRIPE_SECRET_KEY → stripe; enabled แต่ไม่มี key → off", async () => {
    let restore = stubPaymentsEnv({
      PAYMENTS_ENABLED: "true",
      PAYMENTS_MODE: "stripe",
      STRIPE_SECRET_KEY: "sk_test_x",
    });
    try {
      expect((await freshService()).resolvePaymentsMode()).toBe("stripe");
    } finally {
      restore();
    }

    restore = stubPaymentsEnv({
      PAYMENTS_ENABLED: "true",
      PAYMENTS_MODE: "stripe",
      STRIPE_SECRET_KEY: "",
    });
    try {
      expect((await freshService()).resolvePaymentsMode()).toBe("off");
    } finally {
      restore();
    }
  });
});

describe("parseCheckoutMetadata", () => {
  it("metadata ครบ → userId/packageId/coins", async () => {
    const { parseCheckoutMetadata } = await import("@/lib/payments/service");
    const meta = parseCheckoutMetadata({
      userId: "0a408595-d52e-4bc3-80b0-6665e6341e0a",
      packageId: "coins_500",
      coins: "500",
    });
    expect(meta).toEqual({
      userId: "0a408595-d52e-4bc3-80b0-6665e6341e0a",
      packageId: "coins_500",
      coins: 500,
    });
  });

  it.each([
    ["userId ไม่ใช่ uuid", { userId: "nope", packageId: "coins_500", coins: "1" }],
    ["coins ไม่ใช่ตัวเลขบวก", { userId: "0a408595-d52e-4bc3-80b0-6665e6341e0a", packageId: "p", coins: "-3" }],
    ["metadata หาย", null],
  ])("%s → VALIDATION_ERROR", async (_name, metadata) => {
    const { parseCheckoutMetadata } = await import("@/lib/payments/service");
    expect(() =>
      parseCheckoutMetadata(metadata as Record<string, string> | null)
    ).toThrow();
  });
});

describe("creditPaidSession guards (ก่อนถึง DB)", () => {
  const paid = (over: Partial<{ paymentStatus: string | null }> = {}) => ({
    id: "cs_test_abc123",
    paymentStatus: over.paymentStatus ?? "paid",
    metadata: {
      userId: "0a408595-d52e-4bc3-80b0-6665e6341e0a",
      packageId: "coins_500",
      coins: "500",
    },
  });

  it("ยังไม่จ่าย (payment_status=unpaid) → PAYMENT_FAILED", async () => {
    const { creditPaidSession } = await import("@/lib/payments/service");
    await expect(creditPaidSession(paid({ paymentStatus: "unpaid" }))).rejects.toMatchObject({
      code: "PAYMENT_FAILED",
    });
  });

  it("confirm path: session เป็นของคนอื่น → FORBIDDEN", async () => {
    const { creditPaidSession } = await import("@/lib/payments/service");
    await expect(
      creditPaidSession(paid(), "11111111-1111-4111-8111-111111111111")
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ── Stripe webhook signature ──

const WEBHOOK_SECRET = "whsec_test_secret";

function signedHeader(payload: string, secret = WEBHOOK_SECRET): string {
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

const eventPayload = JSON.stringify({
  id: "evt_test_1",
  object: "event",
  api_version: "2025-01-01",
  created: Math.floor(Date.now() / 1000),
  type: "checkout.session.completed",
  data: { object: { id: "cs_test_abc123", object: "checkout.session" } },
  livemode: false,
  pending_webhooks: 1,
  request: { id: null, idempotency_key: null },
});

describe("verifyStripeEvent", () => {
  it("signature ถูกต้อง → event.type คืนมาได้", async () => {
    const { verifyStripeEvent } = await import("@/lib/payments/service");
    const event = await verifyStripeEvent(
      eventPayload,
      signedHeader(eventPayload),
      WEBHOOK_SECRET
    );
    expect(event.type).toBe("checkout.session.completed");
  });

  it("payload โดนแก้ → VALIDATION_ERROR", async () => {
    const { verifyStripeEvent } = await import("@/lib/payments/service");
    const tampered = eventPayload.replace("cs_test_abc123", "cs_test_evil9999");
    await expect(
      verifyStripeEvent(tampered, signedHeader(eventPayload), WEBHOOK_SECRET)
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("secret ไม่ตรง → VALIDATION_ERROR", async () => {
    const { verifyStripeEvent } = await import("@/lib/payments/service");
    await expect(
      verifyStripeEvent(eventPayload, signedHeader(eventPayload), "whsec_other")
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("timestamp เกิน tolerance (replay >5 นาที) → VALIDATION_ERROR", async () => {
    const { verifyStripeEvent } = await import("@/lib/payments/service");
    const oldT = Math.floor(Date.now() / 1000) - 60 * 30;
    const sig = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(`${oldT}.${eventPayload}`)
      .digest("hex");
    await expect(
      verifyStripeEvent(eventPayload, `t=${oldT},v1=${sig}`, WEBHOOK_SECRET)
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
