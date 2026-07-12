# News Briefing Workflow

## 목적

정해진 일정에 뉴스 목록을 수집하고 Hermes에게 요약을 위임한 뒤 Discord 브리핑 채널로 전송한다.

## 트리거

- n8n Schedule Trigger
- 매일 10:00에 실행한다.
- JSON export는 workflow timezone을 `Asia/Seoul`로 명시한다. n8n 인스턴스의 timezone 설정을 별도로 운영한다면 동일하게 `Asia/Seoul`로 맞춘다.

## 입력

- `HERMES_NEWS_COLLECTION_URL`: Hermes runtime의 뉴스 수집 엔드포인트
- Hermes runtime은 `NEWS_PROVIDERS`를 기준으로 뉴스를 수집해 article 목록으로 정규화한다.
- `google-news-top` provider는 Google News Top Stories RSS를 사용한다.
- `google-news` provider는 `NEWS_QUERY` 기반 Google News RSS 검색을 사용한다.
- `naver-news` provider는 Naver Search API를 사용하며 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`이 필요하다.
- `NEWS_SOURCE_URLS`는 수동 JSON 또는 RSS source를 추가할 때만 사용한다.
- 수집 결과는 `{ "articles": [...] }` 형태를 기대한다.
- 각 article은 최소 `title`, `url`을 포함해야 한다.

## 출력

- Hermes webhook 응답의 `discordMessages`를 Discord 지정 채널로 전송한다.
- 첫 메시지는 채널에 전송하고, 추가 메시지가 있으면 첫 메시지 아래 thread를 생성해 이어서 전송한다.
- Hermes가 전송할 내용이 없다고 판단하면 `shouldSend=false`를 반환하고 Discord 전송을 건너뛴다.

## 환경변수

`pnpm n8n:sync` 실행 시 workflow payload에 주입되는 값:

- `N8N_WEBHOOK_SECRET`
- `DISCORD_BOT_TOKEN`
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
- `NEWS_BRIEFING_DISCORD_CHANNEL_ID`

Discord 전송은 n8n Discord credential을 사용하지 않는다. `Prepare Discord Message` 노드가 빈 메시지와 2000자 초과 메시지를 방어하고, `Send Discord` 노드는 HTTP Request로 Discord REST API를 직접 호출한다. `DISCORD_BOT_TOKEN`을 `Authorization: Bot ...` 헤더로 사용하며, body는 JSON `{ content, flags, allowed_mentions }` 형식으로 전송한다. `flags=4`는 링크 embed preview를 억제한다. 추가 메시지는 `Create Discord Thread`와 `Send Thread Message`를 통해 첫 메시지 아래 thread로 전송한다.

Git 저장 JSON export를 n8n API로 반영할 때 사용하는 값:

- `N8N_API_URL`
- `N8N_API_KEY`

```bash
pnpm n8n:sync
```

Git에 저장된 JSON export는 `{{ENV:NAME}}` placeholder를 사용한다. 이 placeholder는 sync 시점에 `.env` 값으로 치환되므로 n8n 실행 중 `$env` 접근 권한이 필요하지 않다.

## 장애 대응

- 뉴스 수집 결과가 비어 있으면 Hermes webhook은 `shouldSend=false`를 반환하며 `Has Briefing` 노드가 Discord 전송을 건너뛴다.
- Hermes webhook이 `401`을 반환하면 `N8N_WEBHOOK_SECRET` 값을 확인한다.
- Hermes webhook이 `400`을 반환하면 뉴스 수집 결과의 article 형식을 확인한다.
- Discord 전송 `Authorization failed`는 `DISCORD_BOT_TOKEN` 값을 확인한다.
- Discord 전송 `Bad request` 또는 `Invalid Form Body`는 `Prepare Discord Message` 출력의 `discordMessage`가 비어 있지 않은지, `Send Discord` body가 JSON 형식인지 확인한다.
- Discord 전송 권한 실패는 `NEWS_BRIEFING_DISCORD_CHANNEL_ID`와 봇의 채널 권한을 확인한다. Thread 전송을 위해 봇에는 thread 생성 및 thread 메시지 전송 권한도 필요하다.
