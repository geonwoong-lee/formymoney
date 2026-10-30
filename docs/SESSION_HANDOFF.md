# Very Rich? 세션 인수인계 명세서

> 마지막 정리일: 2026-10-30 · 다른 세션에서 이 문서만 먼저 읽어도 현재 상태와 다음 작업을 파악할 수 있도록 작성했다.

## 1. 새 세션이 가장 먼저 할 일

1. 프로젝트 루트의 `AGENTS.md`를 읽고 작업 규칙을 지킨다.
2. 이 문서와 `docs/PRD.md`, `docs/spec.md`, `docs/plan.md`의 요청 관련 부분을 확인한다.
3. `git status --short`로 사용자의 미커밋 변경이 있는지 확인한다.
4. 한 번에 사용자가 요청한 작업 하나만 진행하고 관련 없는 파일을 바꾸지 않는다.
5. `.env`의 비밀번호, API 키, 전체 DB 연결 문자열을 읽어 답변·로그·Git에 출력하지 않는다.

문서의 역할은 다음과 같다.

- `docs/PRD.md`: 무엇을 왜 만드는지와 기능 범위
- `docs/spec.md`: 사용자의 행동과 기능별 정상·오류 결과
- `docs/plan.md`: Phase 순서와 완료 조건
- `docs/daily_briefing_policy.md`: 공식 뉴스 수집·AI 요약·보안 기준
- 이 문서: 현재 구현 상태, 실행 방법, 남은 작업과 주의점

## 2. 서비스 한 문장 설명

`Very Rich?`는 청년미래적금의 광고상 최고금리만 나열하지 않고, 사용자가 실제로 충족할 수 있는 우대조건·납입계획을 반영한 예상 결과를 은행별로 설명하고 동일한 현금흐름을 투자 대안과 비교하는 핀테크 서비스다.

브랜드 문구는 `How to be rich, very rich?`다. 사용자에게 특정 은행이나 자산을 추천하지 않고 선택 근거·출처·불확실성을 설명하는 것이 핵심이다.

## 3. 반드시 유지할 제품 원칙

- 특정 은행·ETF의 가입, 매수나 매도를 추천하지 않는다.
- 과거 투자 결과를 미래 수익 예측으로 표현하지 않는다.
- 최고금리와 사용자 조건 기준 예상금리를 구분한다.
- 적금과 투자에는 같은 월별 납입 현금흐름을 적용한다.
- 계산할 수 없는 조건은 임의로 추정하지 않고 `추가 확인 필요`로 표시한다.
- 설문은 문제 검증에만, 금융기관 공식 공시는 상품 계산에 사용한다.
- 비회원의 조건 답변과 납입액은 브라우저에만 저장한다.
- 핵심 금융 계산은 React가 아닌 FastAPI 한 곳에서 수행한다.
- 운영 DB 연결이 없거나 잘못되어도 SQLite로 자동 전환하지 않는다.

## 4. 기술 구조

| 영역 | 기술 | 현재 역할 |
|---|---|---|
| 프론트엔드 | React 19 + TypeScript + Vite | 입력, 로컬 저장, API 호출, 결과·오류 표시, Windows 98형 데스크톱 UI |
| 백엔드 | FastAPI + SQLAlchemy | 검증, 기준자료 조회, 적금·투자 계산, 내부 브리핑 API |
| 운영 DB | Supabase PostgreSQL | 상품·조건·시장자료·뉴스 요약·금융용어 |
| 테스트 DB | SQLite3 | 독립된 자동 테스트 전용 |
| 인증 | Supabase Auth | 이메일 회원가입·로그인·현재 사용자 조회 |
| 마이그레이션 | Alembic | 운영 테이블 생성·변경 |
| 자동화 | n8n Docker | 오전 7시 수집, OpenAI 호출, 재시도·분기. 저장소 Compose는 2.44.7, 현재 로컬 실행 인스턴스는 2.31.6 |
| AI | OpenAI Responses API | 공식 자료의 Structured Outputs 요약 초안 |

주요 폴더는 다음과 같다.

