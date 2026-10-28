# Supabase PostgreSQL 연결 준비

운영·로컬 실행 DB는 Supabase PostgreSQL의 Session pooler를 사용한다. 자동 테스트만 명시적으로 임시 SQLite를 사용한다. 기존 SQLite 파일과 데이터는 삭제하거나 이전하지 않는다.

## 1. 환경변수

`backend/.env.example`을 참고해 `backend/.env` 파일을 만든다.

```dotenv
VERY_RICH_DATABASE_URL=postgresql+psycopg://postgres.PROJECT_REF:URL_ENCODED_PASSWORD@POOLER_HOST:5432/postgres?sslmode=require&connect_timeout=10
VERY_RICH_SUPABASE_URL=https://PROJECT_REF.supabase.co
VERY_RICH_SUPABASE_ANON_KEY=PUBLIC_ANON_KEY
```

- DB 문자열은 Supabase Dashboard의 `Connect` → `Session pooler`에서 복사한다.
- Session pooler는 포트 `5432`를 사용한다.
- `postgresql://` 앞부분은 `postgresql+psycopg://`로 바꾼다.
- SSL을 강제하도록 마지막에 `sslmode=require`를 붙인다.
- 비밀번호에 예약 문자가 있으면 URL 인코딩한다.
- Auth 기능을 사용하려면 Project URL과 공개용 anon key도 필요하다.
- `.env`는 Git에서 제외되며 실제 값은 문서나 코드에 기록하지 않는다.

## 2. 테이블 생성

프로젝트 루트에서 가상환경과 패키지를 준비한 뒤 `backend` 폴더에서 실행한다.

```powershell
cd backend
..\.venv\Scripts\python.exe -m alembic upgrade head
```

Alembic은 `alembic_version`에 적용 이력을 기록하므로 같은 명령을 다시 실행해도 이미 적용된 마이그레이션을 반복하지 않는다. 첫 마이그레이션은 현재 SQLAlchemy 모델과 같은 공개 기준 데이터 테이블 네 개를 만든다. Supabase Auth 사용자는 Supabase의 `auth` 스키마에서 관리되므로 앱이 별도 비밀번호 테이블을 만들지 않는다.

## 3. 서버 실행과 확인

마이그레이션이 성공한 다음 `backend` 폴더에서 실행한다.

```powershell
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

1. `http://localhost:8000/api/v1/health`가 `200`인지 확인한다.
2. 프론트 서버를 실행하고 `http://localhost:5173/auth`에서 회원가입한다.
3. 이메일 확인 설정이 켜져 있으면 메일 확인 후 로그인한다.
4. `http://localhost:5173/me`에서 본인의 이메일과 표시 이름이 보이는지 확인한다.

## 오류 확인 순서

- `VERY_RICH_DATABASE_URL`이 비어 있지 않은지 확인한다.
- Dashboard에서 복사한 방식이 `Session pooler`인지 확인한다.
- 포트가 `5432`인지 확인한다.
- 사용자명이 일반 `postgres`가 아니라 pooler 문자열의 `postgres.PROJECT_REF` 형태인지 확인한다.
- 비밀번호 예약 문자가 URL 인코딩되었는지 확인한다.
- `sslmode=require`가 있는지 확인한다.
- 프로젝트가 일시 정지되지 않았는지, 비밀번호가 변경되지 않았는지 확인한다.
- Auth 오류라면 DB 문자열과 별개로 Supabase Project URL과 anon key를 확인한다.

설정이 없거나 잘못되면 서버와 Alembic은 오류를 내고 중단한다. SQLite로 자동 전환하지 않는다.
