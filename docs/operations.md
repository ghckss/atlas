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
- `LLM_PROVIDER`
- `LLM_LOG_FILE`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_BASE_URL`
- `CODEX_CLI_COMMAND`
- `CODEX_CLI_MODEL`
- `CODEX_CLI_PROFILE`
- `CODEX_CLI_SANDBOX`
- `CODEX_CLI_APPROVAL_POLICY`
- `CODEX_CLI_WORKDIR`
- `CODEX_CLI_OSS`
- `CODEX_CLI_LOCAL_PROVIDER`
- `LLM_REQUEST_TIMEOUT_MS`
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
- `NEWS_MAX_ARTICLES`
- `NEWS_SOURCE_URLS`
- `NEWS_COLLECTION_TIMEOUT_MS`
- `NEWS_BRIEFING_DISCORD_CHANNEL_ID`

## Discord 운영

- 전용 채널에서 bot mention이 있는 메시지만 chat으로 처리한다.
- 일반 채널 메시지는 무시한다.
- DM은 Owner 개인 작업이나 민감한 응답에 한해 제한적으로 처리한다.
- 설정 변경과 시스템 변경은 Owner 권한으로 제한한다.

## LLM Provider 운영

기본 runtime은 `LLM_PROVIDER=template`로 동작하며, 이는 로컬 wiring과 workflow 검증용 응답기이다. 실제 운영 답변은 OpenAI API 또는 로컬 Codex CLI 중 하나를 선택해서 받는다. provider 변경 후에는 Hermes runtime을 재시작해야 한다.

OpenAI API를 직접 호출하려면 다음 값을 설정한다.

```env
LLM_PROVIDER=openai
LLM_LOG_FILE=logs/llm-runtime.log
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6
OPENAI_BASE_URL=https://api.openai.com
LLM_REQUEST_TIMEOUT_MS=30000
```

OpenAI provider는 Responses API를 호출한다.

LLM runtime 로그는 provider와 무관하게 `LLM_LOG_FILE` 하나에 JSON Lines 형식으로 저장한다. 각 이벤트에는 `provider` 필드가 포함되므로 `openai`와 `codex-cli` 실행을 같은 파일에서 구분할 수 있다. 프롬프트 본문과 API key는 저장하지 않고, `soul`, `model`, 요청/응답 크기, 상태 코드, request id, duration, 오류 메시지 같은 운영 진단 정보만 남긴다.

최근 LLM 로그를 확인하면서 실시간으로 따라가려면 provider와 무관하게 다음 명령을 사용한다.

```bash
pnpm logs
```

마지막 100줄만 보고 종료하려면 다음처럼 실행한다.

```bash
pnpm logs -- --latest
```

`pnpm logs`는 `LLM_LOG_FILE` 하나를 따라간다. 어떤 provider로 실행됐는지는 각 JSONL 이벤트의 `provider` 값을 확인한다.

OpenAI API key 대신 로컬 Codex CLI를 통해 답변을 생성하려면 먼저 터미널에서 `codex login` 또는 사용할 로컬 provider 설정을 완료한 뒤 다음 값을 설정한다.

```env
LLM_PROVIDER=codex-cli
LLM_LOG_FILE=logs/llm-runtime.log
CODEX_CLI_COMMAND=codex
CODEX_CLI_MODEL=
CODEX_CLI_PROFILE=
CODEX_CLI_SANDBOX=read-only
CODEX_CLI_APPROVAL_POLICY=never
CODEX_CLI_WORKDIR=/Users/hwanghochan/workspace/private/ai-assistant-platform
LLM_REQUEST_TIMEOUT_MS=120000
```

Codex CLI provider는 `codex exec`를 stdin 기반으로 실행하고 최종 메시지만 Discord 응답으로 사용한다. 기본값은 `read-only` sandbox와 `never` approval이므로 답변 생성 중 파일을 수정하지 않는다. 저장소 파일 분석까지 CLI에 맡기고 싶을 때만 `CODEX_CLI_WORKDIR`를 프로젝트 경로로 지정한다.

Ollama 또는 LM Studio 같은 Codex CLI의 OSS/local provider를 쓰려면 다음 값을 추가한다.

```env
CODEX_CLI_OSS=true
CODEX_CLI_LOCAL_PROVIDER=ollama
```

Codex CLI runtime 로그도 같은 `LLM_LOG_FILE`에 기록된다. 로그 확인 커맨드는 OpenAI와 동일하게 `pnpm logs`를 사용한다.

## n8n Workflow 운영

Workflow의 기본 관리 단위는 JSON export와 Markdown 문서이다. JSON 파일은 Git으로 버전 관리하고, 같은 폴더의 README에 목적, 트리거, 입력, 출력, 환경변수, 장애 대응을 기록한다.

뉴스 브리핑 흐름:

1. Scheduler가 매일 10:00 Asia/Seoul에 실행
2. `HERMES_NEWS_COLLECTION_URL` 호출
3. Hermes runtime이 `NEWS_PROVIDERS`와 `NEWS_QUERY`로 뉴스를 수집하고 `{ articles }`로 정규화
4. Hermes webhook 요약
5. `shouldSend=true`일 때 Discord REST API로 전송
6. 메시지가 Discord 2000자 제한을 넘으면 첫 메시지 아래 thread를 만들고 나머지 내용을 thread에 이어서 전송

JSON export를 n8n 인스턴스에 반영하려면 `N8N_API_URL`과 `N8N_API_KEY`를 설정한 뒤 다음 명령을 실행한다.

```bash
pnpm n8n:sync
```

동기화 스크립트는 workflow name을 기준으로 기존 workflow를 찾아 `PUT`으로 업데이트하고, 없으면 `POST`로 생성한다.

뉴스 브리핑의 `Send Discord` 노드는 n8n Discord credential을 사용하지 않는다. n8n 컨테이너 env의 `DISCORD_BOT_TOKEN`과 `NEWS_BRIEFING_DISCORD_CHANNEL_ID`를 사용해 Discord REST API를 직접 호출한다. `Prepare Discord Message` 노드는 빈 메시지를 걸러내고 Discord 2000자 제한을 재확인하며, `Send Discord`는 raw JSON body로 `{ content, flags, allowed_mentions }`를 전송한다. `flags=4`는 링크 embed preview를 억제한다. 추가 메시지가 있으면 `Create Discord Thread`가 첫 메시지 아래 thread를 만들고 `Send Thread Message`가 나머지를 전송한다.

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

기본 방식은 provider 기반 헤드라인 수집이다.

```env
NEWS_PROVIDERS=google-news-top
NEWS_QUERY=
NEWS_GOOGLE_LANGUAGE=ko
NEWS_GOOGLE_COUNTRY=KR
NEWS_MAX_ARTICLES=10
```

`google-news-top`은 키워드 검색이 아니라 Google News Top Stories RSS를 사용한다. 오늘 봐야 할 주요 이슈를 넓게 훑는 기본값이다.

관심 키워드 검색이 필요할 때만 `google-news` 또는 `naver-news` provider와 `NEWS_QUERY`를 함께 사용한다. Naver 뉴스 검색을 쓰려면 네이버 개발자 센터에서 Search API 애플리케이션을 등록하고 다음 값을 추가한다.

```env
NEWS_PROVIDERS=google-news-top,naver-news
NEWS_QUERY=AI OR 인공지능
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