```text
frontend/          React 애플리케이션
backend/           FastAPI, SQLAlchemy, Alembic, 테스트
automation/n8n/    Docker Compose와 내보낸 워크플로
docs/              기획·동작·개발·수집 정책 문서
.github/workflows/ 기준자료 갱신 자동화
```

## 5. 현재 사용자 흐름

1. `/`에서 서비스 목적과 설문 근거를 확인한다.
2. `/conditions`에서 가입 상태, 가입 월, 월 납입액, 전환 여부, 주거래 은행과 공통·은행별 조건에 답한다.
3. `/banks`에서 14개 취급기관의 예상금리·예상 만기액·주거래 은행 대비 차액을 비교한다.
4. `/banks/:bankId`에서 적용·미적용 조건과 계산 근거·공식 출처를 확인한다.
5. `/cashflow`에서 36개월 납입액을 월별로 바꾸고 감액·미납을 계산한다.
6. `/alternatives`에서 같은 납입액을 QQQ·SCHD·QLD·BND·KODEX 코스닥150 과거 시나리오와 비교한다.
7. `/about`에서 설문, 상품·투자 출처, 계산법과 미반영 요소를 확인한다.
8. `/auth`, `/me`에서 Supabase Auth 회원가입·로그인·내 정보를 확인한다.

`/daily` 공개 API는 있으나 React 데일리 화면은 Phase 15에서 만든다.

## 6. 현재 화면 디자인

- 청록색 Windows 98풍 바탕화면, 파란 제목 표시줄, 시작 메뉴와 작업표시줄을 사용한다.
- 금융 기능 창과 놀이용 앱을 여러 개 열어 작업표시줄에서 최소화·복원할 수 있다.
- 창 이동·크기 조절·최대화·뒤로·앞으로, 날짜·시간과 바탕화면 드래그 선택 상자가 있다.
- 메모장·그림판·계산기·지뢰찾기는 바탕화면에 따로 두지 않고 모두 `내 폴더` 안에서 연다.
- 브라우저 파비콘과 시작 화면 대표 아이콘은 보라색 물음표 책이다.
- 금융 대시보드는 사용자가 제공한 Windows 98 아이콘 시트 기반의 책·도구 폴더·문서 그래프·달력·지구본·메모 아이콘을 사용한다.
- 레퍼런스 아이콘은 공개 배포 전에 사용 권한을 다시 확인해야 한다.

관련 파일:

- `frontend/src/components/AppLayout.tsx`
- `frontend/src/components/RetroUtilityApps.tsx`
- `frontend/src/App.css`
- `frontend/src/components/RetroUtilityApps.css`
- `frontend/src/assets/icons/`
- `frontend/public/favicon.png`

## 7. 구현된 API

모든 경로 앞에는 기본적으로 `/api/v1`이 붙는다.

| 메서드 | 경로 | 역할 |
|---|---|---|
| GET | `/health` | 서버·DB 연결 상태 |
| POST | `/auth/signup` | Supabase Auth 회원가입 |
| POST | `/auth/login` | 로그인 |
| GET | `/auth/me` | Bearer 토큰으로 현재 사용자 조회 |
| GET | `/savings/products` | 적금 상품·조건 목록 |
| POST | `/savings/calculate` | 은행별 예상금리·만기액 계산 |
| POST | `/savings/calculate-cashflow` | 36개월 변동 납입 계산 |
| GET | `/investments/assets` | 지원 투자자산·기준자료 |
| POST | `/investments/calculate` | 동일 현금흐름 투자 시나리오 |
| POST | `/comparisons/calculate` | 적금·투자 통합 비교 |
| GET | `/daily` | 검증·게시된 일별 브리핑 최대 3개와 용어 조회 |
| GET | `/internal/daily/candidates/collect` | n8n용 공식 뉴스 후보 수집 |
| POST | `/internal/daily/candidates/evidence` | 허용된 금융위 원문의 임시 근거 문단 준비 |
| POST | `/internal/daily/briefings/openai-result` | OpenAI 응답 검증·저장 |
| POST | `/internal/daily/briefings` | 검증용 구조화 브리핑 직접 저장 |

