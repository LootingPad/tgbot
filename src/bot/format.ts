import type {
  AnalyticsData,
  DevLockFeedRow,
  LaunchRow,
  LeaderboardRow,
  StakingActivityRow,
  StakingEvent,
} from "../api/client.js";
import {
  displayCaller,
  mult,
  type TokenCall,
  type UserCall,
} from "../state/calls.js";
import { ce, medal } from "./emoji.js";

export function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function shortAddr(addr: string, left = 6, right = 4): string {
  if (!addr || addr.length < left + right + 2) return addr || "—";
  return `${addr.slice(0, left)}…${addr.slice(-right)}`;
}

export function fmtNum(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  if (Math.abs(n) >= 1) return n.toFixed(digits);
  if (n === 0) return "0";
  return n.toPrecision(3);
}

export function fmtUsd(n: number): string {
  return `$${fmtNum(n)}`;
}

export function fmtDate(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function pctChange(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${fmtNum(n)}%`;
}

function fmtX(x: number): string {
  if (!Number.isFinite(x)) return "—";
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
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function progressBar(pct: number, width = 10): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * width);
  return `${"▓".repeat(filled)}${"░".repeat(width - filled)} ${fmtNum(clamped, 0)}%`;
}

function phaseLabel(phase: string): string {
  return phase === "graduated" ? "Graduated" : "On curve";
}

function divider(): string {
  return "────────────────";
}

function footer(): string {
  return `<i>lootingpad.com</i>`;
}

function tokenTitle(symbol: string, name: string, address: string): string {
  const sym = symbol ? `$${esc(symbol)}` : shortAddr(address);
  const nm = name ? `\n${esc(name)}` : "";
  return `<b>${sym}</b>${nm}\n<code>${esc(address)}</code>`;
}

function kv(label: string, value: string): string {
  if (value.includes("<")) return `${label}  ${value}`;
  return `${label}  <b>${value}</b>`;
}

/** Tree branch lines: ├ … └ */
function treeLines(items: string[]): string[] {
  const cleaned = items.filter(Boolean);
  return cleaned.map((item, i) => {
    const branch = i === cleaned.length - 1 ? "└" : "├";
    return `${branch} ${item}`;
  });
}

function treeItem(label: string, value: string): string {
  if (value.includes("<")) return `<b>${label}</b>  ${value}`;
  return `<b>${label}</b>  ${value}`;
}

export function formatNewLaunch(l: LaunchRow): string {
  const stats = l.stats;
  return [
    `${ce("rocket")}  <b>NEW LAUNCH</b>`,
    divider(),
    tokenTitle(l.symbol, l.name, l.address),
    "",
    kv("Creator", `<code>${esc(shortAddr(l.creator))}</code>`),
    kv("Phase", `${esc(phaseLabel(l.phase))} · boxes ${fmtNum(l.luckyShare, 0)}%`),
    kv("Tax", `${fmtNum(l.creatorTax, 1)}%`),
    kv("Mcap", fmtUsd(l.marketCap)),
    stats ? kv("Vol 24h", fmtUsd(stats.volume24h)) : "",
    kv("Progress", progressBar(l.progress)),
    stats ? kv("Age", esc(stats.age)) : "",
    "",
    footer(),
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatGraduated(l: LaunchRow): string {
  const stats = l.stats;
  return [
    `${ce("graduated")}  <b>GRADUATED</b>`,
    divider(),
    tokenTitle(l.symbol, l.name, l.address),
    "",
    kv("Creator", `<code>${esc(shortAddr(l.creator))}</code>`),
    kv("Mcap", fmtUsd(l.marketCap)),
    stats ? kv("Vol 24h", fmtUsd(stats.volume24h)) : "",
    stats ? kv("Traders", `${stats.traders} · ${stats.txns} txns`) : "",
    "",
    `<i>Curve complete. Skin still on-chain.</i>`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatDevLock(row: DevLockFeedRow): string {
  const header =
    row.kind === "claim"
      ? `${ce("unlock")}  <b>DEV LOCK CLAIM</b>`
      : `${ce("lock")}  <b>DEV LOCK</b>`;
  return [
    header,
    divider(),
    tokenTitle(row.symbol, row.name, row.address),
    "",
    kv("Owner", `<code>${esc(shortAddr(row.owner))}</code>`),
    kv("Mode", `${esc(row.mode)} · ${esc(row.cadence)}`),
    kv("Amount", `${fmtNum(row.amount)} · claimed ${fmtNum(row.claimed)}`),
    kv("Cliff", fmtDate(row.cliff)),
    kv("Unlock", fmtDate(row.unlock)),
    kv("Status", esc(row.status)),
    "",
    `<i>Skin in the game.</i>`,
  ].join("\n");
}

export function formatVault(v: StakingEvent): string {
  return [
    `${ce("vault")}  <b>STAKING VAULT</b>`,
    divider(),
    tokenTitle(v.symbol, v.name, v.address),
    "",
    kv("Vault", `#${esc(v.id)}`),
    kv("Creator", `<code>${esc(shortAddr(v.creator))}</code>`),
    kv("Rewards", `${fmtNum(v.reward)} · staked ${fmtNum(v.staked)}`),
    kv("Stakers", String(v.stakers)),
    kv("Locks", v.locks.map((x) => esc(x)).join(", ") || "—"),
    kv("Duration", `${v.durationDays}d · ends ${fmtDate(v.ends)}`),
    "",
    `<i>Public vault. Trade to loot.</i>`,
  ].join("\n");
}

