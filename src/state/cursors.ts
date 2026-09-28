import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const CURSOR_PATH = join(DATA_DIR, "cursors.json");

export type Cursors = {
  /** ISO timestamp — launches with launchedAt after this are new */
  launchesSince: string | null;
  /** token address → last known phase */
  launchPhases: Record<string, string>;
  /** staking vault ids already announced */
  knownVaultIds: string[];
  /** ISO for feed/devlocks since */
  devlocksSince: string | null;
  /** ISO for staking activities since */
  activitiesSince: string | null;
  /** first poll bootstrapped (skip flood) */
  bootstrapped: boolean;
};

const DEFAULT: Cursors = {
  launchesSince: null,
  launchPhases: {},
  knownVaultIds: [],
  devlocksSince: null,
  activitiesSince: null,
  bootstrapped: false,
};

export function loadCursors(): Cursors {
  try {
    if (!existsSync(CURSOR_PATH)) return { ...DEFAULT, launchPhases: {}, knownVaultIds: [] };
    const raw = JSON.parse(readFileSync(CURSOR_PATH, "utf8")) as Partial<Cursors>;
    return {
      ...DEFAULT,
      ...raw,
      launchPhases: raw.launchPhases ?? {},
      knownVaultIds: raw.knownVaultIds ?? [],
    };
  } catch {
    return { ...DEFAULT, launchPhases: {}, knownVaultIds: [] };
  }
}

export function saveCursors(cursors: Cursors): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CURSOR_PATH, JSON.stringify(cursors, null, 2), "utf8");
}