내부 브리핑 API는 `X-Very-Rich-Ingest-Secret` 헤더가 필요하다. 실제 값은 출력하지 않는다.

## 8. 데이터와 계산 현황

- 청년미래적금 취급기관 14곳의 기본·최고금리와 우대조건이 Supabase에 들어 있다.
- Alembic 최신 리비전은 `20261029_0003_daily_briefing.py`다.
- 투자자산은 QQQ, SCHD, QLD, BND, KODEX 코스닥150이다.
- 투자자료는 마지막으로 완료된 월부터 최근 36개월의 월말 조정주가와 환율을 사용한다.
- 미국 ETF는 환율과 배당 재투자를 반영하지만 개인별 세금·증권사 수수료는 반영하지 않는다.
- KODEX 코스닥150은 원화 가격이라 환율을 적용하지 않는다.
- `.github/workflows/reference-data.yml`이 투자자료 월간 갱신과 적금 공시 변경 확인을 실행할 수 있다.
- 적금 공시 변경은 자동 덮어쓰지 않고 사람이 원문을 대조한 뒤 기준선을 갱신한다.

## 9. Phase 진행 상태

### v1

- Phase 0~8: 완료
- Phase 9: 완료(2026-10-30)
  - 완료: `/about` 출처·계산 기준, 투자자료 자동 갱신, 적금 공시 변경 감지, 공통 오류 응답·다시 시도, 360px 모바일, 계산 회귀 테스트, 회원가입·로그인 확인
  - 주의: 개발 중 Supabase `Confirm email`을 꺼 두었다. 공개 전에 다시 켠다.
- Phase 10: 미착수
  - 가입 예정자·유보자 5명 사용자 테스트와 공개 준비

### v2 오늘의 머니 브리핑

- Phase 11: 공식 출처·저장·보안 기준 확정 완료
- Phase 12: 브리핑 DB·내부 저장 API·공개 조회 API 완료
- Phase 13: n8n 공식 피드 수집·중복·부분 실패 처리 완료
- Phase 14: 완료(2026-10-30) — `gpt-5.6-luna`로 공식 자료 13건 평가, 형식·근거 오류 0건, 숫자 검증은 첫 시도 69% 통과·재시도 후 100%
  - 완료: 금융위 상세 근거 추출, Responses API JSON Schema 요청, FastAPI 숫자·근거·금지 표현 검증, 실패 1회 재시도, 로컬 n8n 환경 연결, 후보 수집 API 실호출
  - 확인됨: n8n과 FastAPI 상태 200, n8n 컨테이너에서 후보 수집 API HTTP 200·`ok`
  - 남음: 실제 금액은 OpenAI 사용량 화면에서 확인(가격표 미확인)
- Phase 15: 미착수 — React `/daily` 화면과 검수된 금융용어
- Phase 16: 미착수 — 예약 실행부터 화면까지 통합 QA와 운영 위치 결정

Phase 15는 Phase 14 완료 후 진행한다.

## 10. Phase 14의 정확한 다음 작업

현재 로컬 n8n에는 `Very Rich - 공식 금융뉴스 수집·AI 검증` 워크플로가 있으며 ID는 `KtHPTUxW71kO71Jr`다. 후보 수집까지만 실호출을 확인했고, 2026-10-29 기준 공개 API의 최종 항목은 0개였다. 따라서 Phase 14를 완료 처리하면 안 된다.

