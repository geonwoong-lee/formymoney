# Phase 13 로컬 n8n

이 구성은 매일 오전 7시(KST)에 전날의 공식 금융뉴스 후보를 FastAPI에 요청한다. 금융위원회는 공식 RSS를 먼저 확인하고 실패할 때만 허용된 공식 목록을 Scrapling 일반 Fetcher로 읽는다. 한국은행은 발견·링크 전용이며 AI 요약 후보에 포함하지 않는다.

## 1. 환경값 준비

`automation/n8n/.env.example`을 같은 폴더의 `.env`로 복사하고 다음 값을 직접 넣는다.

- `N8N_ENCRYPTION_KEY`: n8n Credential 암호화용 임의 문자열
- `VERY_RICH_N8N_INGEST_SECRET`: `backend/.env`와 같은 내부 API 비밀값
- `VERY_RICH_API_BASE_URL`: 기본값을 사용하며 FastAPI 포트를 바꾼 경우만 수정

실제 값이 든 `.env`는 Git에 포함하지 않는다.

## 2. 실행과 워크플로 가져오기

FastAPI를 먼저 `0.0.0.0:8000`에서 실행한다. 그다음 프로젝트 루트에서 실행한다.

```powershell
docker compose --env-file automation/n8n/.env -f automation/n8n/compose.yml up -d
docker compose --env-file automation/n8n/.env -f automation/n8n/compose.yml run --rm n8n import:workflow --input=/workflows/daily-official-candidates.json
```

브라우저에서 `http://localhost:5678`을 열고 `Very Rich - 공식 금융뉴스 후보 수집`을 확인한다. 처음에는 비활성 상태이므로 수동 실행 결과를 확인한 뒤 게시해야 오전 7시 예약이 작동한다.

## 3. 결과 확인

- `status=ok`: 출처 확인이 끝났고 새 후보가 있음
- `status=partial`: 한 출처는 실패했지만 다른 출처 결과는 있음
- `status=no_candidates`: 해당 날짜에 새 후보가 없거나 기존 DB 자료와 중복됨
- `status=all_failed` 또는 `request_failed`: 새 브리핑을 만들지 않음

워크플로는 요약 가능한 금융위원회 후보만 최대 3개 남긴다. OpenAI 호출과 최종 저장은 Phase 14에서 연결한다.

## 4. 중지

```powershell
docker compose --env-file automation/n8n/.env -f automation/n8n/compose.yml down
```

영구 볼륨은 기본적으로 유지한다. 삭제 명령은 이 문서에서 제공하지 않는다.
