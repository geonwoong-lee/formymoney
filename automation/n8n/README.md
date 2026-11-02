# Phase 13~14 로컬 n8n

이 구성은 매일 오전 7시(KST)에 전날의 공식 금융뉴스 후보를 FastAPI에 요청하고, 금융위원회 공식 원문의 근거 문단만 OpenAI Responses API로 요약한다. 금융위원회는 공식 RSS를 먼저 확인하고 실패할 때만 허용된 공식 목록을 Scrapling 일반 Fetcher로 읽는다. 한국은행은 발견·링크 전용이며 AI 요약 후보에 포함하지 않는다.

## 1. 환경값 준비

`automation/n8n/.env.example`을 같은 폴더의 `.env`로 복사하고 다음 값을 직접 넣는다.

- `N8N_ENCRYPTION_KEY`: n8n Credential 암호화용 임의 문자열
- `VERY_RICH_N8N_INGEST_SECRET`: `backend/.env`와 같은 내부 API 비밀값
- `VERY_RICH_API_BASE_URL`: 기본값을 사용하며 FastAPI 포트를 바꾼 경우만 수정
- `OPENAI_MODEL`: 기본값 `gpt-5.6-luna`. API 키가 아니라 공개 가능한 모델 이름

실제 값이 든 `.env`는 Git에 포함하지 않는다.

## 2. 실행과 워크플로 가져오기

FastAPI를 먼저 `0.0.0.0:8000`에서 실행한다. 그다음 프로젝트 루트에서 실행한다.

```powershell
docker compose --env-file automation/n8n/.env -f automation/n8n/compose.yml up -d
docker compose --env-file automation/n8n/.env -f automation/n8n/compose.yml run --rm n8n import:workflow --input=/workflows/daily-official-candidates.json
```

브라우저에서 `http://localhost:5678`을 열고 `Very Rich - 공식 금융뉴스 수집·AI 검증`을 확인한다. 처음에는 비활성 상태이므로 수동 실행 결과를 확인한 뒤 게시해야 오전 7시 예약이 작동한다.

## 3. OpenAI Credential 연결

1. n8n의 `Credentials`에서 `OpenAI API` Credential을 새로 만든다.
2. 사용자가 보관한 OpenAI API 키를 n8n 화면에 직접 입력한다.
3. 워크플로의 `OpenAI Structured Output`과 `OpenAI 한 번 재시도` 노드에서 같은 Credential을 선택한다.
4. API 키는 `.env`, workflow JSON, 코드와 Git에 넣지 않는다.

후보는 하루 최대 3개이고 항목별 첫 요청과 검증 실패 재시도 한 번까지만 실행하므로 하루 최대 6회 요청한다. 출력은 항목당 최대 900토큰이다. 기본 모델과 이 제한을 사용한 개발 운영 기준은 하루 미화 0.02달러 이하이며, 저장된 브리핑의 실제 토큰 수와 당시 공식 가격으로 다시 확인한다.

## 4. 결과 확인

- `status=ok`: 출처 확인이 끝났고 새 후보가 있음
- `status=partial`: 한 출처는 실패했지만 다른 출처 결과는 있음
- `status=no_candidates`: 해당 날짜에 새 후보가 없거나 기존 DB 자료와 중복됨
- `status=all_failed` 또는 `request_failed`: 새 브리핑을 만들지 않음

워크플로는 요약 가능한 금융위원회 후보만 최대 3개 남긴다. OpenAI가 거절하거나 응답이 중간에 끊기거나 JSON 형식이 틀리면 게시하지 않는다. FastAPI가 근거 ID, 숫자와 금지 표현을 다시 검사하고, 실패한 항목은 한 번만 다시 요청한다.

## 5. 중지

```powershell
docker compose --env-file automation/n8n/.env -f automation/n8n/compose.yml down
```

영구 볼륨은 기본적으로 유지한다. 삭제 명령은 이 문서에서 제공하지 않는다.

## 6. `access to env vars denied` 해결

이 워크플로는 FastAPI 주소, 내부 인증값과 모델 이름을 `$env`로 읽는다. 해당 오류가 나오면 다음을 확인한다.

1. 실제 실행 중인 컨테이너가 이 폴더의 `compose.yml`로 생성됐는지 확인한다.
2. n8n 컨테이너 환경에 `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`가 있는지 확인한다.
3. 설정을 바꾼 뒤 단순 재시작이 아니라 컨테이너를 재생성한다.
4. `VERY_RICH_API_BASE_URL`, `VERY_RICH_N8N_INGEST_SECRET`, `OPENAI_MODEL`이 n8n 컨테이너에 전달됐는지 값은 출력하지 않고 존재 여부만 확인한다.

공식 뉴스 요약 워크플로의 OpenAI API 키는 `$env`로 읽지 않고 n8n Credential에만 등록한다. 8절의 매일 수집 워크플로는 OpenAI 키를 쓰지 않으며, 해외 해석·경제 뉴스 요약은 FastAPI가 `backend/.env`의 `VERY_RICH_OPENAI_API_KEY`로 호출한다. 환경변수 접근을 허용하면 워크플로 편집자가 n8n 프로세스의 다른 환경값도 읽을 수 있으므로 이 인스턴스를 신뢰할 수 있는 로컬 개발 용도로만 사용한다.