1. `http://localhost:5678/workflow/KtHPTUxW71kO71Jr`에서 워크플로를 연다.
2. OpenAI Credential이 `OpenAI Structured Output`, `OpenAI 한 번 재시도` 두 노드에 선택되어 있는지 값 노출 없이 확인한다.
3. `Execute workflow`로 전체 흐름을 수동 실행한다.
4. `FastAPI 공식 후보 수집` → `원문 근거 준비` → `OpenAI Structured Output` → `FastAPI 검증·저장` 순서로 각 OUTPUT을 확인한다.
5. 최종 저장 노드가 `accepted`인지 확인하고 `http://localhost:8000/api/v1/daily`의 `items`가 생겼는지 확인한다.
6. Supabase Table Editor의 `daily_briefing_items`와 `daily_briefing_sources`에서도 저장 여부를 확인한다.
7. 금융위원회 공식 자료 10건에서 JSON 형식, 근거 ID, 원문에 없는 숫자, 금지 표현과 토큰 사용량을 기록한다.
8. 기본 `gpt-5.6-luna`의 통과율이 부족하면 모델을 비교한다. 비용보다 사실 검증 통과율을 우선한다.
9. 검증이 끝나야 `docs/plan.md`에서 Phase 14를 완료 처리하고 해당 변경만 커밋·푸시한다.

2026-10-30 진행: 전체 워크플로 실행에 성공해 3건이 게시됐다(Code 노드를 항목별 실행 모드로 수정, `/daily` 조회를 KST 날짜 기준으로 수정). 위 1~6번은 확인됐고 7~9번(10건 평가·모델 확정)이 남았다. 이미 떠 있는 FastAPI는 재시작해야 날짜 수정이 반영된다.

개발 제한은 후보 최대 3건, 항목별 최대 2회 호출, 출력 최대 900토큰, 개발 운영 기준 하루 미화 0.02달러 이하다.

## 11. 공식 뉴스·AI 보안 경계

- 일반 언론사와 커뮤니티를 크롤링하지 않는다.
- 금융위원회 공식 RSS를 우선하고 실패할 때만 허용된 공개 목록·상세 페이지를 일반 Scrapling Fetcher로 읽는다.
- StealthyFetcher, 프록시, CAPTCHA·Cloudflare 우회, 로그인 세션을 사용하지 않는다.
- 한국은행 RSS는 현재 발견·링크 전용이며 승인 전에는 본문을 AI 요약하지 않는다.
- 원문 HTML, 본문 전문과 첨부파일은 DB에 저장하지 않는다.
- OpenAI에는 공식 제목·발표일·번호가 붙은 근거 문단만 보낸다.
- 사용자 조건, 납입액, 이메일, 회원 ID, 인증 토큰, 계좌·거래정보는 OpenAI 요청에 넣지 않는다.
- OpenAI 응답은 Structured Outputs 형식이 맞아도 FastAPI 검증을 다시 통과해야 공개된다.

## 12. 로컬 실행

### 백엔드

프로젝트 루트에서 가상환경을 사용한다. 실제 운영 실행에는 `backend/.env`가 필요하다.

```powershell
cd backend
..\.venv\Scripts\python.exe -m alembic upgrade head
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

DB 설정이 없거나 잘못되면 서버는 시작에 실패하며 SQLite로 자동 전환하지 않는다.

### 프론트엔드

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

기본 API 주소는 `frontend/.env`의 `VITE_API_BASE_URL`이며 예시는 `http://localhost:8000`이다.

### n8n

설정과 가져오기 방법은 `automation/n8n/README.md`를 따른다. 로컬 PC가 꺼지면 예약도 멈추므로 로컬 Docker는 운영 환경으로 간주하지 않는다.

현재 PC에서 실제 실행 중인 n8n은 저장소의 `automation/n8n/compose.yml`이 아니라 `C:\n8n\compose.yaml`로 만든 별도 인스턴스다. 데이터 볼륨은 `n8n_n8n_2nd_data`이며 삭제하지 않는다. 현재 확인된 설정은 다음과 같다.

- n8n: `http://localhost:5678`
- FastAPI: `http://localhost:8000`
- `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`
- `VERY_RICH_API_BASE_URL`, `VERY_RICH_N8N_INGEST_SECRET`, `OPENAI_MODEL`이 현재 n8n 컨테이너에 전달됨
- n8n과 FastAPI 상태 200, 후보 수집 API HTTP 200·`ok`

현재 내부 인증값은 컨테이너 재생성 시 `backend/.env`를 Compose 입력으로 전달했다. 값을 출력하지 말고 다음과 같이 재생성한다.

