import type { Bot, Context } from "grammy";
import {
  fetchAnalytics,
  fetchLaunch,
  fetchLaunches,
  fetchLeaderboard,
} from "../api/client.js";
import {
  callerFromUser,
  displayCaller,
  getCall,
  getUserCall,
  mult,
  recordCall,
  touchAth,
} from "../state/calls.js";
import { env } from "../config.js";
import {
  formatHelp,
  formatHot,
  formatLeaderboard,
  formatStats,
  formatToken,
  fmtNum,
  fmtUsd,
} from "./format.js";
import { ce } from "./emoji.js";
import { buildKeyboard, buildPnlShareKeyboard, commandSuggestKeyboard } from "./keyboards.js";
import {
  payloadHelp,
  payloadHot,
  payloadLeaderboard,
  payloadStats,
  replyCommandCard,
} from "./commandCards.js";
import { replyPnlCard } from "./pnlCard.js";

/** EVM contract address in free text */
const CA_RE = /\b0x[a-fA-F0-9]{40}\b/;

function extractCa(text: string): string | null {
  const m = text.match(CA_RE);
  return m ? m[0] : null;
}

/** True when the message is basically just a CA (paste), not a long chat. */
function isCaPaste(text: string): boolean {
  const t = text.trim();
  if (!t || t.startsWith("/")) return false;
  const ca = extractCa(t);
  if (!ca) return false;
  if (/^0x[a-fA-F0-9]{40}$/i.test(t)) return true;
  const rest = t
    .replace(ca, "")
    .replace(/\bca\b\s*:?/gi, "")
    .replace(/contract|address|token/gi, "")
    .trim();
  return rest.length <= 16;
}

async function replyToken(ctx: Context, address: string): Promise<void> {
  try {
    const { data } = await fetchLaunch(address);
    const from = ctx.from;
    let call = getCall(data.address);

    if (from) {
      const recorded = recordCall(callerFromUser(from), data);
      call = recorded.call;
    } else {
      call = touchAth(data) ?? call;
    }

    await ctx.reply(formatToken(data, call), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: buildKeyboard({
        token: data.address,
        openTerminal: true,
        analytics: true,
      }),
    });
  } catch {
    await ctx.reply(`${ce("warn")}  Token not found on LOOTING.`, { parse_mode: "HTML" });
  }
}

async function replyPnl(ctx: Context, address: string): Promise<void> {
  const from = ctx.from;
  if (!from) {
    await ctx.reply(`${ce("warn")}  Can't resolve your Telegram user.`, { parse_mode: "HTML" });
    return;
  }

  try {
    const { data } = await fetchLaunch(address);
    const call = touchAth(data) ?? getCall(data.address);
    let userCall = getUserCall(data.address, from.id);

    // First time they /pnl without pasting before — record now as their entry
    if (!userCall) {
      const recorded = recordCall(callerFromUser(from), data);
      userCall = recorded.call.byUser[String(from.id)] ?? null;
    }

    if (!userCall) {
      await ctx.reply(
        `${ce("warn")}  No call recorded. Paste the CA first to set your entry.`,
        { parse_mode: "HTML" },
      );
      return;
    }

    const ath = call?.athMcap ?? Math.max(data.marketCap, data.stats?.ath ?? 0);
    const nowX = mult(userCall.mcap, data.marketCap);
    const hero =
      nowX != null
        ? nowX >= 100
          ? `${fmtNum(nowX, 0)}x`
          : nowX >= 10
            ? `${fmtNum(nowX, 1)}x`
            : `${fmtNum(nowX, 2)}x`
        : "—";
    const sym = data.symbol ? `$${data.symbol}` : "TOKEN";
    const tweet = [
      `PNL CALL ${sym}`,
      `${displayCaller(userCall)} · ${hero}`,
      `Entry ${fmtUsd(userCall.mcap)} → ATH ${fmtUsd(ath)}`,
      `${env.webBaseUrl}/token/${data.address}`,
    ].join("\n");

    await replyPnlCard(ctx, {
      launch: data,
      userCall,
      call,
      athMcap: ath,
      reply_markup: buildPnlShareKeyboard(tweet),
    });
  } catch {
    await ctx.reply(`${ce("warn")}  Token not found on LOOTING.`, { parse_mode: "HTML" });
  }
}

export function registerCommands(bot: Bot): void {
  bot.command("help", async (ctx) => {
    await replyCommandCard(ctx, {
      kind: "help",
      payload: payloadHelp(),
      caption: formatHelp(),
      reply_markup: commandSuggestKeyboard(),
    });
  });

  bot.command("start", async (ctx) => {
    await replyCommandCard(ctx, {
      kind: "help",
      payload: payloadHelp(),
      caption: formatHelp(),
      reply_markup: commandSuggestKeyboard(),
    });
  });

  bot.command("stats", async (ctx) => {
    try {
      const { data } = await fetchAnalytics("24h");
      await replyCommandCard(ctx, {
        kind: "stats",
        payload: payloadStats(data),
        caption: formatStats(data),
        reply_markup: buildKeyboard({ analytics: true, leaderboard: true }),
      });
    } catch (err) {
      console.error(err);
      await ctx.reply(`${ce("warn")}  Couldn't load stats. Try again in a bit.`, {
        parse_mode: "HTML",
      });
    }
  });

  bot.command("token", async (ctx) => {
    const arg = ctx.match?.trim();
    const ca = arg ? extractCa(arg) ?? arg : null;
    if (!ca) {
      await ctx.reply(
        "Paste a contract address anytime (no command needed).\nExample: <code>0x…</code>",
        { parse_mode: "HTML" },
      );
      return;
    }
    await replyToken(ctx, ca);
  });

  bot.command("pnl", async (ctx) => {
    const arg = ctx.match?.trim();
    const ca = arg ? extractCa(arg) : null;
    if (!ca) {
      await ctx.reply(
        "Usage: <b>/pnl</b> <code>0x…</code>\nShows your PNL from when you called that CA.",
        { parse_mode: "HTML" },
      );
      return;
    }
    await replyPnl(ctx, ca);
  });

  bot.command("leaderboard", async (ctx) => {
    try {
      const res = await fetchLeaderboard(10);
      await replyCommandCard(ctx, {
        kind: "leaderboard",
        payload: payloadLeaderboard(res.seasonId, res.data),
        caption: formatLeaderboard(res.seasonId, res.data),
        reply_markup: buildKeyboard({ leaderboard: true }),
      });
    } catch (err) {
      console.error(err);
      await ctx.reply(`${ce("warn")}  Couldn't load leaderboard.`, { parse_mode: "HTML" });
    }
  });

  bot.command("hot", async (ctx) => {
    try {
      const { data } = await fetchLaunches(50);
      await replyCommandCard(ctx, {
        kind: "hot",
        payload: payloadHot(data),
        caption: formatHot(data),
        reply_markup: buildKeyboard({ analytics: true }),
      });
    } catch (err) {
      console.error(err);
      await ctx.reply(`${ce("warn")}  Couldn't load hot list.`, { parse_mode: "HTML" });
    }
  });

  // Auto-detect pasted contract address → token snapshot + call record
  bot.on("message:text", async (ctx, next) => {
    const text = ctx.message.text;
    if (!isCaPaste(text)) {
      await next();
      return;
    }
    const ca = extractCa(text);
    if (!ca) {
      await next();
      return;
    }
    await replyToken(ctx, ca);
  });
}
