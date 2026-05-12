# Slack Bot Server

A **generic Slack bot server** powered by Google Gemini, deployable on monday code.
Bot personas are fully separated from the server logic — each bot is just a config file.

---

## Project Structure

```
slack-bot-server/
├── index.js               # Generic server — routing, Slack events, Gemini calls
├── package.json
├── manifest.json          # monday code deployment config
└── bots/
    ├── index.js           # Bot registry — register new bots here
    └── claude-coach.js    # ClaudeCoach bot config (persona, system prompt, model)
```

---

## Adding a New Bot

1. Duplicate `bots/claude-coach.js` and rename it (e.g. `bots/my-bot.js`)
2. Edit `displayName`, `systemPrompt`, `model`, and `emptyMentionReply`
3. Register it in `bots/index.js`:
   ```js
   const myBot = require("./my-bot");
   module.exports = {
     "claude-coach": claudeCoach,
     "my-bot": myBot,
   };
   ```
4. Deploy a new monday code instance with `BOT_NAME=my-bot`

Each bot can point to its own Slack app and uses the same server codebase.

---

## Bot Config Shape

```js
module.exports = {
  displayName: "My Bot 🤖",          // shown in server logs
  model: "gemini-1.5-flash",          // optional, defaults to gemini-1.5-flash
  emptyMentionReply: "Hey! ...",      // reply when @mentioned with no message
  systemPrompt: `...`,                // full system prompt defining the bot
};
```

---

## Deployment (monday code)

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → From scratch
2. **OAuth & Permissions** → Bot Token Scopes:
   - `app_mentions:read`
   - `channels:history`
   - `groups:history`
   - `reactions:write`
   - `chat:write`
3. **Event Subscriptions** → Subscribe to: `app_mention`
   - Request URL: `https://your-app.monday.app/slack/events`
4. Install to workspace → copy **Bot Token** + **Signing Secret**

### 2. Get a Gemini API Key

[aistudio.google.com/apikey](https://aistudio.google.com/apikey)

### 3. Push to monday code

```bash
mapps code:push
```

Set these env vars in the monday code dashboard:

| Variable | Value |
|---|---|
| `SLACK_BOT_TOKEN` | `xoxb-...` |
| `SLACK_SIGNING_SECRET` | from Slack Basic Info |
| `GEMINI_API_KEY` | from Google AI Studio |
| `BOT_NAME` | `claude-coach` (or any key from `bots/index.js`) |
