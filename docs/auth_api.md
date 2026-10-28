# 인증 API

계산 기능은 로그인 없이 사용할 수 있다. 개인 기록 저장을 위한 인증은 Supabase Auth의 이메일·비밀번호 방식을 사용하며, 앱 자체 비밀번호 테이블은 만들지 않는다.

| 기능 | 메서드 | 경로 | 요청 | 성공 | 주요 실패 |
|---|---|---|---|---:|---:|
| 회원가입 | POST | `/api/v1/auth/signup` | `email`, `password`, `displayName` JSON | 201 | 409, 422, 502, 503 |
| 로그인 | POST | `/api/v1/auth/login` | `email`, `password` JSON | 200 | 401, 422, 502, 503 |
| 내 정보 | GET | `/api/v1/auth/me` | `Authorization: Bearer …` | 200 | 401, 502, 503 |

회원가입 시 이메일 확인 설정이 켜져 있으면 토큰 없이 `needsEmailConfirmation: true`가 반환된다. 비밀번호는 응답, 로그, SQLite3 또는 앱 문서에 저장하지 않는다.

프론트 요청은 `frontend/src/api/client.ts`, FastAPI 수신은 `backend/app/api/v1/endpoints/auth.py`에서 담당한다. 로컬에서 실제 Supabase와 연결하려면 `backend/.env`에 `VERY_RICH_SUPABASE_URL`과 `VERY_RICH_SUPABASE_ANON_KEY`를 설정해야 한다.
