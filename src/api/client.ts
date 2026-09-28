import { env } from "../config.js";

async function getJson<T>(path: string): Promise<T> {
  const url = `${env.apiBaseUrl}${path}`;
  const res = await fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status} ${path}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export type LaunchRow = {
  address: string;
  name: string;
  symbol: string;
  description?: string;
  creator: string;
  marketCap: number;
  progress: number;
  priceUsd: number;
  luckyShare: number;
  creatorTax: number;
  phase: "curve" | "graduated";
  stats?: {
    age: string;
    txns: number;
    volume24h: number;
    traders: number;
    change24h: number;
    ath: number;
  };
};

export type StakingEvent = {
  id: string;
  address: string;
  symbol: string;
  name: string;
  creator: string;
  reward: number;
  staked: number;
  stakers: number;
  marketCap: number;
  volume24h: number;
  durationDays: number;
  locks: Array<"flex" | "30" | "90">;
  ends: number;
};

export type DevLockFeedRow = {
  id: string;
  address: string;
  symbol: string;
  name: string;
  mode: "time" | "vest";
  amount: number;
  claimed: number;
  start: number;
  cliff: number;
  unlock: number;
  cadence: string;
  owner: string;
  status: string;
  createTxHash: string | null;
  createdAt: number;
  updatedAt: number;
  kind: "create" | "claim";
};

export type StakingActivityRow = {
  id: string;
  eventId: string;
  address: string;
  symbol: string;
  name: string;
  wallet: string;
  kind: "stake" | "claim" | "unstake";
  lock: "flex" | "30" | "90";
  amount: number;
  reward: number;
  at: number;
  txHash: string | null;
};

export type AnalyticsData = {
  window: string;
  summary: {
    volume: number;
    launches: number;
    traders: number;
    txns: number;
  };
  season: {
    seasonId: string | null;
    xp: number;
    trades: number;
    graduated: number;
    creators: number;
  };
  staking: {
    vaultCount: number;
    staked: number;
    rewards: number;
    stakers: number;
  };
  devLock: {
    locks: number;
    tokensLocked: number;
    claimed: number;
  };
  fees: {
    feeUsd: number;
    boxUsd: number;
    creatorUsd: number;
  };
};

export type LeaderboardRow = {
  wallet: string;
  tier: string;
  xp: number;
  trades: number;
  rewards: string;
};

export async function fetchLaunches(limit = 50) {
  return getJson<{ data: LaunchRow[] }>(`/api/launches?limit=${limit}`);
}

export async function fetchLaunch(token: string) {
  return getJson<{ data: LaunchRow }>(`/api/launches/${encodeURIComponent(token)}`);
}

export async function fetchStakingEvents(limit = 50) {
  return getJson<{ data: StakingEvent[] }>(`/api/staking/events?limit=${limit}`);
}

export async function fetchDevLockFeed(since?: string, limit = 50) {
  const q = new URLSearchParams({ limit: String(limit) });
  if (since) q.set("since", since);
  return getJson<{ data: DevLockFeedRow[] }>(`/api/feed/devlocks?${q}`);
}

export async function fetchStakingActivities(
  opts: { since?: string; kind?: string; limit?: number } = {},
) {
  const q = new URLSearchParams({ limit: String(opts.limit ?? 50) });
  if (opts.since) q.set("since", opts.since);
  if (opts.kind) q.set("kind", opts.kind);
  return getJson<{ data: StakingActivityRow[] }>(`/api/feed/staking-activities?${q}`);
}

export async function fetchAnalytics(window: "24h" | "all" = "24h") {
  return getJson<{ data: AnalyticsData }>(`/api/analytics?window=${window}`);
}

export async function fetchLeaderboard(limit = 10) {
  return getJson<{ seasonId: string | null; data: LeaderboardRow[] }>(
    `/api/leaderboard/current?limit=${limit}`,
  );
}
