import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createNewsBriefingWebhookHandler,
  handleSlashCommand,
  HermesNewsBriefingService,
  routeDiscordMessage,
  SoulPipeline,
  TaskPlanner,
  newsBriefingWorkflow
} from "../src";

test("Discord router only accepts mentions in the dedicated channel", () => {
  const config = {
    botUserId: "bot-1",
    dedicatedChannelId: "channel-1",
    ownerUserIds: ["owner-1"]
  };

  assert.deepEqual(
    routeDiscordMessage(
      {
        id: "message-1",
        authorId: "user-1",
        channelId: "general",
        content: "<@bot-1> hello",
        isBot: false,
        isDirectMessage: false,
        mentionedUserIds: ["bot-1"]
      },
      config
    ),
    {
      kind: "ignore",
      reason: "outside-dedicated-channel"
    }
  );

  assert.deepEqual(
    routeDiscordMessage(
      {
        id: "message-2",
        authorId: "user-1",
        channelId: "channel-1",
        content: "<@bot-1> hello",
        isBot: false,
        isDirectMessage: false,
        mentionedUserIds: ["bot-1"]
      },
      config
    ),
    {
      kind: "chat",
      content: "hello"
    }
  );
  assert.deepEqual(
    routeDiscordMessage(
      {
        id: "message-3",
        authorId: "user-1",
        channelId: "channel-1",
        content: "<@bot-1>",
        isBot: false,
        isDirectMessage: false,
        mentionedUserIds: ["bot-1"]
      },
      config
    ),
    {
      kind: "ignore",
      reason: "empty-mention"
    }
  );
});

test("Discord DMs are limited to owners", () => {
  const config = {
    botUserId: "bot-1",
    dedicatedChannelId: "channel-1",
    ownerUserIds: ["owner-1"]
  };

  assert.equal(
    routeDiscordMessage(
      {
        id: "message-1",
        authorId: "user-1",
        channelId: "dm",
        content: "secret",
        isBot: false,
        isDirectMessage: true,
        mentionedUserIds: []
      },
      config
    ).kind,
    "ignore"
  );
  assert.equal(
    routeDiscordMessage(
      {
        id: "message-2",
        authorId: "owner-1",
        channelId: "dm",
        content: "status",
        isBot: false,
        isDirectMessage: true,
        mentionedUserIds: []
      },
      config
    ).kind,
    "admin-dm"
  );
});

test("slash command config access is owner-only", () => {
  assert.equal(handleSlashCommand({ command: "status", userRole: "viewer" }).content, "Hermes is ready.");
  assert.equal(handleSlashCommand({ command: "config", userRole: "developer" }).content, "권한이 없습니다.");
  assert.equal(handleSlashCommand({ command: "config", userRole: "owner" }).content, "Configuration access granted.");
});

test("news briefing webhook validates secret and delegates summary to Hermes", async () => {
  const service = new HermesNewsBriefingService(
    new TaskPlanner(),
    new SoulPipeline({
      async execute(input) {
        return `${input.soul}: ${input.memoryContext}`;
      }
    })
  );
  const handler = createNewsBriefingWebhookHandler(service, "secret");
  const emptyResponse = await handler({
    headers: {
      "x-n8n-webhook-secret": "secret"
    },
    body: {
      articles: []
    }
  });

  assert.deepEqual(emptyResponse, {
    status: 200,
    body: {
      shouldSend: false,
      discordMessage: "",
      articleCount: 0
    }
  });

  assert.equal(
    (
      await handler({
        headers: {
          "x-n8n-webhook-secret": "wrong"
        },
        body: {
          articles: []
        }
      })
    ).status,
    401
  );

  const response = await handler({
    headers: {
      "x-n8n-webhook-secret": "secret"
    },
    body: {
      articles: [
        {
          title: "AI platform update",
          url: "https://example.com/news"
        }
      ]
    }
  });

  assert.equal(response.status, 200);
  assert.match(JSON.stringify(response.body), /researcher/);
});

test("news briefing webhook keeps Discord messages within content limits", async () => {
  const service = new HermesNewsBriefingService(
    new TaskPlanner(),
    new SoulPipeline({
      async execute() {
        return "x".repeat(2500);
      }
    })
  );
  const handler = createNewsBriefingWebhookHandler(service, "secret");
  const response = await handler({
    headers: {
      "x-n8n-webhook-secret": "secret"
    },
    body: {
      articles: [
        {
          title: "Long briefing",
          url: "https://example.com/long"
        }
      ]
    }
  });
  const body = response.body as { discordMessage: string; shouldSend: boolean };

  assert.equal(response.status, 200);
  assert.equal(body.shouldSend, true);
  assert.equal(body.discordMessage.length, 2000);
  assert.match(body.discordMessage, /truncated for Discord message limit$/);
});

test("news briefing workflow declares JSON export and operating documentation", () => {
  assert.equal(
    newsBriefingWorkflow.jsonExportPath,
    "workflows/news-briefing/news-briefing.n8n.json"
  );
  assert.equal(
    newsBriefingWorkflow.documentationPath,
    "workflows/news-briefing/README.md"
  );
  assert.ok(
    newsBriefingWorkflow.environmentVariables.includes(
      "HERMES_NEWS_BRIEFING_WEBHOOK_URL"
    )
  );
  assert.ok(newsBriefingWorkflow.environmentVariables.includes("DISCORD_BOT_TOKEN"));
});

test("news briefing workflow sends Discord messages without n8n credentials", () => {
  const workflow = JSON.parse(
    readFileSync("workflows/news-briefing/news-briefing.n8n.json", "utf8")
  );
  const sendDiscord = workflow.nodes.find(
    (node: { name?: string }) => node.name === "Send Discord"
  );

  assert.equal(sendDiscord.type, "n8n-nodes-base.httpRequest");
  assert.equal(
    sendDiscord.parameters.url,
    "={{\"https://discord.com/api/v10/channels/\" + $env.NEWS_BRIEFING_DISCORD_CHANNEL_ID + \"/messages\"}}"
  );
  assert.deepEqual(
    sendDiscord.parameters.headerParameters.parameters.find(
      (header: { name?: string }) => header.name === "Authorization"
    ),
    {
      name: "Authorization",
      value: "={{String($env.DISCORD_BOT_TOKEN || \"\").startsWith(\"Bot \") ? String($env.DISCORD_BOT_TOKEN || \"\") : \"Bot \" + String($env.DISCORD_BOT_TOKEN || \"\")}}"
    }
  );
});
