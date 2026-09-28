import { env } from "../config.js";

/**
 * Custom / Premium emoji for Telegram HTML messages.
 * When an id is set → <tg-emoji emoji-id="…">fallback</tg-emoji>
 * When unset → plain Unicode fallback (works for everyone).
 *
 * How to get ids:
 * 1. Upload a Custom Emoji pack via @Stickers
 * 2. Send one emoji to a chat, forward to @RawDataBot (or inspect updates)
 * 3. Copy custom_emoji_id into .env
 */
export type EmojiKey =
  | "rocket"
  | "graduated"
  | "lock"
  | "unlock"
  | "vault"
  | "stake"
  | "gift"
  | "stats"
  | "token"
  | "trophy"
  | "fire"
  | "bolt"
  | "warn"
  | "gold"
  | "silver"
  | "bronze";

const FALLBACK: Record<EmojiKey, string> = {
  rocket: "🚀",
  graduated: "🎓",
  lock: "🔒",
  unlock: "🔓",
  vault: "🏦",
  stake: "📥",
  gift: "🎁",
  stats: "📊",
  token: "🪙",
  trophy: "🏆",
  fire: "🔥",
  bolt: "⚡",
  warn: "⚠️",
  gold: "🥇",
  silver: "🥈",
  bronze: "🥉",
};

/** HTML custom emoji, or Unicode fallback if id missing. */
export function ce(key: EmojiKey): string {
  const id = env.customEmoji[key];
  const fb = FALLBACK[key];
  if (!id) return fb;
  return `<tg-emoji emoji-id="${id}">${fb}</tg-emoji>`;
}

export function medal(i: number): string {
  if (i === 0) return ce("gold");
  if (i === 1) return ce("silver");
  if (i === 2) return ce("bronze");
  return `${i + 1}.`;
}
