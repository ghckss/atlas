import assert from "node:assert/strict";
import test from "node:test";

import { loadRuntimeConfig, roleFromRuntimeInput } from "../src";

test("runtime config loads required local MVP settings", () => {
  const config = loadRuntimeConfig({
    PORT: "3100",
    DISCORD_BOT_USER_ID: "bot-1",
    DISCORD_DEDICATED_CHANNEL_ID: "channel-1",
    DISCORD_OWNER_USER_IDS: "owner-1, owner-2",
    N8N_WEBHOOK_SECRET: "secret",
    N8N_API_URL: "http://localhost:5678",
    N8N_API_KEY: "n8n-key",
    MEM0_API_KEY: "mem0-key",
    MEM0_BASE_URL: "https://mem0.example",
    NEWS_PROVIDERS: "google-news, naver-news",
    NEWS_QUERY: "AI agent",
    LLM_PROVIDER: "openai",
    LLM_LOG_FILE: "logs/custom-llm.log",
    OPENAI_API_KEY: "openai-key",
    OPENAI_MODEL: "gpt-5.6",
    OPENAI_BASE_URL: "https://openai.example",
    CODEX_CLI_COMMAND: "codex-custom",
    CODEX_CLI_MODEL: "gpt-5.6-codex",
    CODEX_CLI_PROFILE: "work",
    CODEX_CLI_SANDBOX: "workspace-write",
    CODEX_CLI_WORKDIR: "/tmp/hermes-project",
    CODEX_CLI_OSS: "true",
    CODEX_CLI_LOCAL_PROVIDER: "ollama",
    LLM_REQUEST_TIMEOUT_MS: "20000",
    NEWS_GOOGLE_LANGUAGE: "ko",
    NEWS_GOOGLE_COUNTRY: "KR",
    NAVER_CLIENT_ID: "naver-id",
    NAVER_CLIENT_SECRET: "naver-secret",
    NEWS_NAVER_DISPLAY: "20",
    NEWS_MAX_ARTICLES: "15",
    NEWS_SOURCE_URLS: "https://news-a.example, https://news-b.example",
    NEWS_COLLECTION_TIMEOUT_MS: "7000"
  });

  assert.equal(config.port, 3100);
  assert.equal(config.discord.botUserId, "bot-1");
  assert.deepEqual(config.discord.ownerUserIds, ["owner-1", "owner-2"]);
  assert.equal(config.discord.enableGateway, false);
  assert.equal(config.n8n.webhookSecret, "secret");
  assert.equal(config.n8n.apiUrl, "http://localhost:5678");
  assert.equal(config.n8n.apiKey, "n8n-key");
  assert.equal(config.mem0.apiKey, "mem0-key");
  assert.equal(config.mem0.baseUrl, "https://mem0.example");
  assert.equal(config.llm.provider, "openai");
  assert.equal(config.llm.logFilePath, "logs/custom-llm.log");
  assert.equal(config.llm.openaiApiKey, "openai-key");
  assert.equal(config.llm.openaiModel, "gpt-5.6");
  assert.equal(config.llm.openaiBaseUrl, "https://openai.example");
  assert.equal(config.llm.codexCliCommand, "codex-custom");
  assert.equal(config.llm.codexCliModel, "gpt-5.6-codex");
  assert.equal(config.llm.codexCliProfile, "work");
  assert.equal(config.llm.codexCliSandbox, "workspace-write");
  assert.equal(config.llm.codexCliWorkdir, "/tmp/hermes-project");
  assert.equal(config.llm.codexCliUseOss, true);
  assert.equal(config.llm.codexCliLocalProvider, "ollama");
  assert.equal(config.llm.requestTimeoutMs, 20000);
  assert.deepEqual(config.news.sourceUrls, [
    "https://news-a.example",
    "https://news-b.example"
  ]);
  assert.deepEqual(config.news.providers, ["google-news", "naver-news"]);
  assert.equal(config.news.query, "AI agent");
  assert.equal(config.news.googleLanguage, "ko");
  assert.equal(config.news.googleCountry, "KR");
  assert.equal(config.news.naverClientId, "naver-id");
  assert.equal(config.news.naverClientSecret, "naver-secret");
  assert.equal(config.news.naverDisplay, 20);
  assert.equal(config.news.maxArticles, 15);
  assert.equal(config.news.collectionTimeoutMs, 7000);
});

