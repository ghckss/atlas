# Operations

## 환경변수

- `PORT`
- `DATABASE_URL`
- `DISCORD_BOT_TOKEN`
- `DISCORD_BOT_USER_ID`
- `DISCORD_GUILD_ID`
- `DISCORD_DEDICATED_CHANNEL_ID`
- `DISCORD_OWNER_USER_IDS`
- `OPENAI_API_KEY`
- `EMBEDDING_PROVIDER`
- `EMBEDDING_MODEL`
- `EMBEDDING_DIMENSIONS`
- `MEM0_API_KEY`
- `MEM0_BASE_URL`
- `N8N_WEBHOOK_SECRET`
- `HERMES_NEWS_BRIEFING_WEBHOOK_URL`
- `NEWS_SOURCE_URLS`
- `NEWS_BRIEFING_DISCORD_CHANNEL_ID`

## Discord 운영

- 전용 채널에서 bot mention이 있는 메시지만 chat으로 처리한다.
- 일반 채널 메시지는 무시한다.
- DM은 Owner 개인 작업이나 민감한 응답에 한해 제한적으로 처리한다.
- 설정 변경과 시스템 변경은 Owner 권한으로 제한한다.

## n8n Workflow 운영

Workflow의 기본 관리 단위는 JSON export와 Markdown 문서이다. JSON 파일은 Git으로 버전 관리하고, 같은 폴더의 README에 목적, 트리거, 입력, 출력, 환경변수, 장애 대응을 기록한다.

뉴스 브리핑 흐름:

1. Scheduler
2. 뉴스 수집
3. Hermes webhook 요약
4. `shouldSend=true`일 때 Discord 전송

## 검증

```bash
pnpm validate
```

검증은 TypeScript typecheck, Node test runner, n8n workflow JSON 검증을 포함한다.

## 로컬 MVP 런타임

```bash
cp .env.example .env
pnpm dev
```

초기 runtime은 외부 SDK 없이 HTTP endpoint로 Discord/n8n 경계를 시뮬레이션한다. 실제 Discord Gateway 연결은 다음 단계에서 `src/interfaces/discord` adapter에 붙인다.

## 로컬 PostgreSQL

```bash
docker compose up -d postgres
DATABASE_URL=postgres://postgres:postgres@localhost:5432/hermes pnpm db:migrate
```

`db:migrate`는 로컬에 `psql` 명령이 있어야 실행된다.
