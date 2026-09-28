import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { InputFile, type Context, type InlineKeyboard, type Keyboard } from "grammy";
import type { LaunchRow } from "../api/client.js";
import {
  displayCaller,
  mult,
  type TokenCall,
  type UserCall,
} from "../state/calls.js";
import { fmtNum, fmtUsd, formatPnl } from "./format.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(ROOT, "scripts", "render_pnl_card.py");
const BG = path.join(ROOT, "assets", "pnlcall-bg.jpg");
const OUT_DIR = path.join(ROOT, "assets", "generated");

export type PnlCardPayload = {
  symbol: string;
  name: string;
  address: string;
  caller: string;
  called: string;
  entry: string;
  mid: string;
  mid_label: string;
  ath: string;
  pnl: string;
  hero: string;
  /** Bottom strip under the 3 boxes */
  foot_left: string;
  foot_left_label: string;
  foot_mid: string;
  foot_mid_label: string;
  foot_right: string;
  foot_right_label: string;
};

function fmtX(x: number | null): string {
  if (x == null || !Number.isFinite(x)) return "";
  if (x >= 100) return `${fmtNum(x, 0)}x`;
  if (x >= 10) return `${fmtNum(x, 1)}x`;
  return `${fmtNum(x, 2)}x`;
}

function timeAgo(ms: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function pctLabel(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${fmtNum(n)}%`;
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function payloadPnl(
  launch: LaunchRow,
  userCall: UserCall,
  athMcap: number,
  groupName: string,
): PnlCardPayload {
  const nowX = mult(userCall.mcap, launch.marketCap);
  const pct =
    userCall.mcap > 0 && Number.isFinite(launch.marketCap)
      ? ((launch.marketCap - userCall.mcap) / userCall.mcap) * 100
      : null;

  const symbol = launch.symbol ? `$${launch.symbol}` : "TOKEN";
  const hero = nowX != null ? fmtX(nowX) : pctLabel(pct);

  const phase =
    launch.phase === "graduated"
      ? "Graduated"
      : `On curve · ${fmtNum(launch.progress, 0)}%`;
  const traders = launch.stats?.traders ?? 0;
  const vol = launch.stats?.volume24h ?? 0;

  return {
    symbol,
    name: launch.name || "",
    address: launch.address,
    caller: displayCaller(userCall),
    called: timeAgo(userCall.at),
    entry: fmtUsd(userCall.mcap),
    mid: truncate(groupName || "—", 28),
    mid_label: "Group",
    ath: fmtUsd(athMcap),
    pnl: pctLabel(pct),
    hero: hero || "—",
    foot_left: fmtUsd(vol),
    foot_left_label: "Vol 24h",
    foot_mid: fmtNum(traders, 0),
    foot_mid_label: "Traders",
    foot_right: phase,
    foot_right_label: "Phase",
  };
}

function runPython(payload: PnlCardPayload, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("python", [SCRIPT, JSON.stringify(payload), outPath], {
      cwd: ROOT,
      windowsHide: true,
    });
    let err = "";
    child.stderr.on("data", (b) => {
      err += String(b);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err || `render_pnl_card exited ${code}`));
    });
  });
}

async function ensurePnlCard(payload: PnlCardPayload): Promise<Buffer> {
  mkdirSync(OUT_DIR, { recursive: true });
  const bgM = existsSync(BG) ? statSync(BG).mtimeMs : 0;
  const scriptM = existsSync(SCRIPT) ? statSync(SCRIPT).mtimeMs : 0;
  const outPath = path.join(OUT_DIR, "pnl-live.jpg");
  const t0 = Date.now();
  await runPython(payload, outPath);
  console.log(`[tgbot] pnl card rendered in ${Date.now() - t0}ms (bg=${bgM} script=${scriptM})`);
  return readFileSync(outPath);
}

export async function replyPnlCard(
  ctx: Context,
  opts: {
    launch: LaunchRow;
    userCall: UserCall;
    call: TokenCall | null;
    athMcap: number;
    groupName?: string;
    reply_markup?: InlineKeyboard | Keyboard;
  },
): Promise<void> {
  const groupName =
    opts.groupName?.trim() ||
    ("title" in (ctx.chat ?? {}) && typeof (ctx.chat as { title?: string }).title === "string"
      ? (ctx.chat as { title: string }).title
      : "") ||
    (ctx.chat?.type === "private" ? "Private" : "—");

  const payload = payloadPnl(opts.launch, opts.userCall, opts.athMcap, groupName);
  const textFallback = formatPnl(opts.launch, opts.userCall, opts.athMcap);

  if (!existsSync(BG) || !existsSync(SCRIPT)) {
    await ctx.reply(textFallback, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: opts.reply_markup,
    });
    return;
  }

  try {
    const buf = await ensurePnlCard(payload);
    // Image only — no caption text
    await ctx.replyWithPhoto(new InputFile(buf, "pnl.jpg"), {
      reply_markup: opts.reply_markup,
    });
  } catch (err) {
    console.error("[tgbot] pnl card failed", err);
    await ctx.reply(textFallback, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: opts.reply_markup,
    });
  }
}
