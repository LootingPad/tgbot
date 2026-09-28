import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { InputFile, type Context, type InlineKeyboard, type Keyboard } from "grammy";
import type { AnalyticsData, LaunchRow, LeaderboardRow } from "../api/client.js";
import { fmtNum, fmtUsd, shortAddr } from "./format.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(ROOT, "scripts", "render_command_card.py");
const BG = path.join(ROOT, "assets", "image", "example", "backgound.jpg");
const OUT_DIR = path.join(ROOT, "assets", "generated");

const memCache = new Map<string, Buffer>();

export type CardKind = "stats" | "hot" | "help" | "leaderboard";

export type CardPayload = {
  title: [string, string];
  left?: { value: string; label: string };
  right?: { value: string; label: string };
  left2?: { value: string; label: string };
  right2?: { value: string; label: string };
  /** Stats card: full metrics grid (no Season banner). */
  metrics?: Array<{ value: string; label: string }>;
  /** Hot card: top ranked tokens. */
  hot_rows?: Array<{ rank: number; symbol: string; volume: string; change?: string }>;
  /** Help card: command list rows. */
  help_rows?: Array<{ command: string; description: string }>;
  center?: string;
  /** Small note above website footer (e.g. leaderboard reset info). */
  note?: string;
  footer?: string;
};

function seasonCenter(seasonId: string | null | undefined): string {
  if (!seasonId) return "Season —";
  const digits = seasonId.replace(/\D+/g, "");
  if (digits) return `Season #${digits}`;
  return `Season ${seasonId}`;
}

export function payloadStats(a: AnalyticsData): CardPayload {
  // Mirror Analytics page parameters — neat grid, no Season # banner.
  return {
    title: ["Statistic", "Protocol"],
    metrics: [
      { value: fmtUsd(a.summary.volume).replace("$", ""), label: "Volume" },
      { value: fmtNum(a.summary.launches, 0), label: "Launches" },
      { value: fmtNum(a.summary.traders, 0), label: "Traders" },
      { value: fmtNum(a.summary.txns, 0), label: "Trades" },
      { value: fmtUsd(a.fees.feeUsd).replace("$", ""), label: "Fees" },
      { value: fmtUsd(a.fees.boxUsd).replace("$", ""), label: "Lucky Boxes" },
      { value: fmtUsd(a.fees.creatorUsd).replace("$", ""), label: "Creator Share" },
      { value: fmtNum(a.season.xp, 0), label: "Season XP" },
      { value: fmtNum(a.season.trades, 0), label: "Qual. Trades" },
      { value: fmtNum(a.season.graduated, 0), label: "Graduated" },
      { value: fmtNum(a.season.creators, 0), label: "Creators" },
      { value: fmtNum(a.staking.vaultCount, 0), label: "Vaults" },
      { value: fmtNum(a.staking.staked, 0), label: "Staked" },
      { value: fmtNum(a.staking.stakers, 0), label: "Stakers" },
      { value: fmtNum(a.devLock.locks, 0), label: "Dev Locks" },
    ],
  };
}

function pctLabel(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  const sign = n > 0 ? "+" : "";
  return `${sign}${fmtNum(n)}%`;
}

export function payloadHot(launches: LaunchRow[]): CardPayload {
  const top = [...launches]
    .sort((a, b) => (b.stats?.volume24h ?? 0) - (a.stats?.volume24h ?? 0))
    .slice(0, 3);

  return {
    title: ["Hot", "Tokens"],
    hot_rows: top.map((l, i) => ({
      rank: i + 1,
      symbol: l.symbol ? `$${l.symbol}` : shortAddr(l.address),
      volume: fmtUsd(l.stats?.volume24h ?? 0),
      change: pctLabel(l.stats?.change24h),
    })),
  };
}

export function payloadHelp(): CardPayload {
  return {
    title: ["Help", "Command"],
    help_rows: [
      { command: "/stats", description: "Protocol statistics" },
      { command: "/hot", description: "Top volume tokens" },
      { command: "/leaderboard", description: "Season XP rankings" },
      { command: "0x…", description: "Paste CA → call + snapshot" },
      { command: "/pnl", description: "Your PNL from a call" },
    ],
  };
}

export function payloadLeaderboard(
  seasonId: string | null,
  rows: LeaderboardRow[],
): CardPayload {
  const top = rows[0];
  return {
    title: ["Leader", "Board"],
    left: {
      value: top ? fmtNum(top.xp, 0) : "—",
      label: top ? shortAddr(top.wallet) : "Top XP",
    },
    right: {
      value: fmtNum(rows.length, 0),
      label: "Traders",
    },
    center: seasonCenter(seasonId),
    note: "Season rankings reset every week",
  };
}

function runPython(kind: CardKind, payload: CardPayload, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "python",
      [SCRIPT, kind, JSON.stringify(payload), outPath],
      { cwd: ROOT, windowsHide: true },
    );
    let err = "";
    child.stderr.on("data", (b) => {
      err += String(b);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err || `render_command_card exited ${code}`));
    });
  });
}

async function ensureCard(kind: CardKind, payload: CardPayload): Promise<Buffer> {
  mkdirSync(OUT_DIR, { recursive: true });
  // Cache key includes payload + script/bg mtime so layout tweaks invalidate
  const bgM = existsSync(BG) ? statSync(BG).mtimeMs : 0;
  const scriptM = existsSync(SCRIPT) ? statSync(SCRIPT).mtimeMs : 0;
  const key = `${kind}:${JSON.stringify(payload)}:${bgM}:${scriptM}`;
  const hit = memCache.get(key);
  if (hit) return hit;

  const outPath = path.join(OUT_DIR, `${kind}-live.jpg`);

  // Always re-render for live data (payload in key). Skip only mem hit.
  const t0 = Date.now();
  await runPython(kind, payload, outPath);
  console.log(`[tgbot] ${kind} card rendered in ${Date.now() - t0}ms`);

  const buf = readFileSync(outPath);
  memCache.set(key, buf);
  // Keep mem cache small
  if (memCache.size > 24) {
    const first = memCache.keys().next().value;
    if (first) memCache.delete(first);
  }
  return buf;
}

export async function replyCommandCard(
  ctx: Context,
  opts: {
    kind: CardKind;
    payload: CardPayload;
    caption: string;
    reply_markup?: InlineKeyboard | Keyboard;
  },
): Promise<void> {
  const caption =
    opts.caption.length > 1000 ? `${opts.caption.slice(0, 997)}…` : opts.caption;

  if (!existsSync(BG) || !existsSync(SCRIPT)) {
    await ctx.reply(opts.caption, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: opts.reply_markup,
    });
    return;
  }

  try {
    const buf = await ensureCard(opts.kind, opts.payload);
    await ctx.replyWithPhoto(new InputFile(buf, `${opts.kind}.jpg`), {
      caption,
      parse_mode: "HTML",
      reply_markup: opts.reply_markup,
    });
  } catch (err) {
    console.error(`[tgbot] ${opts.kind} card failed`, err);
    await ctx.reply(opts.caption, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: opts.reply_markup,
    });
  }
}
