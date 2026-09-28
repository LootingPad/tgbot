import type { Bot } from "grammy";
import {
  fetchDevLockFeed,
  fetchLaunches,
  fetchStakingActivities,
  fetchStakingEvents,
} from "../api/client.js";
import {
  formatDevLock,
  formatGraduated,
  formatNewLaunch,
  formatStakeActivity,
  formatVault,
} from "../bot/format.js";
import { buildKeyboard } from "../bot/keyboards.js";
import { postToTopic } from "../bot/poster.js";
import { env } from "../config.js";
import { loadCursors, saveCursors, type Cursors } from "../state/cursors.js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function bootstrap(cursors: Cursors): Promise<Cursors> {
  const now = new Date().toISOString();
  const [launches, vaults] = await Promise.all([
    fetchLaunches(100),
    fetchStakingEvents(100),
  ]);

  const next: Cursors = {
    ...cursors,
    launchesSince: now,
    launchPhases: Object.fromEntries(launches.data.map((l) => [l.address.toLowerCase(), l.phase])),
    knownVaultIds: vaults.data.map((v) => v.id),
    devlocksSince: now,
    activitiesSince: now,
    bootstrapped: true,
  };
  saveCursors(next);
  console.log(
    `[tgbot] bootstrapped: ${launches.data.length} launches, ${vaults.data.length} vaults (no backfill)`,
  );
  return next;
}

async function pollLaunches(bot: Bot, cursors: Cursors): Promise<Cursors> {
  const { data } = await fetchLaunches(50);
  let next = { ...cursors, launchPhases: { ...cursors.launchPhases } };

  // Oldest-first for chronological posts
  for (const launch of [...data].reverse()) {
    const key = launch.address.toLowerCase();
    const prevPhase = next.launchPhases[key];

    if (prevPhase && prevPhase !== "graduated" && launch.phase === "graduated") {
      await postToTopic(
        bot,
        "launches",
        formatGraduated(launch),
        buildKeyboard({ token: launch.address, openTerminal: true, analytics: true }),
      );
    } else if (!prevPhase) {
      await postToTopic(
        bot,
        "launches",
        formatNewLaunch(launch),
        buildKeyboard({ token: launch.address, openTerminal: true, analytics: true }),
      );
    }

    next.launchPhases[key] = launch.phase;
  }

  next = { ...next, launchesSince: new Date().toISOString() };
  return next;
}

async function pollVaults(bot: Bot, cursors: Cursors): Promise<Cursors> {
  const { data } = await fetchStakingEvents(50);
  const known = new Set(cursors.knownVaultIds);
  const nextIds = [...cursors.knownVaultIds];

  for (const vault of [...data].reverse()) {
    if (known.has(vault.id)) continue;
    await postToTopic(
      bot,
      "staking",
      formatVault(vault),
      buildKeyboard({ token: vault.address, stake: true, openTerminal: true }),
    );
    known.add(vault.id);
    nextIds.push(vault.id);
  }

  // Cap known list size
  const trimmed = nextIds.slice(-500);
  return { ...cursors, knownVaultIds: trimmed };
}

async function pollDevlocks(bot: Bot, cursors: Cursors): Promise<Cursors> {
  const since = cursors.devlocksSince ?? undefined;
  const { data } = await fetchDevLockFeed(since, 50);
  let maxUpdated = cursors.devlocksSince ? Date.parse(cursors.devlocksSince) : 0;

  for (const row of [...data].reverse()) {
    const ts = row.kind === "claim" ? row.updatedAt : row.createdAt;
    if (since && ts <= Date.parse(since)) continue;

    await postToTopic(
      bot,
      "devlock",
      formatDevLock(row),
      buildKeyboard({
        token: row.address,
        txHash: row.createTxHash,
        openTerminal: true,
        devlock: true,
      }),
    );
    maxUpdated = Math.max(maxUpdated, row.updatedAt, row.createdAt);
  }

  return {
    ...cursors,
    devlocksSince: maxUpdated
      ? new Date(maxUpdated).toISOString()
      : cursors.devlocksSince ?? new Date().toISOString(),
  };
}

async function pollActivities(bot: Bot, cursors: Cursors): Promise<Cursors> {
  const since = cursors.activitiesSince ?? undefined;
  const { data } = await fetchStakingActivities({ since, limit: 50 });
  let maxAt = cursors.activitiesSince ? Date.parse(cursors.activitiesSince) : 0;

  for (const row of [...data].reverse()) {
    if (since && row.at <= Date.parse(since)) continue;

    if (row.kind === "stake") {
      if (row.amount < env.minStakeNotify) continue;
      await postToTopic(
        bot,
        "staking",
        formatStakeActivity(row),
        buildKeyboard({
          token: row.address,
          txHash: row.txHash,
          positions: true,
          openTerminal: true,
        }),
      );
    } else if (row.kind === "claim") {
      if (row.reward < env.minClaimNotify) continue;
      await postToTopic(
        bot,
        "claims",
        formatStakeActivity(row),
        buildKeyboard({
          token: row.address,
          txHash: row.txHash,
          positions: true,
          openTerminal: true,
        }),
      );
    }

    maxAt = Math.max(maxAt, row.at);
  }

  return {
    ...cursors,
    activitiesSince: maxAt
      ? new Date(maxAt).toISOString()
      : cursors.activitiesSince ?? new Date().toISOString(),
  };
}

export async function runPoller(bot: Bot, signal: AbortSignal): Promise<void> {
  let cursors = loadCursors();
  if (!cursors.bootstrapped) {
    cursors = await bootstrap(cursors);
  }

  while (!signal.aborted) {
    try {
      cursors = await pollLaunches(bot, cursors);
      cursors = await pollVaults(bot, cursors);
      cursors = await pollDevlocks(bot, cursors);
      cursors = await pollActivities(bot, cursors);
      saveCursors(cursors);
    } catch (err) {
      console.error("[tgbot] poll error", err);
    }
    await sleep(env.pollIntervalMs);
  }
}
