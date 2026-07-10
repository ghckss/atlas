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
  purpose: "뉴스를 수집하고 Hermes 요약을 거쳐 Discord 전용 채널로 전송한다.",
  trigger: "scheduler",
  jsonExportPath: "workflows/news-briefing/news-briefing.n8n.json",
  documentationPath: "workflows/news-briefing/README.md",
  environmentVariables: [
    "N8N_WEBHOOK_SECRET",
    "HERMES_NEWS_BRIEFING_WEBHOOK_URL",
    "NEWS_SOURCE_URLS",
    "NEWS_BRIEFING_DISCORD_CHANNEL_ID"
  ],
  failureHandling: [
    "뉴스 수집 결과가 비어 있으면 빈 브리핑을 전송하지 않는다.",
    "Hermes 요약 실패 시 원문 링크와 실패 사유를 운영 로그에 남긴다.",
    "Discord 전송 실패 시 n8n 재시도 정책을 사용한다."
  ]
};
