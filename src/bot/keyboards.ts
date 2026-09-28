import { InlineKeyboard, Keyboard } from "grammy";
import { env } from "../config.js";

/** Persistent reply menu so users can tap commands instead of typing. */
export function commandSuggestKeyboard(): Keyboard {
  return new Keyboard()
    .text("/stats")
    .text("/hot")
    .row()
    .text("/leaderboard")
    .text("/help")
    .resized()
    .persistent();
}

/** Slash-menu entries shown when the user types `/` in Telegram. */
export const BOT_COMMANDS = [
  { command: "start", description: "Open bot menu" },
  { command: "help", description: "List commands" },
  { command: "stats", description: "Protocol stats (24h)" },
  { command: "hot", description: "Top volume 24h" },
  { command: "leaderboard", description: "Season XP top 10" },
  { command: "token", description: "Or just paste 0x address" },
  { command: "pnl", description: "PNL from your call — /pnl 0x…" },
] as const;

function joinUrl(base: string, path: string): string {
  if (!base) return "";
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export function tokenPageUrl(address: string): string {
  return `${env.webBaseUrl}/token/${address}`;
}

export function stakingPageUrl(): string {
  return `${env.webBaseUrl}/staking`;
}

export function devlockPageUrl(): string {
  return `${env.webBaseUrl}/devlock`;
}

export function analyticsPageUrl(): string {
  return `${env.webBaseUrl}/analytics`;
}

export function leaderboardPageUrl(): string {
  return `${env.webBaseUrl}/leaderboard`;
}

export function txUrl(txHash: string | null | undefined): string | null {
  if (!txHash || !env.explorerTxBase) return null;
  return joinUrl(env.explorerTxBase, txHash);
}

export function explorerTokenUrl(address: string): string | null {
  if (!env.explorerTokenBase) return null;
  return joinUrl(env.explorerTokenBase, address);
}

/** X / Twitter share intent */
export function shareToXUrl(text: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

export function buildPnlShareKeyboard(tweetText: string): InlineKeyboard {
  return new InlineKeyboard().url("Share to X", shareToXUrl(tweetText));
}

type ButtonOpts = {
  token?: string;
  txHash?: string | null;
  openTerminal?: boolean;
  stake?: boolean;
  positions?: boolean;
  devlock?: boolean;
  analytics?: boolean;
  leaderboard?: boolean;
};

/** Two URL buttons per row (no callbacks). */
export function buildKeyboard(opts: ButtonOpts): InlineKeyboard {
  const kb = new InlineKeyboard();
  let count = 0;

  const add = (text: string, url: string) => {
    if (count > 0 && count % 2 === 0) kb.row();
    kb.url(text, url);
    count += 1;
  };

  if (opts.openTerminal && opts.token) add("Open Terminal", tokenPageUrl(opts.token));
  if (opts.stake) add("Stake", stakingPageUrl());
  if (opts.positions) add("Positions", stakingPageUrl());
  if (opts.devlock) add("Dev Lock", devlockPageUrl());
  if (opts.analytics) add("Analytics", analyticsPageUrl());
  if (opts.leaderboard) add("Leaderboard", leaderboardPageUrl());

  if (opts.token && !opts.openTerminal) {
    add("Token", tokenPageUrl(opts.token));
  } else if (opts.token) {
    const tokenExplorer = explorerTokenUrl(opts.token);
    if (tokenExplorer) add("Explorer", tokenExplorer);
  }

  const tx = txUrl(opts.txHash);
  if (tx) add("Tx", tx);

  return kb;
}
