import { Bot, InlineKeyboard, type Context } from "grammy";
import { env } from "../config.js";
import {
  listAllowedIds,
  listRestrictedIds,
  loadRestrictState,
  saveRestrictState,
  topicLink,
  type RestrictState,
} from "../state/restrict.js";

const ADMIN_STATUSES = new Set(["creator", "administrator"]);

let state: RestrictState = loadRestrictState();

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function noticeText(): string {
  const hasButtons = noticeKeyboard() != null;
  return [
    "⚠️ <b>This topic is admin only.</b>",
    "Your message was removed.",
    hasButtons
      ? "Please chat in topics that are not locked. Press a button below."
      : "Please chat in topics that are not locked.",
  ].join("\n");
}

type ActiveNotice = {
  chatId: number;
  messageId: number;
  kill?: ReturnType<typeof setTimeout>;
};

/** One warning per topic — spam replaces the previous notice instead of stacking. */
const activeNotices = new Map<string, ActiveNotice>();

function noticeKey(chatId: number, threadId: number): string {
  return `${chatId}:${threadId}`;
}

async function clearNotice(key: string, api: Bot["api"]): Promise<void> {
  const prev = activeNotices.get(key);
  if (!prev) return;
  activeNotices.delete(key);
  if (prev.kill) clearTimeout(prev.kill);
  try {
    await api.deleteMessage(prev.chatId, prev.messageId);
  } catch {
    /* already gone */
  }
}

async function postEphemeral(
  api: Bot["api"],
  chatId: number,
  threadId: number,
  text: string,
  replyMarkup?: InlineKeyboard,
): Promise<void> {
  const key = noticeKey(chatId, threadId);
  await clearNotice(key, api);

  const notice = await api.sendMessage(chatId, text, {
    parse_mode: "HTML",
    message_thread_id: threadId,
    link_preview_options: { is_disabled: true },
    reply_markup: replyMarkup,
  });

  const entry: ActiveNotice = {
    chatId,
    messageId: notice.message_id,
  };
  activeNotices.set(key, entry);

  entry.kill = setTimeout(() => {
    void clearNotice(key, api);
  }, env.restrictNoticeTtlMs);
}

async function postNotice(
  api: Bot["api"],
  chatId: number,
  threadId: number,
): Promise<void> {
  await postEphemeral(api, chatId, threadId, noticeText(), noticeKeyboard() ?? undefined);
}

type TrackedMsg = { id: number; at: number; text: string };
/** Recent messages per user for flood detection */
const recentByUser = new Map<number, TrackedMsg[]>();
/** Skip re-kick storms right after a kick */
const kickCooldownUntil = new Map<number, number>();

const SPAM_WINDOW_MS = 6_000;
const SPAM_MAX_MESSAGES = 5;
const SPAM_SAME_TEXT = 3;

function msgFingerprint(msg: NonNullable<Context["message"]>): string {
  const body = (msg.text ?? msg.caption ?? "").trim().toLowerCase();
  if (body) return body;
  if (msg.sticker) return `sticker:${msg.sticker.file_unique_id}`;
  if (msg.animation) return "animation";
  if (msg.video) return "video";
  if (msg.photo) return "photo";
  if (msg.document) return "document";
  if (msg.voice) return "voice";
  return `other:${msg.message_id}`;
}

function displayUser(from: NonNullable<Context["from"]>): string {
  if (from.username) return `@${escapeHtml(from.username)}`;
  const name = escapeHtml(from.first_name || "user");
  return `<a href="tg://user?id=${from.id}">${name}</a>`;
}

function recordAndIsSpam(
  userId: number,
  messageId: number,
  text: string,
): { spam: boolean; messageIds: number[] } {
  const now = Date.now();
  let list = (recentByUser.get(userId) ?? []).filter((m) => now - m.at < SPAM_WINDOW_MS);
  if (!list.some((m) => m.id === messageId)) {
    list.push({ id: messageId, at: now, text });
  }
  recentByUser.set(userId, list);

  const ids = list.map((m) => m.id);
  if (list.length >= SPAM_MAX_MESSAGES) {
    return { spam: true, messageIds: ids };
  }

  const counts = new Map<string, number>();
  for (const m of list) {
    const n = (counts.get(m.text) ?? 0) + 1;
    counts.set(m.text, n);
    if (n >= SPAM_SAME_TEXT) {
      return { spam: true, messageIds: ids };
    }
  }
  return { spam: false, messageIds: ids };
}

/** Messages seen per user per topic — wiped on restrict / spam kick */
const userTopicMsgs = new Map<string, number[]>();

