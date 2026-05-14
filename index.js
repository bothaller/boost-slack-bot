const { App, ExpressReceiver } = require("@slack/bolt");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();
const bots = require("./bots");

// ─── Config ───────────────────────────────────────────────────────────────────
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const BOT_NAME = process.env.BOT_NAME;
const PORT = 3000;

// ─── Validate ─────────────────────────────────────────────────────────────────
if (!SLACK_BOT_TOKEN || !SLACK_SIGNING_SECRET || !GEMINI_API_KEY) {
  console.error("❌ Missing required env vars: SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, GEMINI_API_KEY");
  process.exit(1);
}

if (!BOT_NAME || !bots[BOT_NAME]) {
  console.error(`❌ BOT_NAME="${BOT_NAME}" not found. Available bots: ${Object.keys(bots).join(", ")}`);
  process.exit(1);
}

const botConfig = bots[BOT_NAME];
console.log(`🤖 Loading bot: "${BOT_NAME}" — ${botConfig.displayName}`);

// ─── Init ─────────────────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const receiver = new ExpressReceiver({
  signingSecret: SLACK_SIGNING_SECRET,
});

const app = new App({
  token: SLACK_BOT_TOKEN,
  receiver,
});

// ─── Thread History Helper ────────────────────────────────────────────────────
async function fetchThreadHistory(client, channel, threadTs, botUserId) {
  try {
    const result = await client.conversations.replies({
      channel,
      ts: threadTs,
      limit: 20,
    });

    return (result.messages || [])
      .map((msg) => {
        const isBot = msg.bot_id || msg.user === botUserId;
        const text = (msg.text || "").replace(/<@[A-Z0-9]+>/g, "").trim();
        return {
          role: isBot ? "model" : "user",
          parts: [{ text: text || "(empty)" }],
        };
      })
      .filter((msg) => msg.parts[0].text !== "(empty)");
  } catch (err) {
    console.error("Failed to fetch thread history:", err);
    return [];
  }
}

// ─── Gemini Call ──────────────────────────────────────────────────────────────
async function askGemini(history, userMessage) {
  const model = genAI.getGenerativeModel({
    model: botConfig.model || "gemini-1.5-flash",
    systemInstruction: botConfig.systemPrompt,
  });

  // All history except the last entry (the current user message being sent now)
  const chatHistory = history.slice(0, -1);

  const chat = model.startChat({
    history: chatHistory.length > 0 ? chatHistory : undefined,
  });

  const result = await chat.sendMessage(userMessage);
  return result.response.text();
}

// ─── Event Handler ────────────────────────────────────────────────────────────
app.event("app_mention", async ({ event, client, say }) => {
  const { channel, ts, thread_ts, text } = event;
  const threadTs = thread_ts || ts;

  const userMessage = text.replace(/<@[A-Z0-9]+>/g, "").trim();

  if (!userMessage) {
    await say({
      text: botConfig.emptyMentionReply || "Hey! How can I help?",
      thread_ts: threadTs,
    });
    return;
  }

  await client.reactions.add({ channel, name: "thinking_face", timestamp: ts }).catch(() => {});

  try {
    const { user_id: botUserId } = await client.auth.test();
    const history = await fetchThreadHistory(client, channel, threadTs, botUserId);
    const reply = await askGemini(history, userMessage);

    await client.reactions.remove({ channel, name: "thinking_face", timestamp: ts }).catch(() => {});
    await say({ text: reply, thread_ts: threadTs });
  } catch (err) {
    console.error("Error handling mention:", err);
    await client.reactions.remove({ channel, name: "thinking_face", timestamp: ts }).catch(() => {});
    await say({
      text: "⚠️ Something went wrong on my end. Please try again in a moment.",
      thread_ts: threadTs,
    });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
receiver.router.get("/health", (req, res) => res.send("ok"));

// ─── Start ────────────────────────────────────────────────────────────────────
(async () => {
  await app.start(PORT);
  console.log(`⚡ ${botConfig.displayName} is live on port ${PORT}`);
})();
