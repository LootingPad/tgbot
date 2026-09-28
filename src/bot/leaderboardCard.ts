import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { InputFile, type Context, type InlineKeyboard } from "grammy";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TEMPLATE = path.join(ROOT, "assets", "leaderbaord.png");
const SCRIPT = path.join(ROOT, "scripts", "render_leaderboard_card.py");
const OUT_DIR = path.join(ROOT, "assets", "generated");

/** In-memory cache so repeat /leaderboard in the same process is instant. */
const memCache = new Map<string, Buffer>();

function runPython(seasonId: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("python", [SCRIPT, seasonId || "—", outPath], {
      cwd: ROOT,
      windowsHide: true,
    });
    let err = "";
    child.stderr.on("data", (buf) => {
      err += String(buf);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err || `render_leaderboard_card exited ${code}`));
    });
  });
}

async function ensureCard(seasonId: string | null): Promise<{ path: string; buf: Buffer }> {
  const safe = (seasonId ?? "none").replace(/[^\w.-]+/g, "_");
  const outPath = path.join(OUT_DIR, `leaderboard-${safe}.jpg`);
  const templateM = existsSync(TEMPLATE) ? statSync(TEMPLATE).mtimeMs : 0;
  const scriptM = existsSync(SCRIPT) ? statSync(SCRIPT).mtimeMs : 0;
  const cacheKey = `${safe}:${templateM}:${scriptM}`;

  const hit = memCache.get(cacheKey);
  if (hit) return { path: outPath, buf: hit };

  mkdirSync(OUT_DIR, { recursive: true });

  const needsRender =
    !existsSync(outPath) ||
    statSync(outPath).mtimeMs < Math.max(templateM, scriptM);

  if (needsRender) {
    const t0 = Date.now();
    await runPython(seasonId ?? "", outPath);
    console.log(`[tgbot] leaderboard card rendered in ${Date.now() - t0}ms`);
  }

  const buf = readFileSync(outPath);
  memCache.set(cacheKey, buf);
  return { path: outPath, buf };
}

/** Build banner with "Season N" beside the trophy, then send as photo + caption. */
export async function replyLeaderboardCard(
  ctx: Context,
  opts: {
    seasonId: string | null;
    caption: string;
    reply_markup?: InlineKeyboard;
  },
): Promise<void> {
  const caption =
    opts.caption.length > 1000 ? `${opts.caption.slice(0, 997)}…` : opts.caption;

  if (!existsSync(TEMPLATE) || !existsSync(SCRIPT)) {
    await ctx.reply(opts.caption, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: opts.reply_markup,
    });
    return;
  }

  try {
    const { buf } = await ensureCard(opts.seasonId);
    await ctx.replyWithPhoto(new InputFile(buf, "leaderboard.jpg"), {
      caption,
      parse_mode: "HTML",
      reply_markup: opts.reply_markup,
    });
  } catch (err) {
    console.error("[tgbot] leaderboard card render failed", err);
    await ctx.reply(opts.caption, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: opts.reply_markup,
    });
  }
}
