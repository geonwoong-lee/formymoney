# Very Rich?

> **How to be rich, very rich?**  
> 청년미래적금의 실제 우대조건과 월별 납입 흐름을 계산하고, 같은 돈을 다른 선택에 사용했을 때의 차이를 비교하는 금융 의사결정 도구입니다.

## 프로젝트 소개

은행이 안내하는 최고금리는 모든 사용자가 받을 수 있는 금리가 아닙니다. 우대조건은 복잡하고, 매월 같은 금액을 납입하기 어려운 사람도 있습니다. 적금과 ETF 같은 대안을 비교하려 해도 서로 다른 기준의 숫자가 제시되어 판단하기 어렵습니다.

Very Rich?는 다음 질문에 답하는 것을 목표로 합니다.

- 내가 실제로 충족할 수 있는 우대조건은 무엇인가?
- 조건을 반영한 예상금리와 예상 만기액은 얼마인가?
- 월마다 납입액이 달라지면 결과가 어떻게 바뀌는가?
- 같은 날짜와 금액을 다른 예·적금, 나스닥100, SCHD, QLD 또는 채권에 적용하면 어떤 차이가 있는가?

특정 은행이나 자산을 추천하지 않습니다. 계산 근거, 충족하지 못한 조건, 확인이 필요한 내용과 투자 위험을 함께 보여주는 것이 핵심입니다.

## 현재 진행 상태

- 완료: **Phase 0 — 개발 기준 확정**
- 완료: **Phase 1 — React·FastAPI·SQLite3 기반 구축**
- 완료: **Phase 2 — SQLite3 공식 상품 데이터 구축**
- 완료: **Phase 3 — 적금 계산 API 완성**
- 다음 단계: **Phase 4 — 은행 비교 세로 흐름 완성**
- 현재 프론트엔드와 백엔드를 로컬에서 실행할 수 있으며, SQLite 공식 상품 데이터와 적금 계산 API까지 구현되어 있습니다.

Phase 0에서 확정한 내용은 다음과 같습니다.

- 프론트엔드와 백엔드를 분리한다.
- 핵심 금융 계산은 FastAPI 한 곳에서 수행한다.
- 로컬 개발과 자동 테스트에는 SQLite3를 사용한다.
- 운영 기준 데이터는 Supabase PostgreSQL에 저장한다.
- 사용자 답변과 납입액은 브라우저에만 임시 보관한다.
- 회원가입과 Supabase Auth는 MVP에서 만들지 않는다.

Phase 1에서 준비한 내용은 다음과 같습니다.

- React 화면 경로와 모바일 공통 레이아웃
- FastAPI `/api/v1` 구조와 공통 오류 응답
- SQLite 기준 데이터 테이블과 초기 연결 레코드
- React에서 FastAPI·SQLite 상태를 확인하는 연결 화면
- 브라우저 로컬 저장 모듈
- 프론트엔드와 백엔드 자동 테스트

## 핵심 기능 범위

1. 사용자 조건에 따른 은행별 예상 우대금리 비교
2. 예상 이자, 정부기여금과 만기 수령액 확인
3. 감액과 미납을 포함한 월별 납입액 입력
4. 동일한 월별 현금흐름을 사용한 적금과 대안상품 비교
5. 상품 출처, 계산 기준과 확인 필요 조건 표시
6. 브라우저 입력 복원과 전체 초기화

## 기술 구조

| 구분 | 기술 | 역할 |
|---|---|---|
| 프론트엔드 | React + TypeScript | 입력, 화면 이동, 결과 표시, 브라우저 임시 저장 |
| 백엔드 | FastAPI | 입력 검증, 공식 기준 데이터 조회, 금융 계산 |
| 개발·테스트 DB | SQLite3 | 로컬 개발과 자동 테스트 |
| 운영 DB | Supabase PostgreSQL | 은행·상품·우대조건·출처·투자 기준 데이터 |

사용자 입력은 FastAPI, SQLite3 또는 Supabase에 영구 저장하지 않습니다. 프론트엔드는 핵심 금융 계산식을 복제하지 않고 FastAPI의 계산 결과를 표시합니다.

## 문서 안내

- [MVP](docs/mvp.md): 첫 버전의 사용자, 문제, 기능 범위와 제외 범위
- [PRD](docs/PRD.md): 화면, 기능, 데이터와 완료 조건
- [기능 동작 설명서](docs/spec.md): 기능별 입력, 정상 결과, 오류와 검증 방법
- [개발 계획](docs/plan.md): Phase별 구현 순서, 의존 관계와 완료 기준

## 개발 로드맵

- [x] Phase 0 — 개발 기준 확정
- [x] Phase 1 — React·FastAPI·SQLite3 기반 구축
- [x] Phase 2 — SQLite3 공식 상품 데이터 구축
- [x] Phase 3 — 적금 계산 API 완성
- [ ] Phase 4 — 은행 비교 세로 흐름 완성
- [ ] Phase 5 — 월별 납입 기능 완성
- [ ] Phase 6 — 투자 데이터와 계산 완성
- [ ] Phase 7 — 적금·투자 비교 완성
- [ ] Phase 8 — Supabase 운영 연결
- [ ] Phase 9 — 출처·오류·통합 QA
- [ ] Phase 10 — 사용자 테스트와 공개 준비

각 Phase의 상세 작업과 완료 조건은 [개발 계획](docs/plan.md)에서 확인할 수 있습니다.

## 실행 방법

### 1. 백엔드 환경 준비

프로젝트 루트의 PowerShell에서 실행합니다.

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
```

### 2. FastAPI 실행

```powershell
cd backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

- API 문서: `http://localhost:8000/docs`
- 상태 확인: `http://localhost:8000/api/v1/health`

처음 실행하면 `backend/data/very_rich.sqlite3`가 자동으로 생성됩니다. 이 로컬 DB 파일은 Git에 저장되지 않습니다.

### 3. React 실행

새 PowerShell을 열고 실행합니다.

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

- 웹 화면: `http://localhost:5173`

### 4. 테스트와 빌드

백엔드:

```powershell
cd backend
..\.venv\Scripts\python.exe -m pytest
```

프론트엔드:

```powershell
cd frontend
npm.cmd run lint
npm.cmd run test
npm.cmd run build
```

환경값을 바꿔야 할 때는 [프론트 예시](frontend/.env.example)와 [백엔드 예시](backend/.env.example)를 참고해 각각의 폴더에 `.env`를 만듭니다. 예시 파일에는 실제 비밀값을 넣지 않습니다.

## 보안과 데이터 원칙

- `.env`처럼 비밀번호나 API 키가 들어갈 수 있는 파일은 Git에 저장하지 않습니다.
- 실제 SQLite 데이터베이스 파일과 설치·빌드 결과도 Git에서 제외합니다.
- 공유가 필요한 환경변수 이름은 값이 비어 있는 `.env.example`로만 관리합니다.
- Supabase 비밀값은 백엔드 실행 환경에만 두고 React 코드에 포함하지 않습니다.

## 주의사항

Very Rich?가 보여주는 금액은 입력값과 공개된 기준 자료를 사용한 예상 결과입니다. 실제 가입 조건과 수령액은 금융기관의 최종 확인이 필요합니다. 투자 비교 결과는 과거 데이터에 기반한 설명 자료이며 수익을 보장하거나 매수·매도를 추천하지 않습니다.
