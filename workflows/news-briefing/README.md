# News Briefing Workflow

## 목적

정해진 일정에 뉴스 목록을 수집하고 Hermes에게 요약을 위임한 뒤 Discord 브리핑 채널로 전송한다.

## 트리거

- n8n Schedule Trigger
- 초기 설정은 24시간 간격 실행이다.

## 입력

- `NEWS_SOURCE_URLS`: 뉴스 수집 API 또는 중간 수집 엔드포인트
- 수집 결과는 `{ "articles": [...] }` 형태를 기대한다.
- 각 article은 최소 `title`, `url`을 포함해야 한다.

## 출력

- Hermes webhook 응답의 `discordMessage`를 Discord 지정 채널로 전송한다.
- Hermes가 전송할 내용이 없다고 판단하면 `shouldSend=false`를 반환하고 Discord 전송을 건너뛴다.

## 환경변수

- `N8N_WEBHOOK_SECRET`
- `HERMES_NEWS_BRIEFING_WEBHOOK_URL`
- `NEWS_SOURCE_URLS`
- `DISCORD_GUILD_ID`
- `NEWS_BRIEFING_DISCORD_CHANNEL_ID`

## 장애 대응

- 뉴스 수집 결과가 비어 있으면 Hermes webhook은 `shouldSend=false`를 반환하며 `Has Briefing` 노드가 Discord 전송을 건너뛴다.
- Hermes webhook이 `401`을 반환하면 `N8N_WEBHOOK_SECRET` 값을 확인한다.
- Hermes webhook이 `400`을 반환하면 뉴스 수집 결과의 article 형식을 확인한다.
- Discord 전송 실패는 n8n 실행 로그와 Discord credential 권한을 확인한다.
