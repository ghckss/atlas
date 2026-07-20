export const workflowTriggers = [
  "scheduler",
  "cron",
  "discord-trigger",
  "github-webhook",
  "manual"
] as const;

export type WorkflowTrigger = (typeof workflowTriggers)[number];

export interface WorkflowAsset {
  id: string;
  purpose: string;
  trigger: WorkflowTrigger;
  jsonExportPath: string;
  documentationPath: string;
  environmentVariables: readonly string[];
  failureHandling: readonly string[];
}

export const newsBriefingWorkflow: WorkflowAsset = {
  id: "news-briefing",
  purpose: "뉴스를 수집하고 Hermes 요약을 거쳐 Discord 지정 채널로 전송한다.",
  trigger: "scheduler",
  jsonExportPath: "workflows/news-briefing/news-briefing.n8n.json",
  documentationPath: "workflows/news-briefing/README.md",
  environmentVariables: [
    "N8N_API_URL",
    "N8N_API_KEY",
    "N8N_WEBHOOK_SECRET",
    "DISCORD_BOT_TOKEN",
    "HERMES_NEWS_COLLECTION_URL",
    "HERMES_NEWS_BRIEFING_WEBHOOK_URL",
    "NEWS_PROVIDERS",
    "NEWS_QUERY",
    "NEWS_GOOGLE_LANGUAGE",
    "NEWS_GOOGLE_COUNTRY",
    "NEWS_MAX_ARTICLES",
    "NEWS_SOURCE_URLS",
    "NEWS_COLLECTION_TIMEOUT_MS",
    "NEWS_BRIEFING_DISCORD_CHANNEL_ID"
  ],
  failureHandling: [
    "뉴스 수집 결과가 비어 있으면 빈 브리핑을 전송하지 않는다.",
    "Hermes 요약 실패 시 원문 링크와 실패 사유를 운영 로그에 남긴다.",
    "Discord 전송 실패 시 n8n 재시도 정책을 사용한다."
  ]
};

export const scheduleBriefingWorkflow: WorkflowAsset = {
  id: "schedule-briefing",
  purpose: "등록된 일정을 조회해 매일 및 매월 Discord 지정 채널로 요약 전송한다.",
  trigger: "scheduler",
  jsonExportPath: "workflows/schedule-briefing/schedule-briefing.n8n.json",
  documentationPath: "workflows/schedule-briefing/README.md",
  environmentVariables: [
    "N8N_API_URL",
    "N8N_API_KEY",
    "N8N_WEBHOOK_SECRET",
    "DISCORD_BOT_TOKEN",
    "DISCORD_GUILD_ID",
    "HERMES_SCHEDULE_BRIEFING_WEBHOOK_URL",
    "SCHEDULE_BRIEFING_DISCORD_CHANNEL_ID",
    "GOOGLE_CALENDAR_ENABLED",
    "GOOGLE_CALENDAR_ID",
    "GOOGLE_CALENDAR_CLIENT_ID",
    "GOOGLE_CALENDAR_CLIENT_SECRET",
    "GOOGLE_CALENDAR_REFRESH_TOKEN",
    "GOOGLE_CALENDAR_DEFAULT_EVENT_DURATION_MINUTES"
  ],
  failureHandling: [
    "Hermes webhook이 빈 브리핑을 반환하면 Discord 전송을 건너뛴다.",
    "Hermes webhook이 401을 반환하면 N8N_WEBHOOK_SECRET 값을 확인한다.",
    "Discord 전송 실패 시 n8n 재시도 정책을 사용한다."
  ]
};