## 7. 실행 기록과 상태 확인 (Phase 16)

워크플로 마지막(성공 경로)과 Error Trigger(실패 경로)에서 FastAPI에 실행 결과를 남긴다. 기록이 없거나 최근 실행이 실패면 정상 운영으로 보지 않는다.

- 기록: `POST /api/v1/internal/daily/runs` (헤더 `X-Very-Rich-Ingest-Secret`)
  - 본문: `runId`(n8n 실행 ID, 선택·재전송 중복 방지), `workflow`, `status`(`success`/`partial`/`failed`), `stage`(실패한 노드 이름), `errorMessage`, `candidates`, `published`, `rejected`, `inputTokens`, `outputTokens`, `startedAt`, `finishedAt`
  - `errorMessage`의 키·토큰·접속 문자열 모양은 저장 전에 `[가려짐]`으로 바뀌고 300자로 잘린다. 그래도 기사 전문과 비밀값은 넣지 않는다.
- 확인: `GET /api/v1/internal/daily/runs/status`(같은 헤더)
  - `latestStatus`, `lastSuccess`(마지막 정상 실행), `lastFailure`(실패 단계와 원인), 최근 10건
  - `todayTokens`(한국 시간 기준 오늘 입력+출력 토큰), `dailyTokenLimit`, `tokenLimitExceeded`
- 하루 토큰 상한은 `VERY_RICH_DAILY_TOKEN_LIMIT`(기본 200000)로 바꾼다. 초과하면 `tokenLimitExceeded`가 `true`가 되며, 알림 전송은 운영 위치를 정한 뒤 연결한다.
- DB에는 Alembic `20261030_0006`(`collection_runs`)을 먼저 적용한다.

## 8. 매일 시장 지표·뉴스 수집 워크플로

`workflows/daily-market-news-jobs.json`(`Very Rich - 매일 시장 지표·뉴스 수집`, id `veryRichDailyJob`)은 매일 오전 7시 30분(KST)에 다음을 순서대로 실행한다. 기존 공식 뉴스 워크플로(오전 7시)와 시간이 겹치지 않는다.

1. `시장 지표 수집`: `POST /api/v1/internal/daily/jobs/market` — 한국은행 ECOS 환율·증시·금리(`backend/.env`의 `VERY_RICH_ECOS_API_KEY` 필요)
2. `뉴스 수집·요약`: `POST /api/v1/internal/daily/jobs/news` — 네이버 헤드라인, 연준·ECB RSS, 해외 한국어 해석, 오늘의 경제 뉴스 요약
3. `실패한 작업이 있나`: 어느 작업이든 요청 자체가 실패했거나 `status=failed`이거나 실행 기록을 저장하지 못했으면(`runRecorded=false`) `실행 실패로 표시`(Stop and Error)로 n8n 실행을 오류로 끝낸다. 오류 실행은 n8n에 저장되어(`saveDataErrorExecution: all`) 원인 메시지를 볼 수 있다. `partial`은 정상 종료로 두고 원인은 실행 기록에서 확인한다.

- 두 API 모두 `X-Very-Rich-Ingest-Secret` 헤더가 필요하고, 본문의 `runId`(n8n 실행 ID)로 실행 기록을 남긴다. 같은 `runId`로 다시 호출하면 수집을 다시 하지 않고 기록된 결과를 돌려준다. 수집이 무거워 HTTP 노드 자동 재시도는 쓰지 않는다. OpenAI 키가 없어 요약을 만들지 못한 날은 `partial`로 기록된다. FastAPI가 작업 결과를 `collection_runs`에 직접 기록하므로(워크플로 `daily-market`, `daily-news`) 7절의 `GET /api/v1/internal/daily/runs/status`로 마지막 정상 실행과 실패 원인을 확인한다.
- 같은 작업을 PC에서 직접 돌릴 때는 `cd backend && python -m scripts.collect_market_data`, `python -m scripts.collect_news_headlines`. 종료 코드는 성공 0, 일부 실패 2, 전부 실패 1이다.
- 가져오기: 컨테이너에 `/workflows`가 연결돼 있으면 2절 명령에서 파일 이름만 바꾼다. 연결돼 있지 않으면 `docker cp automation/n8n/workflows/daily-market-news-jobs.json n8n:/tmp/` 뒤 `docker exec n8n n8n import:workflow --input=/tmp/daily-market-news-jobs.json`.
- 가져온 뒤에는 비활성 상태다. n8n 화면에서 `수동 실행`으로 결과를 확인하고 게시(활성화)해야 매일 예약이 작동한다. 예약은 n8n 컨테이너와 FastAPI가 켜져 있을 때만 돈다(로컬 PC를 끄면 실행되지 않음).
- CLI로 시험 실행할 때는 기존 n8n과 runner 포트가 겹치므로 `docker exec -e N8N_RUNNERS_BROKER_PORT=5690 n8n n8n execute --id veryRichDailyJob`처럼 다른 포트를 준다. 이 워크플로는 Code 노드가 없어 runner 없이도 끝까지 실행된다.
