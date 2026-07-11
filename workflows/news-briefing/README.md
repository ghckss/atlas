# News Briefing Workflow

## 목적

정해진 일정에 뉴스 목록을 수집하고 Hermes에게 요약을 위임한 뒤 Discord 브리핑 채널로 전송한다.

## 트리거

- n8n Schedule Trigger
- 초기 설정은 24시간 간격 실행이다.

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

- Hermes webhook 응답의 `discordMessage`를 Discord 지정 채널로 전송한다.
- Hermes가 전송할 내용이 없다고 판단하면 `shouldSend=false`를 반환하고 Discord 전송을 건너뛴다.

## 환경변수

실행 시 n8n workflow에서 참조하는 값:

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

Discord 전송은 n8n Discord credential을 사용하지 않는다. `Send Discord` 노드는 HTTP Request로 Discord REST API를 직접 호출하며, `DISCORD_BOT_TOKEN`을 `Authorization: Bot ...` 헤더로 사용한다.

Git 저장 JSON export를 n8n API로 반영할 때 사용하는 값:

- `N8N_API_URL`
- `N8N_API_KEY`

```bash
pnpm n8n:sync
```

## 장애 대응

- 뉴스 수집 결과가 비어 있으면 Hermes webhook은 `shouldSend=false`를 반환하며 `Has Briefing` 노드가 Discord 전송을 건너뛴다.
- Hermes webhook이 `401`을 반환하면 `N8N_WEBHOOK_SECRET` 값을 확인한다.
- Hermes webhook이 `400`을 반환하면 뉴스 수집 결과의 article 형식을 확인한다.
- Discord 전송 실패는 n8n 실행 로그, `DISCORD_BOT_TOKEN`, 채널 ID, 봇의 채널 권한을 확인한다.