function userTopicKey(chatId: number, threadId: number, userId: number): string {
  return `${chatId}:${threadId}:${userId}`;
}

function rememberUserMsg(
  chatId: number,
  threadId: number,
  userId: number,
  messageId: number,
): void {
  const key = userTopicKey(chatId, threadId, userId);
  let list = userTopicMsgs.get(key) ?? [];
  if (!list.includes(messageId)) list.push(messageId);
  // Telegram deleteMessages max 100
  if (list.length > 100) list = list.slice(-100);
  userTopicMsgs.set(key, list);
}

/** Delete tracked history for this user in the topic, then clear the buffer. */
async function wipeUserTopicHistory(
  api: Bot["api"],
  chatId: number,
  threadId: number,
  userId: number,
  extraIds: number[] = [],
): Promise<void> {
  const key = userTopicKey(chatId, threadId, userId);
  const ids = [...new Set([...(userTopicMsgs.get(key) ?? []), ...extraIds])];
  userTopicMsgs.delete(key);
  if (ids.length === 0) return;

  try {
    await api.deleteMessages(chatId, ids);
  } catch {
    await Promise.allSettled(
      ids.map((id) => api.deleteMessage(chatId, id).catch(() => undefined)),
    );
  }
}

async function kickSpammer(
  api: Bot["api"],
  chatId: number,
  threadId: number,
  from: NonNullable<Context["from"]>,
  messageIds: number[],
): Promise<void> {
  recentByUser.delete(from.id);
  kickCooldownUntil.set(from.id, Date.now() + 30_000);

  // Hapus history dulu, baru notifikasi
  await wipeUserTopicHistory(api, chatId, threadId, from.id, messageIds);

  // ban + unban = kick; user can rejoin
  try {
    await api.banChatMember(chatId, from.id);
    await api.unbanChatMember(chatId, from.id, { only_if_banned: true });
  } catch (err) {
    console.warn("[restrict] kick failed (need Ban users permission?):", err);
  }

  try {
    await postEphemeral(
      api,
      chatId,
      threadId,
      `🚫 <b>Spam detected</b> — kick ${displayUser(from)}`,
    );
  } catch (err) {
    console.warn("[restrict] spam notice failed:", err);
  }
}

/** Only topics explicitly /allow are open. Everything else is locked. */
function isTopicLocked(threadId: number): boolean {
  return !(threadKey(threadId) in state.allowedTopics);
}

/** URL buttons → open (non-locked) topics only */
function noticeKeyboard(): InlineKeyboard | undefined {
  const ids = listAllowedIds(state).filter((id) => !(threadKey(id) in state.topics));
  if (ids.length === 0) return undefined;

  const kb = new InlineKeyboard();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    const name = state.allowedTopics[String(id)] ?? (id === 1 ? "General" : `Topic ${id}`);
    const href = topicLink(guardChatId(), id, state.chatUsername || undefined);
    if (i > 0 && i % 2 === 0) kb.row();
    kb.url(name.slice(0, 32), href);
  }
  return kb;
}

async function isAdmin(ctx: Context, userId: number): Promise<boolean> {
  try {
    const member = await ctx.getChatMember(userId);
    return ADMIN_STATUSES.has(member.status);
  } catch {
    return false;
  }
}

async function requireAdmin(ctx: Context): Promise<boolean> {
  const uid = ctx.from?.id;
  if (uid == null || !(await isAdmin(ctx, uid))) {
    await ctx.reply("Admin only.");
    return false;
  }
  return true;
}

/** CHAT_ID from .env is source of truth — don't drift to another group via /lock */
function guardChatId(): string {
  return env.chatId;
}

function isGuardChat(chatId: string | number): boolean {
  return String(chatId) === guardChatId();
}

async function bindChat(ctx: Context): Promise<void> {
  const id = String(ctx.chat?.id ?? "");
  if (!id) return;

  if (id !== guardChatId()) {
    console.warn(
      `[restrict] /lock in chat ${id} but CHAT_ID=${guardChatId()} — ignoring bind`,
    );
    return;
  }

  let username = state.chatUsername;
  try {
    const chat = await ctx.getChat();
    if ("username" in chat && typeof chat.username === "string" && chat.username) {
      username = chat.username;
    }
  } catch {
    /* keep previous */
  }

  if (id === state.chatId && username === state.chatUsername) return;
  state = { ...state, chatId: id, chatUsername: username };
  saveRestrictState(state);
  console.log(`[restrict] bound to chat ${id}` + (username ? ` @${username}` : ""));
}

