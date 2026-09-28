import type { Bot } from "grammy";
import type { InlineKeyboard } from "grammy";
import { env, type TopicKey } from "../config.js";

export async function postToTopic(
  bot: Bot,
  topic: TopicKey,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  const threadId = env.topics[topic];
  if (threadId == null) {
    console.warn(`[tgbot] skip ${topic}: TOPIC_* not set in .env`);
    return;
  }

  await bot.api.sendMessage(env.chatId, text, {
    parse_mode: "HTML",
    message_thread_id: threadId,
    link_preview_options: { is_disabled: true },
    reply_markup: keyboard,
  });
}
