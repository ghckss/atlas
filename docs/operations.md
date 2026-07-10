# Operations

## 환경변수

- `PORT`
- `DATABASE_URL`
- `DISCORD_BOT_TOKEN`
- `DISCORD_BOT_USER_ID`
- `DISCORD_ENABLE_GATEWAY`
- `DISCORD_GUILD_ID`
- `DISCORD_DEDICATED_CHANNEL_ID`
- `DISCORD_OWNER_USER_IDS`
- `OPENAI_API_KEY`
- `EMBEDDING_PROVIDER`
- `EMBEDDING_MODEL`
- `EMBEDDING_DIMENSIONS`
- `MEM0_API_KEY`
- `MEM0_BASE_URL`
- `N8N_API_URL`
- `N8N_API_KEY`
- `N8N_WEBHOOK_SECRET`
- `HERMES_NEWS_COLLECTION_URL`
- `HERMES_NEWS_BRIEFING_WEBHOOK_URL`
- `NEWS_PROVIDERS`
- `NEWS_QUERY`
- `NEWS_GOOGLE_LANGUAGE`
- `NEWS_GOOGLE_COUNTRY`
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`
- `NEWS_NAVER_DISPLAY`
- `NEWS_SOURCE_URLS`
- `NEWS_COLLECTION_TIMEOUT_MS`
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
2. `HERMES_NEWS_COLLECTION_URL` 호출
3. Hermes runtime이 `NEWS_PROVIDERS`와 `NEWS_QUERY`로 뉴스를 수집하고 `{ articles }`로 정규화
4. Hermes webhook 요약
5. `shouldSend=true`일 때 Discord 전송

JSON export를 n8n 인스턴스에 반영하려면 `N8N_API_URL`과 `N8N_API_KEY`를 설정한 뒤 다음 명령을 실행한다.

```bash
pnpm n8n:sync
```

동기화 스크립트는 workflow name을 기준으로 기존 workflow를 찾아 `PATCH`하고, 없으면 `POST`로 생성한다.

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

초기 runtime은 HTTP endpoint로 Discord/n8n 경계를 시뮬레이션할 수 있고, `DISCORD_ENABLE_GATEWAY=true`일 때 실제 Discord Gateway adapter도 함께 실행한다.

실제 Discord Gateway를 켜려면 `DISCORD_ENABLE_GATEWAY=true`를 설정한다. Bot token, bot user id, dedicated channel id가 필요하며, Discord Developer Portal에서 Message Content Intent를 활성화해야 한다.

뉴스 수집은 `GET /news/articles`에서 확인할 수 있다.

기본 방식은 provider 기반 수집이다.

```env
NEWS_PROVIDERS=google-news
NEWS_QUERY=AI
NEWS_GOOGLE_LANGUAGE=ko
NEWS_GOOGLE_COUNTRY=KR
```

Naver 뉴스 검색도 함께 쓰려면 네이버 개발자 센터에서 Search API 애플리케이션을 등록하고 다음 값을 추가한다.

```env
NEWS_PROVIDERS=google-news,naver-news
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...
NEWS_NAVER_DISPLAY=10
```

`NEWS_SOURCE_URLS`는 수동 JSON 또는 RSS source를 추가할 때만 사용한다. 쉼표로 구분하며, JSON source는 배열 또는 `{ "articles": [...] }`, `{ "items": [...] }`, `{ "data": [...] }` 형태를 반환해야 한다.

## Mem0 External Memory

`MEM0_API_KEY`를 설정하면 runtime은 인메모리 저장소 대신 Mem0 REST adapter를 사용한다. `MEM0_BASE_URL` 기본값은 `https://api.mem0.ai`이며, self-hosted endpoint를 사용할 때만 변경한다.

Mem0 검색은 현재 사용자와 project/team/organization scope에 해당하는 namespace metadata만 포함하도록 필터링한다. `MEM0_API_KEY`가 없으면 로컬 개발용 인메모리 저장소로 동작한다.

## 로컬 PostgreSQL

```bash
docker compose up -d postgres
DATABASE_URL=postgres://postgres:postgres@localhost:5432/hermes pnpm db:migrate
```

`db:migrate`는 로컬에 `psql` 명령이 있어야 실행된다.
