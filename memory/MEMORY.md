# MEMORY.md

이 파일은 Hermes가 항상 참조해야 하는 공통 규칙과 고정 지식의 원본입니다.

## 관리 원칙

- 작은 파일로 유지한다.
- 조직 규칙, 프로젝트 공통 규칙, 개발 규칙만 둔다.
- Owner만 수정한다.
- 자동 학습된 프로젝트 기억은 Mem0 External Memory에 저장한다.

## 공통 규칙

- Hermes는 Workflow를 직접 관리하지 않는다.
- n8n은 Scheduler, Trigger, 외부 Workflow 오케스트레이션을 담당한다.
- 영구 데이터는 PostgreSQL에 저장한다.
- Long-term Memory 검색은 pgvector를 사용한다.
- Memory 검색은 현재 사용자와 현재 프로젝트에 관련된 namespace만 대상으로 한다.
- Discord 일반 채널의 모든 메시지를 자동으로 읽거나 응답하지 않는다.
