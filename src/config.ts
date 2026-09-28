import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

function optionalTopic(raw: string | undefined): number | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid topic id: ${raw}`);
  }
  return n;
}

const schema = z.object({
  BOT_TOKEN: z.string().min(1),
  CHAT_ID: z.string().min(1),
  TOPIC_LAUNCHES: z.string().optional(),
  TOPIC_DEVLOCK: z.string().optional(),
  TOPIC_STAKING: z.string().optional(),
  TOPIC_CLAIMS: z.string().optional(),
  // Second bot: topic guard (locked topics chosen in-group via /lock)
  RESTRICT_BOT_TOKEN: z.string().optional().default(""),
  // Optional seed for /allowhint until set in the group
  RESTRICT_ALLOWED_HINT: z.string().optional().default(""),
  // How long the warning stays before auto-delete (ms)
  RESTRICT_NOTICE_TTL_MS: z.coerce.number().int().positive().default(5_000),
  API_BASE_URL: z.string().url(),
  WEB_BASE_URL: z.string().url().default("https://lootingpad.com"),
  EXPLORER_TX_BASE: z.string().optional().default(""),
  EXPLORER_TOKEN_BASE: z.string().optional().default(""),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(20_000),
  MIN_STAKE_NOTIFY: z.coerce.number().nonnegative().default(0),
  MIN_CLAIM_NOTIFY: z.coerce.number().nonnegative().default(0),
  // Optional Telegram custom/premium emoji ids (from a Custom Emoji pack)
  EMOJI_ROCKET: z.string().optional().default(""),
  EMOJI_GRADUATED: z.string().optional().default(""),
  EMOJI_LOCK: z.string().optional().default(""),
  EMOJI_UNLOCK: z.string().optional().default(""),
  EMOJI_VAULT: z.string().optional().default(""),
  EMOJI_STAKE: z.string().optional().default(""),
  EMOJI_GIFT: z.string().optional().default(""),
  EMOJI_STATS: z.string().optional().default(""),
  EMOJI_TOKEN: z.string().optional().default(""),
  EMOJI_TROPHY: z.string().optional().default(""),
  EMOJI_FIRE: z.string().optional().default(""),
  EMOJI_BOLT: z.string().optional().default(""),
  EMOJI_WARN: z.string().optional().default(""),
  EMOJI_GOLD: z.string().optional().default(""),
  EMOJI_SILVER: z.string().optional().default(""),
  EMOJI_BRONZE: z.string().optional().default(""),
});

const parsed = schema.parse(process.env);

function emojiId(raw: string): string | undefined {
  const id = raw.trim();
  return id.length > 0 ? id : undefined;
}

export const env = {
  botToken: parsed.BOT_TOKEN,
  chatId: parsed.CHAT_ID,
  topics: {
    launches: optionalTopic(parsed.TOPIC_LAUNCHES),
    devlock: optionalTopic(parsed.TOPIC_DEVLOCK),
    staking: optionalTopic(parsed.TOPIC_STAKING),
    claims: optionalTopic(parsed.TOPIC_CLAIMS),
  },
  restrictBotToken: parsed.RESTRICT_BOT_TOKEN.trim(),
  restrictAllowedHint: parsed.RESTRICT_ALLOWED_HINT.trim(),
  restrictNoticeTtlMs: parsed.RESTRICT_NOTICE_TTL_MS,
  apiBaseUrl: parsed.API_BASE_URL.replace(/\/$/, ""),
  webBaseUrl: parsed.WEB_BASE_URL.replace(/\/$/, ""),
  explorerTxBase: parsed.EXPLORER_TX_BASE,
  explorerTokenBase: parsed.EXPLORER_TOKEN_BASE,
  pollIntervalMs: parsed.POLL_INTERVAL_MS,
  minStakeNotify: parsed.MIN_STAKE_NOTIFY,
  minClaimNotify: parsed.MIN_CLAIM_NOTIFY,
  customEmoji: {
    rocket: emojiId(parsed.EMOJI_ROCKET),
    graduated: emojiId(parsed.EMOJI_GRADUATED),
    lock: emojiId(parsed.EMOJI_LOCK),
    unlock: emojiId(parsed.EMOJI_UNLOCK),
    vault: emojiId(parsed.EMOJI_VAULT),
    stake: emojiId(parsed.EMOJI_STAKE),
    gift: emojiId(parsed.EMOJI_GIFT),
    stats: emojiId(parsed.EMOJI_STATS),
    token: emojiId(parsed.EMOJI_TOKEN),
    trophy: emojiId(parsed.EMOJI_TROPHY),
    fire: emojiId(parsed.EMOJI_FIRE),
    bolt: emojiId(parsed.EMOJI_BOLT),
    warn: emojiId(parsed.EMOJI_WARN),
    gold: emojiId(parsed.EMOJI_GOLD),
    silver: emojiId(parsed.EMOJI_SILVER),
    bronze: emojiId(parsed.EMOJI_BRONZE),
  },
} as const;

export type TopicKey = keyof typeof env.topics;
