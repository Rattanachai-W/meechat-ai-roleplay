/**
 * Pricing service — แปลง token/cost เป็นหน่วยพลังงาน
 *
 * หลักการ: 1 พลังงาน ≈ 1,000 tokens คูณ energyMultiplier ของโมเดล
 * (โมเดลแพงก็เปลืองพลังงานมากขึ้นตามต้นทุนจริง)
 */
export const TOKENS_PER_ENERGY = 1000;
export const DAILY_REWARD_AMOUNT = 50;
/** ประมาณการ output ตอน reserve (ก่อนรู้ผลจริง) */
export const ESTIMATED_OUTPUT_TOKENS = 512;

/** ส่วนแบ่งครีเอเตอร์ (docs/creator-system.md §4) — 10% ของพลังงานที่ user จ่ายจริง */
export const CREATOR_SHARE = 0.1;
/** ขั้นต่ำ: แชทสำเร็จทุกครั้งครีเอเตอร์ได้ไม่น้อยกว่านี้ (กัน floor()=0 ใน chat สั้น) */
export const CREATOR_EARNING_MIN = 1;

/**
 * ส่วนแบ่งครีเอเตอร์จาก cost ที่ user จ่ายจริงหลัง settle
 * 10% แบบ floor แต่ไม่น้อยกว่า CREATOR_EARNING_MIN เมื่อมีการชาร์จเกิดขึ้นจริง
 */
export function calculateCreatorShare(actualCost: number): number {
  if (actualCost <= 0) return 0;
  return Math.max(CREATOR_EARNING_MIN, Math.floor(actualCost * CREATOR_SHARE));
}

export function calculateChatCost(
  energyMultiplier: number,
  promptTokens: number,
  completionTokens: number
): number {
  const raw = ((promptTokens + completionTokens) / TOKENS_PER_ENERGY) * energyMultiplier;
  return Math.max(1, Math.ceil(raw));
}

/** ประมาณ token คร่าว ๆ จากความยาวข้อความ (ไทย/อังกฤษ ~3 ตัวอักษรต่อ token) */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3) + 4;
}

export function estimateReserveAmount(
  energyMultiplier: number,
  promptTokensEstimate: number
): number {
  return calculateChatCost(energyMultiplier, promptTokensEstimate, ESTIMATED_OUTPUT_TOKENS);
}

/** ต้นทุน USD จริงต่อ request — เก็บลง ai_usage_logs.estimated_cost */
export function estimatedUsdCost(
  inputCostPerMillion: number,
  outputCostPerMillion: number,
  promptTokens: number,
  completionTokens: number
): number {
  return (
    (promptTokens / 1_000_000) * inputCostPerMillion +
    (completionTokens / 1_000_000) * outputCostPerMillion
  );
}