export function formatStakeActivity(row: StakingActivityRow): string {
  const header =
    row.kind === "claim"
      ? `${ce("gift")}  <b>REWARD CLAIM</b>`
      : `${ce("stake")}  <b>NEW STAKE</b>`;
  const amountLine =
    row.kind === "claim"
      ? kv("Reward", fmtNum(row.reward))
      : kv("Amount", fmtNum(row.amount));
  return [
    header,
    divider(),
    tokenTitle(row.symbol, row.name, row.address),
    "",
    kv("Vault", `#${esc(row.eventId)}`),
    kv("Wallet", `<code>${esc(shortAddr(row.wallet))}</code>`),
    kv("Lock", esc(row.lock)),
    amountLine,
    row.txHash ? kv("Tx", `<code>${esc(shortAddr(row.txHash, 8, 6))}</code>`) : "",
    "",
    footer(),
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatStats(a: AnalyticsData): string {
  const s = a.summary;
  return [
    `${ce("stats")}  <b>PROTOCOL STATS</b>`,
    `<i>Window · ${esc(a.window)}</i>`,
    "",
    ...treeLines([
      treeItem("Volume", fmtUsd(s.volume)),
      treeItem("Launches", String(s.launches)),
      treeItem("Traders", String(s.traders)),
      treeItem("Trades", String(s.txns)),
      treeItem("Fees", `${fmtUsd(a.fees.feeUsd)} · boxes ${fmtUsd(a.fees.boxUsd)}`),
      treeItem("Season XP", fmtNum(a.season.xp, 0)),
      treeItem("Graduated", String(a.season.graduated)),
      treeItem("Vaults", `${a.staking.vaultCount} · ${fmtNum(a.staking.staked)} staked`),
      treeItem("Dev Locks", `${a.devLock.locks} · ${fmtNum(a.devLock.tokensLocked)} locked`),
    ]),
    "",
    footer(),
  ].join("\n");
}

export function formatToken(
  l: LaunchRow,
  call?: TokenCall | null,
): string {
  const stats = l.stats;
  const change = stats ? pctChange(stats.change24h) : null;

  const callLines: string[] = [];
  if (call) {
    const fromMc = mult(call.first.mcap, l.marketCap);
    const athMc = mult(call.first.mcap, call.athMcap);
    callLines.push(
      treeItem("Called by", `<b>${esc(displayCaller(call.first))}</b> · ${esc(timeAgo(call.first.at))}`),
      treeItem("Call MC", `${fmtUsd(call.first.mcap)}${fromMc != null ? ` · now <b>${fmtX(fromMc)}</b>` : ""}`),
      treeItem(
        "ATH since call",
        `${fmtUsd(call.athMcap)}${athMc != null ? ` · <b>${fmtX(athMc)}</b>` : ""}`,
      ),
    );
  }

  return [
    `${ce("token")}  <b>TOKEN</b>`,
    tokenTitle(l.symbol, l.name, l.address),
    "",
    ...treeLines([
      treeItem("Creator", `<code>${esc(shortAddr(l.creator))}</code>`),
      treeItem("Phase", esc(phaseLabel(l.phase))),
      treeItem("Progress", progressBar(l.progress)),
      treeItem("Mcap", fmtUsd(l.marketCap)),
      treeItem("Price", fmtUsd(l.priceUsd)),
      stats ? treeItem("Vol 24h", fmtUsd(stats.volume24h)) : "",
      change ? treeItem("Δ 24h", change) : "",
      stats
        ? treeItem("Activity", `${stats.traders} traders · ${stats.txns} txns · ${esc(stats.age)}`)
        : "",
      treeItem("Boxes", `${fmtNum(l.luckyShare, 0)}% · tax ${fmtNum(l.creatorTax, 1)}%`),
      ...callLines,
    ]),
    "",
    footer(),
  ].join("\n");
}

export function formatPnl(
  l: LaunchRow,
  userCall: UserCall,
  athMcap: number,
): string {
  const nowX = mult(userCall.mcap, l.marketCap);
  const athX = mult(userCall.mcap, athMcap);
  const pct =
    userCall.mcap > 0 && Number.isFinite(l.marketCap)
      ? ((l.marketCap - userCall.mcap) / userCall.mcap) * 100
      : null;

  return [
    `${ce("trophy")}  <b>PNL</b>`,
    tokenTitle(l.symbol, l.name, l.address),
    "",
    ...treeLines([
      treeItem("Caller", `<b>${esc(displayCaller(userCall))}</b>`),
      treeItem("Called", esc(timeAgo(userCall.at))),
      treeItem("Entry MC", fmtUsd(userCall.mcap)),
      treeItem("Now MC", `${fmtUsd(l.marketCap)}${nowX != null ? ` · <b>${fmtX(nowX)}</b>` : ""}`),
      pct != null ? treeItem("PNL", `<b>${pctChange(pct)}</b>`) : "",
      treeItem("ATH since call", `${fmtUsd(athMcap)}${athX != null ? ` · <b>${fmtX(athX)}</b>` : ""}`),
    ]),
    "",
    footer(),
  ].join("\n");
}

export function formatLeaderboard(seasonId: string | null, rows: LeaderboardRow[]): string {
  const items = rows.slice(0, 10).map((r, i) => {
    return `${medal(i)} <code>${esc(shortAddr(r.wallet))}</code> · ${esc(r.tier)} · <b>${fmtNum(r.xp, 0)} XP</b>`;
  });
  return [
    `${ce("trophy")}  <b>LEADERBOARD</b>`,
    `<i>Season · ${esc(seasonId ?? "none")}</i>`,
    "",
    ...(items.length ? treeLines(items) : ["└ No rows yet."]),
    "",
    footer(),
  ].join("\n");
}

export function formatHot(launches: LaunchRow[]): string {
  const top = [...launches]
    .sort((a, b) => (b.stats?.volume24h ?? 0) - (a.stats?.volume24h ?? 0))
    .slice(0, 10);
  const items = top.map((l, i) => {
    const vol = l.stats?.volume24h ?? 0;
    const change = l.stats ? pctChange(l.stats.change24h) : "—";
    const sym = l.symbol ? `$${esc(l.symbol)}` : shortAddr(l.address);
    return `<b>${i + 1}.</b> ${sym} · ${fmtUsd(vol)} · ${change}`;
  });
  return [
    `${ce("fire")}  <b>HOT · Top 10 · Vol 24h</b>`,
    "",
    ...(items.length ? treeLines(items) : ["└ No launches yet."]),
    "",
    footer(),
  ].join("\n");
}

export function formatHelp(): string {
  return [
    `${ce("bolt")}  <b>LOOTING BOT</b>`,
    `<i>Use the menu below, or type / for suggestions.</i>`,
    "",
    ...treeLines([
      `<b>/stats</b> — protocol statistics (24h)`,
      `<b>/hot</b> — top volume tokens (24h)`,
      `<b>/leaderboard</b> — season XP rankings`,
      `Paste <code>0x…</code> — token + first call`,
      `<b>/pnl</b> <code>0x…</code> — your PNL from call`,
      `<b>/help</b> — command list`,
    ]),
    "",
    `<i>Live alerts:</i> launches · dev lock · staking · claims`,
  ].join("\n");
}
