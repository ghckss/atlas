# Schedule Briefing Workflow

## 목적

등록된 일정을 정해진 시간에 조회해 Discord 일정 브리핑 채널로 전송한다.

## 트리거

- n8n Schedule Trigger
- 매일 10:00 Asia/Seoul에 실행한다.
- 매월 1일 10:00에는 일일 브리핑과 함께 해당 월 전체 일정 브리핑도 전송한다.

## 입력

- `HERMES_SCHEDULE_BRIEFING_WEBHOOK_URL`: Hermes runtime의 일정 브리핑 webhook
- `SCHEDULE_BRIEFING_DISCORD_CHANNEL_ID`: 일정이 저장되고 브리핑이 전송될 Discord 채널 ID
- `N8N_WEBHOOK_SECRET`: Hermes webhook 인증 헤더

## 출력

- Hermes webhook 응답의 `discordMessages`를 Discord 지정 채널로 전송한다.
- `shouldSend=false`이면 Discord 전송을 건너뛴다.
- Discord 링크 embed preview는 `flags=4`로 억제한다.

## 환경변수

실행 시 n8n workflow에서 참조하는 값:

- `N8N_WEBHOOK_SECRET`
- `DISCORD_BOT_TOKEN`
- `HERMES_SCHEDULE_BRIEFING_WEBHOOK_URL`
- `SCHEDULE_BRIEFING_DISCORD_CHANNEL_ID`

Git 저장 JSON export를 n8n API로 반영할 때 사용하는 값:

- `N8N_API_URL`
- `N8N_API_KEY`

```bash
pnpm n8n:sync
```

## 장애 대응

- Hermes webhook이 `401`을 반환하면 `N8N_WEBHOOK_SECRET` 값을 확인한다.
- Hermes webhook이 `400`을 반환하면 workflow의 `mode`, `date`, `discordChannelId` payload를 확인한다.
- Discord 전송 `Authorization failed`는 `DISCORD_BOT_TOKEN` 값을 확인한다.
- Discord 전송 권한 실패는 `SCHEDULE_BRIEFING_DISCORD_CHANNEL_ID`와 봇의 채널 권한을 확인한다.