```powershell
docker compose --env-file C:\Users\aicam\Desktop\formymoney\backend\.env -f C:\n8n\compose.yaml up -d --force-recreate n8n
```

`access to env vars denied`가 다시 나오면 실행 중인 컨테이너가 어느 Compose 파일에서 만들어졌는지와 `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` 반영 여부를 확인한다. `Invalid URL: /api/...`가 나오면 `VERY_RICH_API_BASE_URL`이 빠진 것이다. OpenAI API 키는 환경변수가 아니라 n8n Credential에만 둔다.

## 13. 검증 명령

```powershell
cd backend
..\.venv\Scripts\python.exe -m pytest

cd ..\frontend
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

기준자료만 확인할 때:

```powershell
cd backend
..\.venv\Scripts\python.exe scripts\sync_market_data.py --dry-run
..\.venv\Scripts\python.exe scripts\check_savings_sources.py
```

마지막 전체 확인 결과는 백엔드 68개, 프론트엔드 27개 테스트와 프론트 린트·빌드 통과다. 다음 세션은 변경 후 다시 실행하고 확인한 것과 확인하지 못한 것을 구분해 보고한다.

## 14. 환경값 위치

| 파일 | 필요한 값 |
|---|---|
| `backend/.env` | PostgreSQL Session pooler URL, Supabase URL·anon key, CORS origin, n8n 내부 비밀값 |
| `frontend/.env` | `VITE_API_BASE_URL` |
| `automation/n8n/.env` | n8n 암호화 키, FastAPI 주소, n8n 내부 비밀값, 공개 가능한 모델명 |
| 현재 로컬 `C:\n8n\compose.yaml` | 실행 중인 별도 n8n 인스턴스 설정. 내부 인증값은 출력하지 않고 Compose 실행 시 전달 |
| n8n Credential | OpenAI API 키 |

예시는 각 폴더의 `.env.example`을 사용한다. `.env`, 토큰과 전체 연결 문자열은 Git에 올리지 않는다.

## 15. 아직 확인하지 못했거나 결정하지 않은 것

- Phase 14 실제 OpenAI 10건 품질·비용 평가
- n8n 전체 워크플로 실행 후 `daily_briefing_items` 저장 성공 여부. 마지막 확인 때 `/api/v1/daily` 항목은 0개였음
- n8n 운영 위치: n8n Cloud 또는 항상 켜진 별도 서버
- Phase 15 금융용어 자료의 가공 허용 여부와 검수된 30개 용어
- 당일 생성 실패 시 이전 날짜 브리핑을 화면에 보여줄지 여부
- 360px 모바일 전체 흐름
- 5명 사용자 테스트
- 외부 공개 전 Windows 98 레퍼런스 아이콘 사용 권한
- 다른 예·적금 실제 비교상품, 개인별 세금·증권사 수수료 설정

## 16. 다음 세션에서 하지 말아야 할 것

- 사용자의 승인 없이 새로운 금융 추천·예측 기능을 추가하지 않는다.
- 미정인 한국은행 본문·용어를 임의로 복제하거나 AI 요약하지 않는다.
- 테스트 편의를 위해 운영 DB 실패 시 SQLite로 자동 연결하지 않는다.
- 기존 계산식을 프론트엔드에 복사하지 않는다.
- 비회원 답변이나 계산 결과를 동의 없이 서버에 저장하지 않는다.
- API 키·비밀번호·토큰·전체 DB URL을 출력하거나 커밋하지 않는다.
- 기존 사용자의 미커밋 변경을 초기화하거나 덮어쓰지 않는다.

## 17. 작업 완료 시 기록 방법

1. 관련 자동 테스트와 빌드를 실행한다.
2. 확인한 결과와 외부 조건 때문에 확인하지 못한 결과를 나눈다.
3. `README.md`, `docs/plan.md`와 필요하면 이 문서를 갱신한다.
4. Phase가 실제 완료됐을 때만 해당 Phase 변경을 커밋·푸시한다.
5. 사용자가 별도 작업의 커밋·푸시를 요청하면 관련 변경만 저장한다.
