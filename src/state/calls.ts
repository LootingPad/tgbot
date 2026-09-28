import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LaunchRow } from "../api/client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const PATH = join(DATA_DIR, "calls.json");

export type CallerRef = {
  userId: number;
  username: string;
  name: string;
};

export type UserCall = CallerRef & {
  at: number;
  mcap: number;
  price: number;
};

export type TokenCall = {
  address: string;
  symbol: string;
  /** First caller in this chat/bot — the “kol” */
  first: UserCall;
  athMcap: number;
  athPrice: number;
  athAt: number;
  /** Each user’s first personal call (for /pnl) */
  byUser: Record<string, UserCall>;
};

type Store = {
  tokens: Record<string, TokenCall>;
};

function load(): Store {
  try {
    if (!existsSync(PATH)) return { tokens: {} };
    const raw = JSON.parse(readFileSync(PATH, "utf8")) as Partial<Store>;
    return { tokens: raw.tokens ?? {} };
  } catch {
    return { tokens: {} };
  }
}

function save(store: Store): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(PATH, JSON.stringify(store, null, 2), "utf8");
}

let store: Store = load();

function key(address: string): string {
  return address.toLowerCase();
}

export function displayCaller(c: CallerRef): string {
  if (c.username) return `@${c.username}`;
  return c.name || `id${c.userId}`;
}

export function callerFromUser(user: {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}): CallerRef {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || "User";
  return {
    userId: user.id,
    username: user.username ?? "",
    name,
  };
}

/**
 * Record a call when someone pastes / looks up a CA.
 * First paste wins as the group “kol”; each user also gets a personal entry for /pnl.
 * ATH is updated whenever we see a higher mcap/price.
 */
export function recordCall(
  user: CallerRef,
  launch: LaunchRow,
): { call: TokenCall; isFirstCall: boolean; isUserFirst: boolean } {
  const k = key(launch.address);
  const now = Date.now();
  const mcap = launch.marketCap || 0;
  const price = launch.priceUsd || 0;
  const existing = store.tokens[k];

  if (!existing) {
    const first: UserCall = { ...user, at: now, mcap, price };
    const call: TokenCall = {
      address: launch.address,
      symbol: launch.symbol || "",
      first,
      athMcap: Math.max(mcap, launch.stats?.ath ?? 0),
      athPrice: price,
      athAt: now,
      byUser: { [String(user.userId)]: first },
    };
    store.tokens[k] = call;
    save(store);
    return { call, isFirstCall: true, isUserFirst: true };
  }

  let isUserFirst = false;
  const byUser = { ...existing.byUser };
  const uid = String(user.userId);
  if (!byUser[uid]) {
    byUser[uid] = { ...user, at: now, mcap, price };
    isUserFirst = true;
  } else if ((byUser[uid]!.mcap <= 0 || byUser[uid]!.price <= 0) && (mcap > 0 || price > 0)) {
    // Backfill entry if the call was stored before market data was available
    byUser[uid] = {
      ...byUser[uid]!,
      mcap: byUser[uid]!.mcap > 0 ? byUser[uid]!.mcap : mcap,
      price: byUser[uid]!.price > 0 ? byUser[uid]!.price : price,
    };
  }

  let first = existing.first;
  if ((first.mcap <= 0 || first.price <= 0) && (mcap > 0 || price > 0)) {
    first = {
      ...first,
      mcap: first.mcap > 0 ? first.mcap : mcap,
      price: first.price > 0 ? first.price : price,
    };
  }

  let athMcap = existing.athMcap;
  let athPrice = existing.athPrice;
  let athAt = existing.athAt;
  const apiAth = launch.stats?.ath ?? 0;
  if (mcap > athMcap) {
    athMcap = mcap;
    athPrice = price;
    athAt = now;
  }
  if (apiAth > athMcap) {
    athMcap = apiAth;
    athAt = now;
  }

  const call: TokenCall = {
    ...existing,
    symbol: launch.symbol || existing.symbol,
    first,
    byUser,
    athMcap,
    athPrice,
    athAt,
  };
  store.tokens[k] = call;
  save(store);
  return { call, isFirstCall: false, isUserFirst };
}

/** Refresh ATH without recording a new caller (e.g. /pnl lookup). */
export function touchAth(launch: LaunchRow): TokenCall | null {
  const k = key(launch.address);
  const existing = store.tokens[k];
  if (!existing) return null;

  const mcap = launch.marketCap || 0;
  const price = launch.priceUsd || 0;
  const now = Date.now();
  let athMcap = existing.athMcap;
  let athPrice = existing.athPrice;
  let athAt = existing.athAt;
  const apiAth = launch.stats?.ath ?? 0;

  if (mcap > athMcap) {
    athMcap = mcap;
    athPrice = price;
    athAt = now;
  }
  if (apiAth > athMcap) athMcap = apiAth;

  const call = { ...existing, symbol: launch.symbol || existing.symbol, athMcap, athPrice, athAt };
  store.tokens[k] = call;
  save(store);
  return call;
}

export function getCall(address: string): TokenCall | null {
  return store.tokens[key(address)] ?? null;
}

export function getUserCall(address: string, userId: number): UserCall | null {
  return store.tokens[key(address)]?.byUser[String(userId)] ?? null;
}

export function mult(entry: number, current: number): number | null {
  if (!Number.isFinite(entry) || entry <= 0) return null;
  if (!Number.isFinite(current) || current < 0) return null;
  return current / entry;
}
