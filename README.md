# AI Assistant Platform

Hermes Agent를 중심으로 Discord, n8n, PostgreSQL, pgvector, MCP 연동을 분리해 구성하는 개인 및 소규모 개발팀용 AI Assistant Platform입니다.

## 초기 범위

- Discord 전용 채널 mention 기반 대화
- 장기 기억과 세션 기록 관리
- PostgreSQL + pgvector 기반 영구 데이터 구조
- Mem0 기반 External Memory 연동 지점
- n8n JSON export 기반 뉴스 브리핑 Workflow
- GitHub MCP와 Filesystem MCP 확장 지점
- Task Planner와 Soul Pipeline

## 개발 명령

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm validate:workflows
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
- `POST /discord/message`
- `POST /webhooks/news-briefing`

PostgreSQL/pgvector:

```bash
docker compose up -d postgres
DATABASE_URL=postgres://postgres:postgres@localhost:5432/hermes pnpm db:migrate
```

## 구조

- `src/domain`: Role, Memory, Soul, Workflow, MCP 같은 핵심 계약
- `src/application`: Hermes orchestration, Task Planner, Soul Pipeline, port 정의
- `src/infrastructure`: OpenAI embedding, Mem0 boundary, PostgreSQL/pgvector SQL
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
