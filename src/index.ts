import { Bot } from "grammy";
import { env } from "./config.js";
import { registerCommands } from "./bot/commands.js";
import { createRestrictBot } from "./bot/restrictBot.js";
import { BOT_COMMANDS } from "./bot/keyboards.js";
// import { runPoller } from "./poller/index.js";

async function startPolling(bot: Bot, label: string): Promise<void> {
  // Clear webhook / stale long-poll so two bots in one process (and tsx watch restarts) don't 409
  try {
    await bot.api.deleteWebhook({ drop_pending_updates: true });
  } catch (err) {
    console.warn(`[${label}] deleteWebhook failed:`, err);
  }

  await bot.start({
    onStart: (info) => console.log(`[${label}] @${info.username} online`),
    allowed_updates:
      label === "restrict"
        ? ["message", "edited_message", "callback_query", "my_chat_member"]
        : undefined,
  });
}

async function main() {
  const bot = new Bot(env.botToken);
  registerCommands(bot);

  const restrictBot = createRestrictBot();

  try {
    await bot.api.setMyCommands([...BOT_COMMANDS]);
    console.log(`[tgbot] registered ${BOT_COMMANDS.length} command suggestions`);
  } catch (err) {
    console.warn("[tgbot] setMyCommands failed (continuing):", err);
  }

  const ac = new AbortController();
  const shutdown = () => {
    console.log("[tgbot] shutting down");
    ac.abort();
    void bot.stop();
    if (restrictBot) void restrictBot.stop();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log("[tgbot] starting (1 process, 2 bots)");
  console.log(
    `[tgbot] topics launches=${env.topics.launches ?? "unset"} ` +
      `devlock=${env.topics.devlock ?? "unset"} ` +
      `staking=${env.topics.staking ?? "unset"} ` +
      `claims=${env.topics.claims ?? "unset"}`,
  );
  if (restrictBot) {
    console.log("[restrict] enabled — use /lock /unlock in the group");
  } else {
    console.log("[restrict] disabled (RESTRICT_BOT_TOKEN empty)");
  }

  // Paused — was flooding Launches from GET {API_BASE_URL}/api/launches
  // void runPoller(bot, ac.signal);
  console.log("[tgbot] poller paused (no auto New Launch / vault / claim posts)");

  // Run independently so one bot's polling error doesn't kill the other
  const runners: Promise<void>[] = [
    startPolling(bot, "tgbot").catch((err) => {
      console.error("[tgbot] polling stopped:", err);
      throw err;
    }),
  ];

  if (restrictBot) {
    runners.push(
      startPolling(restrictBot, "restrict").catch((err) => {
        console.error("[restrict] polling stopped:", err);
        // Keep main bot alive; retry restrict after a short delay
        return new Promise<void>((resolve, reject) => {
          setTimeout(() => {
            startPolling(restrictBot, "restrict").then(resolve, reject);
          }, 2000);
        });
      }),
    );
  }

  const results = await Promise.allSettled(runners);
  const fatal = results.find((r) => r.status === "rejected");
  if (fatal && fatal.status === "rejected") {
    throw fatal.reason;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
