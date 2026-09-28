import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const PATH = join(DATA_DIR, "restrict.json");

export type RestrictState = {
  /** Forum chat id this guard is bound to (set on first /lock or /allow) */
  chatId: string;
  /** Public @username without @, if any — nicer topic links */
  chatUsername: string;
  /** locked thread id → display name */
  topics: Record<string, string>;
  /** open thread id → display name (shown as tappable links in the warning) */
  allowedTopics: Record<string, string>;
  /** fallback text if no allowedTopics yet */
  allowedHint: string;
  /** Already called hideGeneralForumTopic — avoid spam on every restart */
  generalHidden: boolean;
};

const DEFAULT: RestrictState = {
  chatId: "",
  chatUsername: "",
  topics: {},
  allowedTopics: {},
  allowedHint: "",
  generalHidden: false,
};

export function loadRestrictState(): RestrictState {
  try {
    if (!existsSync(PATH)) return { ...DEFAULT, topics: {}, allowedTopics: {} };
    const raw = JSON.parse(readFileSync(PATH, "utf8")) as Partial<RestrictState>;
    return {
      chatId: typeof raw.chatId === "string" ? raw.chatId : "",
      chatUsername: typeof raw.chatUsername === "string" ? raw.chatUsername : "",
      topics: raw.topics ?? {},
      allowedTopics: raw.allowedTopics ?? {},
      allowedHint: typeof raw.allowedHint === "string" ? raw.allowedHint : "",
      generalHidden: Boolean(raw.generalHidden),
    };
  } catch {
    return { ...DEFAULT, topics: {}, allowedTopics: {} };
  }
}

export function saveRestrictState(state: RestrictState): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(PATH, JSON.stringify(state, null, 2), "utf8");
}

export function listRestrictedIds(state: RestrictState): number[] {
  return Object.keys(state.topics)
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

export function listAllowedIds(state: RestrictState): number[] {
  return Object.keys(state.allowedTopics)
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

/** Telegram deep link into a forum topic. */
export function topicLink(chatId: string, threadId: number, username?: string): string {
  if (username) {
    return `https://t.me/${username}/${threadId}`;
  }
  // -100xxxxxxxxxx → xxxxxxxxxx for t.me/c/
  const internal = chatId.replace(/^-100/, "");
  return `https://t.me/c/${internal}/${threadId}`;
}
