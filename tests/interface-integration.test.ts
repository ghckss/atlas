import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createNewsBriefingWebhookHandler,
  createScheduleBriefingWebhookHandler,
  handleSlashCommand,
  HermesNewsBriefingService,
  ScheduleService,
  routeDiscordMessage,
  SoulPipeline,
  TaskPlanner,
  newsBriefingWorkflow,
  scheduleBriefingWorkflow
} from "../src";
import type { ScheduleBriefingRequest } from "../src";

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
  assert.deepEqual(
    routeDiscordMessage(
      {
        id: "message-4",
        authorId: "user-1",
        channelId: "channel-1",
        content: "<@bot-1> fallback mention",
        isBot: false,
        isDirectMessage: false,
        mentionedUserIds: []
      },
      config
    ),
    {
      kind: "chat",
      content: "fallback mention"
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
      discordMessages: [],
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
  const body = response.body as {
    discordMessage: string;
    discordMessages: readonly string[];
    shouldSend: boolean;
  };

  assert.equal(response.status, 200);
  assert.equal(body.shouldSend, true);
  assert.equal(body.discordMessage.length, 2000);
  assert.equal(body.discordMessages.length, 2);
  assert.equal(body.discordMessages[0].length, 2000);
  assert.equal(body.discordMessages[1].length, 500);
});

