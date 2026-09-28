# LOOTING Telegram Bot

Forum-topic alerts for LootingPad + manual commands. Polls the LOOTING backend;
does not hold keys or move funds.

## Features

**Topic guard (optional second bot):**

Set `RESTRICT_BOT_TOKEN`, add that bot as group admin (**Delete messages**).
Then in the forum, admins pick topics live:

| Command | Effect |
|---------|--------|
| `/lock` | Lock **this** topic (admin/bot only) |
| `/lock Name` | Lock + custom label for warnings |
| `/unlock` | Unlock this topic |
| `/allow` | Mark **this** topic as open — adds a tappable link in the warning |
| `/allow Name` | Same, with custom label |
| `/unallow` | Remove from quick links |
| `/locklist` | Show locked + open topics |
| `/allowhint General, Lounge` | Fallback text if no `/allow` topics yet |

State is saved in `data/restrict.json`. `TOPIC_*` is only for alert posting, not locks.

**Push (one Telegram forum topic each — you fill the topic ids):**

| Topic env | Events |
|-----------|--------|
| `TOPIC_LAUNCHES` | New launch, graduated |
| `TOPIC_DEVLOCK` | Dev Lock create / claim |
| `TOPIC_STAKING` | New vault, new stake |
| `TOPIC_CLAIMS` | Staking reward claim |

Each alert is a **detail message** + **inline URL buttons** (Open Terminal, Stake, Tx, …).

**Commands** (reply in the topic where you typed them):

- `/stats` — protocol 24h stats
- `/token <address>` — token snapshot
- `/leaderboard` — season XP top 10
- `/hot` — top volume 24h
- `/help`

## Setup topic ids (you fill these)

1. Create a **forum** group (Topics enabled).
2. Add the bot as admin (can post messages).
3. Create topics, e.g. `Launches`, `Dev Lock`, `Staking`, `Claims`.
4. Get each topic’s **message thread id**:
   - Forward a message from that topic to [@RawDataBot](https://t.me/RawDataBot) / [@userinfobot](https://t.me/userinfobot), or
   - Use any “get message JSON” bot and read `message_thread_id`.
5. Paste into `.env`:

```env
CHAT_ID=-100xxxxxxxxxx
TOPIC_LAUNCHES=12
TOPIC_DEVLOCK=34
TOPIC_STAKING=56
TOPIC_CLAIMS=78
```

Leave a `TOPIC_*` blank to skip that alert type (bot logs a warning and continues).

## Quick start

```bash
cp .env.example .env
# fill BOT_TOKEN, CHAT_ID, TOPIC_*, API_BASE_URL
npm install
npm run dev
```

Production:

```bash
npm run build
npm start
```

## Env

| Key | Required | Notes |
|-----|----------|--------|
| `BOT_TOKEN` | yes | BotFather |
| `CHAT_ID` | yes | Forum group id |
| `TOPIC_LAUNCHES` / `DEVLOCK` / `STAKING` / `CLAIMS` | no* | Alert thread ids (not used for locks) |
| `RESTRICT_BOT_TOKEN` | no | Second bot; blank = disabled |
| `RESTRICT_ALLOWED_HINT` | no | Optional default until `/allowhint` |
| `RESTRICT_NOTICE_TTL_MS` | no | Warning auto-delete (default 8000) |
| `API_BASE_URL` | yes | Backend, e.g. Railway URL |
| `WEB_BASE_URL` | no | default `https://lootingpad.com` |
| `EXPLORER_TX_BASE` | no | e.g. `https://explorer…/tx/` — enables Tx button |
| `EXPLORER_TOKEN_BASE` | no | enables Explorer token button |
| `POLL_INTERVAL_MS` | no | default `20000` |
| `MIN_STAKE_NOTIFY` / `MIN_CLAIM_NOTIFY` | no | `0` = notify all |

First run **bootstraps** cursors (no historical flood). State lives in `data/cursors.json`.

## Backend dependency

Needs public feed routes on looting-backend:

- `GET /api/feed/devlocks`
- `GET /api/feed/staking-activities`

Plus existing `/api/launches`, `/api/staking/events`, `/api/analytics`, `/api/leaderboard/current`.
