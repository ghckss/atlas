# AI Assistant Platform

Hermes Agent를 중심으로 Discord, n8n, PostgreSQL, pgvector, MCP 연동을 분리해 구성하는 개인 및 소규모 개발팀용 AI Assistant Platform입니다.

## 초기 범위

- Discord 전용 채널 mention 기반 대화
- 장기 기억과 세션 기록 관리
- PostgreSQL + pgvector 기반 영구 데이터 구조
- Mem0 Platform REST 기반 External Memory 연동
- n8n JSON export 기반 뉴스 브리핑 Workflow와 API 동기화
- Hermes runtime 기반 Google/Naver 뉴스 수집 엔드포인트
- GitHub MCP와 Filesystem MCP 확장 지점
- Task Planner와 Soul Pipeline

## 개발 명령

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm validate:workflows
pnpm n8n:sync
pnpm validate
```

## 로컬 MVP 실행

```bash
cp .env.example .env
pnpm dev
```

최소 실행에 필요한 값:

- `DISCORD_BOT_USER_ID`
- `DISCORD_DEDICATED_CHANNEL_ID`
- `N8N_WEBHOOK_SECRET`

로컬 HTTP 엔드포인트:

- `GET /health`
- `GET /news/articles`
- `POST /discord/message`
- `POST /webhooks/news-briefing`

실제 Discord Gateway 연결:

```bash
DISCORD_ENABLE_GATEWAY=true pnpm dev
```

Gateway 연결에는 `DISCORD_BOT_TOKEN`, `DISCORD_BOT_USER_ID`, `DISCORD_DEDICATED_CHANNEL_ID`가 필요합니다. Discord Developer Portal에서 Message Content Intent도 활성화해야 mention 메시지 내용을 읽을 수 있습니다.

PostgreSQL/pgvector:

```bash
docker compose up -d postgres
DATABASE_URL=postgres://postgres:postgres@localhost:5432/hermes pnpm db:migrate
```

Mem0 External Memory:

```bash
MEM0_API_KEY=... pnpm dev
```

`MEM0_BASE_URL` 기본값은 `https://api.mem0.ai`입니다. self-hosted Mem0 REST endpoint를 사용할 때만 바꿉니다.

실제 LLM 응답:

```env
LLM_PROVIDER=openai
LLM_LOG_FILE=logs/llm-runtime.log
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6
```

`LLM_PROVIDER=template`는 로컬 wiring 검증용 응답기를 사용한다. Discord에서 실제 모델 답변을 받으려면 `openai` 또는 `codex-cli`로 변경한 뒤 runtime을 재시작한다.

LLM 실행 로그는 provider와 무관하게 `pnpm logs`로 실시간 확인할 수 있다.

n8n Workflow 동기화:

```bash
N8N_API_URL=http://localhost:5678 N8N_API_KEY=... pnpm n8n:sync
```

Workflow JSON의 `{{ENV:NAME}}` 값은 `pnpm n8n:sync` 실행 시 `.env`에서 읽어 n8n payload에 주입한다. n8n 실행 중 `$env` 접근은 사용하지 않는다.

Discord slash command 동기화:

```bash
pnpm discord:commands:sync
```

뉴스 브리핑 workflow는 매일 10:00 Asia/Seoul에 실행되며, `HERMES_NEWS_COLLECTION_URL`에서 article 목록을 가져온 뒤 Hermes webhook으로 요약을 위임합니다.

일정 기능은 `/일정` slash command로 모달을 열어 저장한다. `GOOGLE_CALENDAR_ENABLED=true`이면 등록된 일정을 Google Calendar에도 생성하고, 자연어 일정 조회와 n8n 일정 브리핑은 Google Calendar의 실제 이벤트를 읽어 PostgreSQL 일정과 병합한다. 일정 브리핑 workflow는 매일 10:00에 당일 일정을, 매월 1일 10:00에 해당 월 전체 일정을 Discord로 전송한다.

뉴스는 기본적으로 `NEWS_PROVIDERS=google-news-top`을 사용해 Google News Top Stories를 수집합니다. 관심 키워드 검색을 추가하려면 `NEWS_PROVIDERS=google-news-top,naver-news`와 `NEWS_QUERY`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`을 설정합니다. `NEWS_SOURCE_URLS`는 수동 JSON/RSS source를 추가할 때만 사용합니다.

## 구조

- `src/domain`: Role, Memory, Soul, Workflow, MCP 같은 핵심 계약
- `src/application`: Hermes orchestration, Task Planner, Soul Pipeline, port 정의
- `src/infrastructure`: OpenAI embedding, Mem0 REST adapter, n8n API client, news source client, PostgreSQL/pgvector SQL
- `src/interfaces`: Discord, HTTP webhook 같은 외부 인터페이스
- `db/migrations`: PostgreSQL/pgvector 스키마
- `workflows`: n8n JSON export와 운영 문서
- `memory`: 사람이 관리하는 USER.md/MEMORY.md 원본
- `docs`: 아키텍처와 운영 가이드

## 원칙

- Hermes는 추론과 의사결정을 담당하고 Workflow를 직접 관리하지 않습니다.
- n8n은 Scheduler, Trigger, 외부 Workflow 오케스트레이션을 담당합니다.
- USER.md와 MEMORY.md는 파일을 원본으로 두며 Git으로 변경 이력을 관리합니다.
- 자동 학습된 기억은 USER.md/MEMORY.md에 직접 쓰지 않고 External Memory에 저장합니다.
- 모든 외부 연동은 port/adapter 경계를 통해 교체 가능하게 둡니다.

## 문서

- [Architecture](docs/architecture.md)
- [Memory](docs/memory.md)
- [Operations](docs/operations.md)
