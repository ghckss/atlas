# Memory

## 계층

USER.md와 MEMORY.md는 항상 참조되는 작은 파일 기반 원본이다. 실행 시 DB에 캐시할 수 있지만 데이터베이스가 원본이 되지 않는다.

External Memory는 Mem0를 사용한다. 사용자 선호, 작업 패턴, 프로젝트별 기억처럼 자동으로 축적되는 장기 기억은 Mem0와 PostgreSQL/pgvector 검색 계층에 저장한다.

Runtime에서 `MEM0_API_KEY`가 설정되면 Mem0 Platform REST adapter가 활성화된다. 기본 endpoint는 `https://api.mem0.ai`이며, `MEM0_BASE_URL`로 self-hosted Mem0 REST endpoint를 지정할 수 있다.

Session History는 모든 대화를 저장한다. Hermes는 최근 세션 기록과 검색된 External Memory를 함께 Soul context에 넣을 수 있다.

## Namespace

- `personal`: 특정 사용자 개인 기억
- `team`: 팀 단위 기억
- `project`: 현재 프로젝트 기억
- `organization`: 조직 단위 기억

검색 scope는 `userId`, `teamId`, `organizationId`, `projectId`와 namespace를 함께 사용한다. 프로젝트 ID가 없으면 project namespace를 검색하지 않는다.

Mem0 adapter는 namespace와 project/team/organization 정보를 metadata로 저장하고, 검색 시 현재 scope에 맞는 metadata filter를 함께 전달한다. 서로 다른 프로젝트 기억이 섞이지 않도록 `projectId`가 있는 요청에서만 project namespace를 검색한다.

## Lifetime

- `permanent`: 장기 유지
- `project`: 프로젝트 종료 시 제거 가능
- `temporary`: 일시 작업 기억

## 임베딩 모델 변경

저장된 벡터는 모델과 차원에 강하게 결합된다. 운영 중 `EMBEDDING_MODEL` 또는 `EMBEDDING_DIMENSIONS`를 임의로 변경하지 않는다.

변경 절차:

1. 새 모델과 차원을 설정 파일에 추가한다.
2. 새 pgvector 컬럼 또는 새 memory table migration을 준비한다.
3. 기존 memory를 새 모델로 재임베딩한다.
4. 검색 쿼리를 새 모델/차원으로 전환한다.
5. 검증 후 이전 벡터를 보관하거나 제거한다.
