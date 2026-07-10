# Architecture

## 컴포넌트 책임

Hermes는 추론과 의사결정을 담당한다. 사용자 대화, 장기 기억 검색, 프로젝트 분석, 문서 작성, GitHub 작업 보조 같은 AI 판단은 Hermes application layer에서 orchestration한다.

n8n은 Workflow를 담당한다. Scheduler, Cron, Discord Trigger, GitHub Webhook, 외부 서비스 연동은 n8n JSON export와 Markdown 운영 문서로 관리한다.

PostgreSQL은 영구 데이터를 저장한다. Chat History, Long-term Memory, Application Metadata의 원본 저장소이다.

pgvector는 Long-term Memory 검색을 담당한다. 초기 스키마는 OpenAI `text-embedding-3-small` 기본 차원인 1536을 기준으로 둔다.

Discord는 기본 사용자 인터페이스이다. 초기 버전은 전용 채널 mention 기반 대화를 우선하고, slash command는 상태/설정 조회처럼 고정 형식 기능에 사용한다.

MCP 연동은 adapter 뒤에 둔다. GitHub MCP와 Filesystem MCP는 Hermes가 직접 외부 구현에 결합하지 않도록 policy와 port를 먼저 통과한다.

## 계층

- Domain: Role, Permission, Memory, Soul, Workflow, MCP 계약
- Application: HermesChatService, MemoryContextService, TaskPlanner, SoulPipeline
- Project file analysis: ProjectFileAnalysisService가 Filesystem MCP gateway를 통해 허용된 파일만 읽고 Soul Pipeline에 전달한다.
- GitHub assistance: GitHubAssistantService가 GitHub MCP gateway를 통해 repository context를 가져오고 Soul Pipeline에 전달한다.
- Infrastructure: PostgreSQL/pgvector SQL, OpenAI embedding provider, Mem0 adapter boundary
- Interfaces: Discord router, slash command handler, n8n webhook handler

## Soul Pipeline

Task Planner는 사용자의 요청을 분석해 필요한 최소 Soul을 선택한다. Default Soul은 전문 Soul이 필요하지 않을 때만 단독 실행된다. 여러 Soul이 필요한 요청은 순차 실행되며 이전 Soul의 결과가 다음 Soul에게 전달된다.

## 확장 지점

- 새 MCP: `src/domain/mcp.ts` policy와 interface adapter 추가
- 새 Workflow: `workflows/<workflow-id>/<workflow-id>.n8n.json`과 `README.md` 추가
- 새 Memory Backend: `MemoryRepository` 구현체 추가
- 새 Interface: `src/interfaces/<interface-name>` 추가
- 새 Soul: `src/domain/soul.ts` profile과 Task Planner 선택 규칙 추가
