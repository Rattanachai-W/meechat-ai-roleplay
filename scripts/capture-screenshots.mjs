/**
 * แคปหน้าจอ MeeChat สำหรับ README (headless Edge + session cookie จาก password grant)
 * ใช้บัญชีทดสอบ GUI เท่านั้น — รัน: node scripts/capture-screenshots.mjs
 */
import "dotenv/config";
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const SB_REF = "yauoirkmvouoownxtbhr";
const EMAIL = "meechat.gui.e2e@gmail.com";
const PASSWORD = "Test-pass-1234";
const BASE = "http://localhost:3000";
const OUT = "docs/screenshots";
const CONV_ID = "2f8bde2e-7e8a-4a34-9bdd-b39c83592826"; // แชทปราณีของบัญชีทดสอบ
const CHAR_ID = "0a408595-d52e-4bc3-80b0-6665e6341e0a"; // pranee-doctor

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) password grant → session
const res = await fetch(
  `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://yauoirkmvouoownxtbhr.supabase.co"}/auth/v1/token?grant_type=password`,
  {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  },
);
if (!res.ok) throw new Error(`password grant failed: ${res.status}`);
const session = await res.json();
console.log("got session for", session.user?.email);

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: "new",
  args: ["--no-first-run", "--disable-extensions"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1.5 });

const cookieName = `sb-${SB_REF}-auth-token`;
await page.setCookie({
  name: cookieName,
  value: encodeURIComponent(JSON.stringify(session)),
  domain: "localhost",
  path: "/",
  httpOnly: false,
  sameSite: "Lax",
});

async function shot(file) {
  await page.screenshot({ path: `${OUT}/${file}` });
  console.log("saved", file);
}

// 2) หน้าแชท + badge ความสนิท
await page.goto(`${BASE}/chat/${CONV_ID}`, { waitUntil: "networkidle2", timeout: 60000 });
await sleep(1500);
await shot("chat-intimacy.png");

// 3) เปิดแผงภารกิจ (คลิกจริงผ่าน CDP)
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) =>
    (b.getAttribute("aria-label") ?? "").includes("แผงภารกิจ"),
  );
  btn?.click();
});
await sleep(1800);
await shot("quest-panel.png");
await page.keyboard.press("Escape");
await sleep(600);

// 4) หน้าตัวละคร (id URL) — ภารกิจ + ความสนิท
await page.goto(`${BASE}/character/${CHAR_ID}`, { waitUntil: "networkidle2", timeout: 60000 });
await sleep(1200);
const bodyText = await page.evaluate(() => document.body.innerText);
if (!bodyText.includes("ภารกิจ")) throw new Error("quest section missing on detail page");
await page.evaluate(() => {
  const h = [...document.querySelectorAll("h2")].find((x) => x.textContent.includes("ภารกิจ"));
  h?.scrollIntoView({ block: "start" });
});
await sleep(400);
await shot("character-detail-quests.png");

// 5) Creator Studio → dialog จัดการภารกิจ
await page.goto(`${BASE}/creator`, { waitUntil: "networkidle2", timeout: 60000 });
await sleep(1500);
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").includes("ภารกิจ"),
  );
  btn?.click();
});
await sleep(1500);
await shot("creator-quest-manager.png");

await browser.close();
console.log("done");