test("news briefing webhook uses compact Discord output for the local MVP runtime", async () => {
  const service = new HermesNewsBriefingService(
    new TaskPlanner(),
    new SoulPipeline({
      async execute(input) {
        return [
          `[${input.soul}] 이번 뉴스 브리핑을 조사하고 요약해줘`,
          "",
          input.memoryContext,
          "",
          "로컬 MVP 런타임 응답입니다. 실제 LLM provider 연결 전까지 이 응답기는 service wiring과 workflow 검증에 사용됩니다."
        ].join("\n");
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
          title: "범죄 막겠다며 AI로 민간인 감시",
          url: "https://news.google.com/rss/articles/example",
          source: "조선일보",
          publishedAt: "Thu, 09 Jul 2026 15:57:04 GMT",
          summary: "<a href=\"https://example.com\">raw html</a>"
        },
        {
          title: "오늘 봐야 할 주요 이슈",
          url: "https://news.google.com/rss/articles/example-2",
          source: "연합뉴스"
        },
        {
          title: "세 번째 주요 뉴스",
          url: "https://news.google.com/rss/articles/example-3",
          source: "KBS"
        },
        {
          title: "네 번째 주요 뉴스",
          url: "https://news.google.com/rss/articles/example-4",
          source: "MBC"
        },
        {
          title: "다섯 번째 주요 뉴스",
          url: "https://news.google.com/rss/articles/example-5",
          source: "SBS"
        },
        {
          title: "여섯 번째 주요 뉴스",
          url: "https://news.google.com/rss/articles/example-6",
          source: "JTBC"
        }
      ]
    }
  });
  const body = response.body as {
    discordMessage: string;
    discordMessages: readonly string[];
    shouldSend: boolean;
  };

  assert.equal(response.status, 200);
  assert.equal(body.shouldSend, true);
  assert.match(body.discordMessage, /오늘의 뉴스 브리핑 \(\d{4}-\d{2}-\d{2}\)/);
  assert.match(
    body.discordMessage,
    /\[범죄 막겠다며 AI로 민간인 감시\]\(https:\/\/news\.google\.com\/rss\/articles\/example\) \(조선일보\)/
  );
  assert.match(
    body.discordMessage,
    /1\. \[범죄 막겠다며 AI로 민간인 감시\]\(https:\/\/news\.google\.com\/rss\/articles\/example\) \(조선일보\)\n2\. \[오늘 봐야 할 주요 이슈\]\(https:\/\/news\.google\.com\/rss\/articles\/example-2\) \(연합뉴스\)/
  );
  assert.match(body.discordMessage, /6\. \[여섯 번째 주요 뉴스\]/);
  assert.equal(body.discordMessages[0], body.discordMessage);
  assert.doesNotMatch(body.discordMessage, /\n\n2\./);
  assert.doesNotMatch(body.discordMessage, /외 1건/);
  assert.doesNotMatch(body.discordMessage, /publishedAt=/);
  assert.doesNotMatch(body.discordMessage, /<a href/);
  assert.doesNotMatch(body.discordMessage, /로컬 MVP 런타임/);
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

test("news briefing workflow runs every day at 10 in Seoul timezone", () => {
  const workflow = JSON.parse(
    readFileSync("workflows/news-briefing/news-briefing.n8n.json", "utf8")
  );
  const schedule = workflow.nodes.find(
    (node: { name?: string }) => node.name === "Daily Schedule"
  );

  assert.deepEqual(schedule.parameters.rule.interval, [
    {
      field: "days",
      daysInterval: 1,
      triggerAtHour: 10,
      triggerAtMinute: 0
    }
  ]);
  assert.equal(workflow.settings.timezone, "Asia/Seoul");
});

test("news briefing workflow sends Discord messages without n8n credentials", () => {
  const workflow = JSON.parse(
    readFileSync("workflows/news-briefing/news-briefing.n8n.json", "utf8")
  );
  assert.doesNotMatch(JSON.stringify(workflow), /\$env/);
  const prepareDiscord = workflow.nodes.find(
    (node: { name?: string }) => node.name === "Prepare Discord Message"
  );
  const sendDiscord = workflow.nodes.find(
    (node: { name?: string }) => node.name === "Send Discord"
  );
  const hasThreadMessages = workflow.nodes.find(
    (node: { name?: string }) => node.name === "Has Thread Messages"
  );
  const createThread = workflow.nodes.find(
    (node: { name?: string }) => node.name === "Create Discord Thread"
  );
  const prepareThreadMessages = workflow.nodes.find(
    (node: { name?: string }) => node.name === "Prepare Thread Messages"
  );
  const hasPreparedThreadContent = workflow.nodes.find(
    (node: { name?: string }) => node.name === "Has Prepared Thread Content"
  );
  const sendThreadMessage = workflow.nodes.find(
    (node: { name?: string }) => node.name === "Send Thread Message"
  );

  assert.equal(prepareDiscord.type, "n8n-nodes-base.code");
  assert.match(prepareDiscord.parameters.jsCode, /return \[\]/);
  assert.match(prepareDiscord.parameters.jsCode, /threadMessages/);
  assert.match(prepareDiscord.parameters.jsCode, /flags: 4/);
  assert.equal(sendDiscord.type, "n8n-nodes-base.httpRequest");
  assert.equal(
    sendDiscord.parameters.url,
    "https://discord.com/api/v10/channels/{{ENV:NEWS_BRIEFING_DISCORD_CHANNEL_ID}}/messages"
  );
  assert.equal(sendDiscord.parameters.contentType, "json");
  assert.equal(sendDiscord.parameters.specifyBody, "json");
  assert.equal(sendDiscord.parameters.jsonBody, "={{JSON.stringify($json.discordPayload)}}");
  assert.equal(hasThreadMessages.type, "n8n-nodes-base.if");
  assert.equal(createThread.type, "n8n-nodes-base.httpRequest");
  assert.match(createThread.parameters.url, /\/threads/);
  assert.equal(prepareThreadMessages.type, "n8n-nodes-base.code");
  assert.match(prepareThreadMessages.parameters.jsCode, /Prepare Discord Message/);
  assert.match(prepareThreadMessages.parameters.jsCode, /\$\('Prepare Discord Message'\)/);
  assert.equal(hasPreparedThreadContent.type, "n8n-nodes-base.if");
  assert.match(
    hasPreparedThreadContent.parameters.conditions.string[0].value1,
    /\$json\.content/
  );
  assert.equal(sendThreadMessage.type, "n8n-nodes-base.httpRequest");
  assert.match(sendThreadMessage.parameters.url, /threadId/);
  assert.match(sendThreadMessage.parameters.jsonBody, /\$json\.content/);
  assert.doesNotMatch(sendThreadMessage.parameters.jsonBody, /discordPayload/);
  assert.deepEqual(
    sendDiscord.parameters.headerParameters.parameters.find(
      (header: { name?: string }) => header.name === "Authorization"
    ),
    {
      name: "Authorization",
      value: "{{ENV:DISCORD_BOT_TOKEN_AUTH_HEADER}}"
    }
  );
  assert.equal(
    workflow.connections["Has Briefing"].main[0][0].node,
    "Prepare Discord Message"
  );
  assert.equal(
    workflow.connections["Prepare Discord Message"].main[0][0].node,
    "Send Discord"
  );
  assert.equal(
    workflow.connections["Send Discord"].main[0][0].node,
    "Has Thread Messages"
  );
  assert.equal(
    workflow.connections["Has Thread Messages"].main[0][0].node,
    "Create Discord Thread"
  );
  assert.equal(
    workflow.connections["Create Discord Thread"].main[0][0].node,
    "Prepare Thread Messages"
  );
  assert.equal(
    workflow.connections["Prepare Thread Messages"].main[0][0].node,
    "Has Prepared Thread Content"
  );
  assert.equal(
    workflow.connections["Has Prepared Thread Content"].main[0][0].node,
    "Send Thread Message"
  );
});

test("schedule briefing webhook validates secret and delegates schedule summary", async () => {
  const handler = createScheduleBriefingWebhookHandler(
    {
      async buildBriefing(input: ScheduleBriefingRequest) {
        return {
          shouldSend: true,
          discordMessage: `${input.mode}:${input.date}:${input.discordGuildId}:${input.discordChannelId}`,
          discordMessages: [`${input.mode}:${input.date}:${input.discordGuildId}:${input.discordChannelId}`],
          eventCount: 1
        };
      }
    } as unknown as ScheduleService,
    "secret",
    {
      discordGuildId: "guild-1",
      discordChannelId: "schedule-channel",
      timezone: "Asia/Seoul"
    }
  );

  assert.equal(
    (
      await handler({
        headers: {
          "x-n8n-webhook-secret": "wrong"
        },
        body: {
          mode: "daily"
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
      mode: "monthly",
      date: "2026-07-01"
    }
  });

  assert.deepEqual(response, {
    status: 200,
    body: {
      shouldSend: true,
      discordMessage: "monthly:2026-07-01:guild-1:schedule-channel",
      discordMessages: ["monthly:2026-07-01:guild-1:schedule-channel"],
      eventCount: 1
    }
  });
});

test("schedule briefing workflow declares automation and Discord delivery", () => {
  assert.equal(
    scheduleBriefingWorkflow.jsonExportPath,
    "workflows/schedule-briefing/schedule-briefing.n8n.json"
  );
  assert.ok(
    scheduleBriefingWorkflow.environmentVariables.includes(
      "HERMES_SCHEDULE_BRIEFING_WEBHOOK_URL"
    )
  );
  assert.ok(
    scheduleBriefingWorkflow.environmentVariables.includes(
      "GOOGLE_CALENDAR_REFRESH_TOKEN"
    )
  );
  const workflow = JSON.parse(
    readFileSync("workflows/schedule-briefing/schedule-briefing.n8n.json", "utf8")
  );
  assert.doesNotMatch(JSON.stringify(workflow), /\$env/);
  const schedule = workflow.nodes.find(
    (node: { name?: string }) => node.name === "Daily Schedule"
  );
  const prepareRequests = workflow.nodes.find(
    (node: { name?: string }) => node.name === "Prepare Schedule Requests"
  );
  const requestBriefing = workflow.nodes.find(
    (node: { name?: string }) => node.name === "Request Schedule Briefing"
  );
  const sendDiscord = workflow.nodes.find(
    (node: { name?: string }) => node.name === "Send Discord"
  );

  assert.deepEqual(schedule.parameters.rule.interval, [
    {
      field: "days",
      daysInterval: 1,
      triggerAtHour: 10,
      triggerAtMinute: 0
    }
  ]);
  assert.match(prepareRequests.parameters.jsCode, /mode: 'daily'/);
  assert.match(prepareRequests.parameters.jsCode, /mode: 'monthly'/);
  assert.doesNotMatch(prepareRequests.parameters.jsCode, /\$env/);
  assert.equal(
    requestBriefing.parameters.url,
    "{{ENV:HERMES_SCHEDULE_BRIEFING_WEBHOOK_URL}}"
  );
  assert.equal(sendDiscord.parameters.url, "https://discord.com/api/v10/channels/{{ENV:SCHEDULE_BRIEFING_DISCORD_CHANNEL_ID}}/messages");
  assert.equal(workflow.settings.timezone, "Asia/Seoul");
});