function currentThreadId(ctx: Context): number | null {
  const msg = ctx.message;
  if (!msg) return null;
  if (msg.message_thread_id != null) return msg.message_thread_id;
  if (msg.is_topic_message) return 1;
  // Forum "General" often has no thread id — treat as 1 when we're in the guard chat
  if (String(msg.chat.id) === guardChatId()) return 1;
  if (msg.chat.type === "supergroup") return 1;
  return null;
}

function threadKey(id: number): string {
  return String(id);
}

function requireForumTopic(ctx: Context): number | null {
  return currentThreadId(ctx);
}

/**
 * Second bot: admins pick locked / open topics in-group.
 * Non-admin messages in locked topics are deleted + notice with links.
 */
export function createRestrictBot(): Bot | null {
  if (!env.restrictBotToken) {
    console.log("[restrict] RESTRICT_BOT_TOKEN unset — skip");
    return null;
  }

  // Keep state aligned with CHAT_ID (old bug: /lock in another group broke deletes)
  if (state.chatId !== env.chatId) {
    console.warn(
      `[restrict] syncing chatId ${state.chatId || "(empty)"} → CHAT_ID ${env.chatId}`,
    );
    state = { ...state, chatId: env.chatId };
    saveRestrictState(state);
  }

  if (!state.allowedHint && env.restrictAllowedHint) {
    state = { ...state, allowedHint: env.restrictAllowedHint };
    saveRestrictState(state);
  }

  const bot = new Bot(env.restrictBotToken);

  bot.command("start", async (ctx) => {
    await ctx.reply(
      [
        "Topic guard bot.",
        "1. Add me to your <b>forum group</b> as admin (<b>Delete messages</b> + <b>Ban users</b>).",
        "2. In an alert topic: <b>/lock</b>",
        "3. In open chat topics: <b>/allow</b> (adds quick links in the warning)",
        "4. Flood/spam → kick (can rejoin) + delete spam messages",
        "",
        `Bound chat: <code>${escapeHtml(guardChatId() || "(none)")}</code>`,
        `This chat: <code>${ctx.chat?.id}</code>`,
      ].join("\n"),
      { parse_mode: "HTML" },
    );
  });

  bot.command("lock", async (ctx) => {
    console.log(`[restrict] /lock from chat=${ctx.chat?.id} user=${ctx.from?.id}`);
    if (ctx.chat?.type !== "supergroup" && ctx.chat?.type !== "group") {
      await ctx.reply("Run /lock inside the forum group topic (not in DM).");
      return;
    }
    if (!isGuardChat(ctx.chat!.id)) {
      await ctx.reply(
        `Wrong group. This bot guards <code>${escapeHtml(guardChatId())}</code> (CHAT_ID).\nThis chat: <code>${ctx.chat!.id}</code>`,
        { parse_mode: "HTML" },
      );
      return;
    }
    if (!(await requireAdmin(ctx))) return;
    await bindChat(ctx);

    const threadId = requireForumTopic(ctx);
    if (threadId == null) {
      await ctx.reply("Run <b>/lock</b> inside a forum topic.", { parse_mode: "HTML" });
      return;
    }

    const custom = ctx.match?.trim();
    const name =
      custom ||
      state.topics[threadKey(threadId)] ||
      state.allowedTopics[threadKey(threadId)] ||
      (threadId === 1 ? "General" : `Topic ${threadId}`);

    const allowedTopics = { ...state.allowedTopics };
    delete allowedTopics[threadKey(threadId)];

    state = {
      ...state,
      topics: { ...state.topics, [threadKey(threadId)]: name },
      allowedTopics,
    };
    saveRestrictState(state);

    // Hide General once (repeated hideGeneralForumTopic spams “closed the topic”)
    if (threadId === 1 && !state.generalHidden) {
      try {
        await ctx.api.hideGeneralForumTopic(ctx.chat!.id);
        state = { ...state, generalHidden: true };
        saveRestrictState(state);
      } catch (err) {
        console.warn("[restrict] hideGeneralForumTopic failed:", err);
      }
    }

    await ctx.reply(
      `🔒 Locked <b>${escapeHtml(name)}</b> (id ${threadId}).\nOnly admins can post here.` +
        (threadId === 1 ? "\nGeneral is now <b>hidden</b> from members." : ""),
      { parse_mode: "HTML" },
    );
  });

  bot.command("unlock", async (ctx) => {
    console.log(`[restrict] /unlock from chat=${ctx.chat?.id}`);
    if (ctx.chat?.type !== "supergroup" && ctx.chat?.type !== "group") {
      await ctx.reply("Run /unlock inside the forum group topic.");
      return;
    }
    if (!(await requireAdmin(ctx))) return;
    await bindChat(ctx);

    const threadId = requireForumTopic(ctx);
    if (threadId == null) {
      await ctx.reply("Run <b>/unlock</b> inside a forum topic.", { parse_mode: "HTML" });
      return;
    }

    const key = threadKey(threadId);
    const name = state.topics[key] ?? `Topic ${threadId}`;
    if (!(key in state.topics)) {
      await ctx.reply("This topic is not locked.");
      return;
    }

    const next = { ...state.topics };
    delete next[key];
    state = { ...state, topics: next };
    saveRestrictState(state);

    if (threadId === 1) {
      try {
        await ctx.api.unhideGeneralForumTopic(ctx.chat!.id);
        state = { ...state, generalHidden: false };
        saveRestrictState(state);
      } catch (err) {
        console.warn("[restrict] unhideGeneralForumTopic failed:", err);
      }
    }

    await ctx.reply(
      `🔓 Unlocked <b>${escapeHtml(name)}</b>.` +
        (threadId === 1 ? "\nGeneral is visible again." : "\nTip: send <b>/allow</b> here to add a quick-link button."),
      { parse_mode: "HTML" },
    );
  });

  bot.command("allow", async (ctx) => {
    console.log(`[restrict] /allow from chat=${ctx.chat?.id}`);
    if (ctx.chat?.type !== "supergroup" && ctx.chat?.type !== "group") {
      await ctx.reply("Run /allow inside an open forum topic.");
      return;
    }
    if (!(await requireAdmin(ctx))) return;
    await bindChat(ctx);

    const threadId = requireForumTopic(ctx);
    if (threadId == null) {
      await ctx.reply("Run <b>/allow</b> inside a forum topic.", { parse_mode: "HTML" });
      return;
    }

    if (threadKey(threadId) in state.topics) {
      await ctx.reply("This topic is locked. /unlock it first, then /allow.");
      return;
    }

    const custom = ctx.match?.trim();
    const name =
      custom ||
      state.allowedTopics[threadKey(threadId)] ||
      (threadId === 1 ? "General" : `Topic ${threadId}`);
    state = {
      ...state,
      allowedTopics: { ...state.allowedTopics, [threadKey(threadId)]: name },
    };
    saveRestrictState(state);

    const href = topicLink(guardChatId(), threadId, state.chatUsername || undefined);
    await ctx.reply(
      `✅ Open topic <b>${escapeHtml(name)}</b> registered.\nLink in warnings: <a href="${href}">${escapeHtml(name)}</a>`,
      { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
    );
  });

  bot.command("unallow", async (ctx) => {
    if (ctx.chat?.type !== "supergroup" && ctx.chat?.type !== "group") {
      await ctx.reply("Run /unallow inside a forum topic.");
      return;
    }
    if (!(await requireAdmin(ctx))) return;

    const threadId = requireForumTopic(ctx);
    if (threadId == null) {
      await ctx.reply("Run <b>/unallow</b> inside a forum topic.", { parse_mode: "HTML" });
      return;
    }

    const key = threadKey(threadId);
    if (!(key in state.allowedTopics)) {
      await ctx.reply("This topic is not in the allow list.");
      return;
    }

    const name = state.allowedTopics[key]!;
    const next = { ...state.allowedTopics };
    delete next[key];
    state = { ...state, allowedTopics: next };
    saveRestrictState(state);
    await ctx.reply(`Removed <b>${escapeHtml(name)}</b> from quick links.`, { parse_mode: "HTML" });
  });

  bot.command("locklist", async (ctx) => {
    console.log(`[restrict] /locklist from chat=${ctx.chat?.id}`);
    if (!(await requireAdmin(ctx))) return;

    const locked = listRestrictedIds(state);
    const allowed = listAllowedIds(state);

    const lockLines =
      locked.length === 0
        ? ["(none)"]
        : locked.map((id) => `• ${escapeHtml(state.topics[String(id)]!)} <code>${id}</code>`);

    const allowLines =
      allowed.length === 0
        ? ["(none — run /allow in open topics)"]
        : allowed.map((id) => {
            const name = state.allowedTopics[String(id)]!;
            const href = topicLink(guardChatId(), id, state.chatUsername || undefined);
            return `• <a href="${href}">${escapeHtml(name)}</a> <code>${id}</code>`;
          });

    await ctx.reply(
      [
        `<b>Locked</b> (chat <code>${escapeHtml(guardChatId())}</code>)`,
        ...lockLines,
        "",
        "<b>Open (quick links)</b>",
        ...allowLines,
      ].join("\n"),
      { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
    );
  });

  bot.command("allowhint", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    const text = ctx.match?.trim() ?? "";
    if (!text) {
      await ctx.reply(
        "Fallback text if no /allow topics yet.\nUsage: <b>/allowhint</b> General, Lounge\nPrefer <b>/allow</b> in each open topic for tappable links.",
        { parse_mode: "HTML" },
      );
      return;
    }

    state = { ...state, allowedHint: text };
    saveRestrictState(state);
    await ctx.reply(`Allowed hint set to: <b>${escapeHtml(text)}</b>`, { parse_mode: "HTML" });
  });

  void bot.api
    .setMyCommands([
      { command: "start", description: "How to set up topic locks" },
      { command: "lock", description: "Lock this topic (admin only)" },
      { command: "unlock", description: "Unlock this topic (admin only)" },
      { command: "allow", description: "Mark topic as open + link in warnings" },
      { command: "unallow", description: "Remove topic from quick links" },
      { command: "locklist", description: "List locked & open topics" },
      { command: "allowhint", description: "Fallback open-topic text" },
    ])
    .catch((err) => console.warn("[restrict] setMyCommands failed:", err));

  const onMessage = async (ctx: Context) => {
    const msg = ctx.message ?? ctx.editedMessage;
    if (!msg) return;

    // Ignore service messages (topic closed/reopened/created, etc.) — never react
    if (
      msg.forum_topic_closed ||
      msg.forum_topic_reopened ||
      msg.forum_topic_created ||
      msg.forum_topic_edited ||
      msg.general_forum_topic_hidden ||
      msg.general_forum_topic_unhidden ||
      msg.new_chat_members ||
      msg.left_chat_member ||
      msg.pinned_message
    ) {
      return;
    }

    const chatId = String(msg.chat.id);
    if (!isGuardChat(chatId)) return;

    // Forum General often omits message_thread_id — treat as topic 1
    const threadId =
      msg.message_thread_id ??
      (msg.is_topic_message ? 1 : null) ??
      (isGuardChat(chatId) ? 1 : null);
    if (threadId == null) return;

    const from = msg.from;
    if (!from || from.is_bot) return;
    if (await isAdmin(ctx, from.id)) return;

    // Track every non-admin msg so we can wipe history on restrict/kick
    rememberUserMsg(msg.chat.id, threadId, from.id, msg.message_id);

    // Anti-spam (all topics): flood or repeated text → kick (can rejoin)
    const coolUntil = kickCooldownUntil.get(from.id) ?? 0;
    if (Date.now() < coolUntil) {
      await wipeUserTopicHistory(ctx.api, msg.chat.id, threadId, from.id, [
        msg.message_id,
      ]);
      return;
    }

    const { spam, messageIds } = recordAndIsSpam(
      from.id,
      msg.message_id,
      msgFingerprint(msg),
    );
    if (spam) {
      await kickSpammer(ctx.api, msg.chat.id, threadId, from, messageIds);
      return;
    }

    // Allowlist: only /allow topics are open — everything else is locked
    if (!isTopicLocked(threadId)) return;

    console.log(
      `[restrict] wipe user=${from.id} thread=${threadId} msg=${msg.message_id}`,
    );

    // Hapus pesan dulu (current + tracked), baru notifikasi
    try {
      await ctx.api.deleteMessage(msg.chat.id, msg.message_id);
    } catch (err) {
      console.warn("[restrict] delete current failed:", err);
    }
    try {
      await wipeUserTopicHistory(ctx.api, msg.chat.id, threadId, from.id);
    } catch (err) {
      console.warn("[restrict] wipe history failed:", err);
    }

    try {
      await postNotice(ctx.api, msg.chat.id, threadId);
    } catch (err) {
      console.warn("[restrict] notice failed:", err);
    }
  };

  bot.on("message", onMessage);
  bot.on("edited_message", onMessage);

  // Do NOT call hideGeneralForumTopic on boot — every restart was spamming
  // “lootingmod closed the topic” in the group.

  const ids = listRestrictedIds(state);
  const open = listAllowedIds(state);
  console.log(
    `[restrict] ready — chat=${guardChatId()} locked=[${ids.join(", ") || "none"}] open=[${open.join(", ") || "none"}]`,
  );

  return bot;
}