test("runtime config defaults news collection to Google News top stories", () => {
  const config = loadRuntimeConfig({
    DISCORD_BOT_USER_ID: "bot-1",
    DISCORD_DEDICATED_CHANNEL_ID: "channel-1",
    N8N_WEBHOOK_SECRET: "secret"
  });

  assert.deepEqual(config.news.providers, ["google-news-top"]);
  assert.equal(config.news.query, "");
  assert.equal(config.news.googleLanguage, "ko");
  assert.equal(config.news.googleCountry, "KR");
  assert.equal(config.news.maxArticles, 10);
  assert.equal(config.llm.provider, "template");
  assert.equal(config.llm.logFilePath, "logs/llm-runtime.log");
  assert.equal(config.llm.openaiModel, "gpt-5.6");
  assert.equal(config.llm.codexCliCommand, "codex");
  assert.equal(config.llm.codexCliSandbox, "read-only");
  assert.equal(config.llm.codexCliUseOss, false);
});

test("runtime config supports Codex CLI as an LLM provider", () => {
  const config = loadRuntimeConfig({
    DISCORD_BOT_USER_ID: "bot-1",
    DISCORD_DEDICATED_CHANNEL_ID: "channel-1",
    N8N_WEBHOOK_SECRET: "secret",
    LLM_PROVIDER: "codex"
  });

  assert.equal(config.llm.provider, "codex-cli");
});

test("runtime config can enable Discord Gateway with a token", () => {
  const config = loadRuntimeConfig({
    DISCORD_BOT_TOKEN: "token",
    DISCORD_BOT_USER_ID: "bot-1",
    DISCORD_ENABLE_GATEWAY: "true",
    DISCORD_DEDICATED_CHANNEL_ID: "channel-1",
    N8N_WEBHOOK_SECRET: "secret"
  });

  assert.equal(config.discord.token, "token");
  assert.equal(config.discord.enableGateway, true);
});

test("runtime config rejects invalid port and missing secrets", () => {
  assert.throws(
    () =>
      loadRuntimeConfig({
        PORT: "99999",
        DISCORD_BOT_USER_ID: "bot-1",
        DISCORD_DEDICATED_CHANNEL_ID: "channel-1",
        N8N_WEBHOOK_SECRET: "secret"
      }),
    /PORT/
  );
  assert.throws(
    () =>
      loadRuntimeConfig({
        DISCORD_BOT_USER_ID: "bot-1",
        DISCORD_DEDICATED_CHANNEL_ID: "channel-1"
      }),
    /N8N_WEBHOOK_SECRET/
  );
  assert.throws(
    () =>
      loadRuntimeConfig({
        DISCORD_BOT_USER_ID: "bot-1",
        DISCORD_DEDICATED_CHANNEL_ID: "channel-1",
        N8N_WEBHOOK_SECRET: "secret",
        LLM_PROVIDER: "unknown"
      }),
    /LLM_PROVIDER/
  );
  assert.throws(
    () =>
      loadRuntimeConfig({
        DISCORD_BOT_USER_ID: "bot-1",
        DISCORD_DEDICATED_CHANNEL_ID: "channel-1",
        N8N_WEBHOOK_SECRET: "secret",
        CODEX_CLI_SANDBOX: "bad"
      }),
    /CODEX_CLI_SANDBOX/
  );
});

test("runtime user role input defaults to developer", () => {
  assert.equal(roleFromRuntimeInput("owner"), "owner");
  assert.equal(roleFromRuntimeInput("unknown"), "developer");
});
