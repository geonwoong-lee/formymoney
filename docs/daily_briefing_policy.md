# 오늘의 머니 브리핑 수집·요약 기준

> Phase 11 결정 문서 · 확인일: 2026-10-29

이 문서는 `/daily`에 보여줄 경제·금융 소식을 어디서 가져오고, 무엇을 저장하며, AI 결과를 어떻게 검증할지 정한다. 법률 자문이 아니라 서비스 구현 기준이다. 출처의 정책이 바뀌면 다시 확인한다.

## 1. 이번 Phase에서 확정한 범위

- 일반 언론사 기사와 커뮤니티 게시물은 수집하지 않는다.
- 로그인, 유료 구독 또는 접근 제한을 우회하지 않는다.
- 공식 기관이 공개한 RSS와 공개 페이지만 후보로 삼는다.
- 원문 HTML, 본문 전문, 첨부파일과 화면 캡처는 DB에 저장하지 않는다.
- 원문은 요약을 만드는 동안에만 메모리에서 사용하고 작업이 끝나면 버린다.
- DB에는 출처·제목·발표 시각·원문 링크·검증된 자체 요약과 처리 기록만 저장한다.
- 사용자 답변, 납입액, 계좌·거래 정보와 회원정보는 수집·요약·OpenAI 요청에 넣지 않는다.
- 하루 공개량은 최대 3건이다. 새 브리핑 생성에 실패하면 검증되지 않은 내용을 게시하지 않는다.

## 2. 공식 출처 허용 목록

| 코드 | 출처 | 접근 확인 | Phase 13 처리 | 공개·저장 범위 |
|---|---|---|---|---|
| `fsc_press` | 금융위원회 보도자료 | 공식 RSS 안내 페이지와 목록 페이지는 확인됨. 안내된 RSS 주소는 확인일에 HTTP 503 | **1차 출처.** RSS를 먼저 시도하고 실패하면 공개 목록·상세 페이지만 Scrapling으로 읽음 | 금융위원회가 권리를 모두 가진 보도자료만 제목·발표일·링크·자체 요약 저장. 제3자 권리 표시가 있는 자료와 첨부파일은 제외 |
| `bok_press` | 한국은행 보도자료 전체 RSS | RSS HTTP 200, XML 100건 확인. `robots.txt`는 `/portal/` 접근을 허용 | **발견 전용.** 제목·발표일·원문 링크 후보만 확인하고 AI 요약과 본문 가공은 보류 | 링크 외 본문 가공은 승인 또는 공공데이터 제공대상 여부 확인 전 공개하지 않음 |
| `bok_terms` | 한국은행 경제금융용어 자료 | 공식 페이지 존재 확인 | **후보 전용.** 용어 설명을 복제·가공하지 않음 | 승인 또는 공공데이터 제공대상 여부 확인 전 30개 용어 데이터 구축을 시작하지 않음 |

### 확정 URL

- 금융위원회 RSS 안내: <https://www.fsc.go.kr/ut060101>
- 금융위원회 보도자료 RSS: <https://www.fsc.go.kr/about/fsc_bbs_rss/?fid=0111>
- 금융위원회 보도자료 목록: <https://www.fsc.go.kr/no010101>
- 금융위원회 저작권정책: <https://www.fsc.go.kr/ut020104>
- 한국은행 RSS 안내: <https://www.bok.or.kr/static/view/popup/rss_popup.html>
- 한국은행 보도자료 전체 RSS: <https://www.bok.or.kr/portal/bbs/B0000552/news.rss?menuNo=200690>
- 한국은행 저작권보호방침: <https://www.bok.or.kr/portal/main/contents.do?menuNo=200228>

### 이용조건 해석

- 금융위원회는 위원회가 저작재산권 전부를 보유한 자료를 자유이용할 수 있다고 안내한다. 다만 수익 또는 그에 상응하는 혜택을 얻는 이용은 사전 협의가 필요하고, 출처를 표시해야 한다. 제3자 권리가 섞인 자료는 자동 처리하지 않는다.
- 한국은행은 제공대상 공공데이터가 아닌 정보를 링크 외 방식으로 이용하려면 사전 협의·승인을 받도록 안내한다. 따라서 현재는 RSS의 발견 정보와 원문 링크만 사용하며 AI 요약 공개 대상에서는 제외한다.
- 서비스가 수익화되거나 회사 업무에 실제 도입될 때에는 금융위원회와 한국은행의 최신 정책을 다시 확인한다.

## 3. Scrapling 사용 원칙

Scrapling은 BSD 3-Clause 라이선스의 Python 수집 도구이며 RSS/XML과 일반 HTML을 읽을 수 있다. 이 프로젝트에서는 **허용된 공식 페이지의 고정된 항목을 읽는 보조 파서**로만 사용한다.

### 사용하는 기능

- 일반 HTTP `Fetcher`
- RSS/XML 파싱 또는 `XMLFeedSpider`
- CSS/XPath로 제목, 발표일, 본문 영역, 원문 URL 추출
- `robots_txt_obey=True`
- 도메인별 동시 요청 1개, 요청 간격 최소 2초, 짧은 재시도와 타임아웃

### 사용하지 않는 기능

- `StealthyFetcher`, 브라우저 위장과 지문 변조
- Cloudflare·CAPTCHA·접근 제한 우회
- 프록시 회전
- 로그인 세션, 유료 콘텐츠와 비공개 API 접근
- `robots.txt`에서 막은 경로 수집
- 사이트 전체 크롤링과 링크 무제한 추적

RSS가 정상이라면 Scrapling으로 상세 페이지를 다시 수집하지 않는다. 금융위원회처럼 공식 RSS가 일시적으로 실패할 때에만 허용 목록의 공식 페이지를 대체 경로로 사용한다. 차단 또는 403·429가 반복되면 우회하지 않고 해당 출처 처리를 중단한다.

## 4. 수집·저장 흐름

```text
n8n 오전 예약 실행
  → FastAPI 내부 수집 API 호출
  → RSS 우선, 허용된 경우에만 Scrapling 대체 수집
  → 출처·날짜·중복·이용범위 검사
  → 문단마다 evidence ID를 붙인 임시 텍스트 생성
  → n8n의 OpenAI Credential로 요약 요청
  → FastAPI가 JSON·근거·숫자·금지 표현 재검사
  → 통과한 결과만 Supabase에 게시 가능 상태로 저장
  → React `/daily`가 공개 API로 조회
```

Scrapling은 n8n 이미지 안에 설치하지 않는다. Phase 12에서 FastAPI 내부 수집 API의 계약을 만들고, Phase 13에서 백엔드의 별도 수집 의존성으로 설치한다. n8n은 일정, 호출 순서, 재시도와 실행 상태를 담당한다.

### Phase 12 저장 항목

- 출처 코드와 공식 기관명
- 공식 게시물 식별자 또는 정규화한 원문 URL
- 원문 제목과 발표 시각
- 원문 링크와 수집 시각
- 정규화한 임시 원문의 SHA-256 해시
- 이용조건 확인 URL과 확인일
- 검증된 쉬운 제목, 요약, 중요한 이유, 관련 용어, 주의문구
- 각 문장의 `evidence_ids`
- `draft`, `validated`, `published`, `rejected` 상태와 실패 이유
- 모델명, 프롬프트 버전, 스키마 버전, 토큰 사용량

`raw_html`, `raw_body`, 첨부파일 원문은 저장 항목에 만들지 않는다.

## 5. OpenAI 요청 범위

### 입력

- 허용된 공식 자료의 제목, 발표일, 출처명
- `p1`, `p2`처럼 번호를 붙인 정리된 문단
- 아래 출력 형식과 금지 표현

다음 값은 보내지 않는다.

- 사용자 조건 답변과 월별 납입액
- 이메일, 회원 ID, 인증 토큰과 IP 주소
- 은행·계좌·카드·거래내역
- API 키, 내부 비밀값과 DB 연결 정보

### 응답 JSON Schema 1.0

Responses API의 Structured Outputs `text.format`과 `strict: true`를 사용한다. 모든 객체는 `additionalProperties: false`, 모든 필드는 `required`로 둔다.

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "schema_version": { "type": "string", "enum": ["1.0"] },
    "source_item_id": { "type": "string" },
    "plain_headline": { "type": "string" },
    "summary_points": {
      "type": "array",
      "minItems": 1,
      "maxItems": 3,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "text": { "type": "string" },
          "evidence_ids": {
            "type": "array",
            "minItems": 1,
            "items": { "type": "string", "pattern": "^p[1-9][0-9]*$" }
          }
        },
        "required": ["text", "evidence_ids"]
      }
    },
    "why_it_matters": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "text": { "type": "string" },
        "evidence_ids": {
          "type": "array",
          "minItems": 1,
          "items": { "type": "string", "pattern": "^p[1-9][0-9]*$" }
        }
      },
      "required": ["text", "evidence_ids"]
    },
    "related_terms": {
      "type": "array",
      "maxItems": 3,
      "items": { "type": "string" }
    },
    "caution": {
      "type": "string",
      "enum": ["공식 발표를 쉽게 풀어쓴 요약이며 투자·가입 권유가 아닙니다. 원문을 함께 확인하세요."]
    }
  },
  "required": [
    "schema_version",
    "source_item_id",
    "plain_headline",
    "summary_points",
    "why_it_matters",
    "related_terms",
    "caution"
  ]
}
```

추가 조건은 다음과 같다.

- `summary_points`는 1~3개, `related_terms`는 0~3개다.
- 모든 `evidence_ids`는 입력에 실제 존재해야 한다.
- 원문에 없는 평가, 원인, 전망과 숫자를 만들지 않는다.
- 모델이 거절하거나 응답이 중간에 끊기면 실패로 처리한다.
- JSON 형식이 맞아도 내용 검증을 별도로 통과해야 한다.

## 6. 게시 전 검증 규칙

1. **출처**: 허용 목록의 도메인과 경로인지 확인한다. 리디렉션 뒤 최종 호스트도 다시 검사한다.
2. **날짜**: 미래 날짜, 읽을 수 없는 날짜와 원문 발표일 불일치는 거절한다.
3. **근거**: 모든 요약 문장에 하나 이상의 유효한 `evidence_id`가 있어야 한다.
4. **숫자**: 요약의 숫자·통화·퍼센트·기간은 연결된 근거 문단에 같은 값과 단위가 있어야 한다.
5. **제목**: 기관명과 상품명 같은 고유명사를 임의로 바꾸지 않는다.
6. **금지 표현**: `추천`, `사야 한다`, `팔아야 한다`, `무조건`, `확실`, `수익 보장`, `손실 없음`, 미래 가격의 상승·하락 단정이 있으면 거절한다.
7. **중복**: 공식 게시물 식별자, 정규화 URL과 내용 해시 중 하나가 같으면 새 글을 만들지 않는다.
8. **주의문구**: 스키마의 고정 문장과 다르면 거절한다.
9. **공개 상태**: 모든 검사를 통과한 `validated` 결과만 `published`로 바꿀 수 있다.

검증 실패 시 한 번만 다시 요청한다. 재시도도 실패하면 `rejected`로 기록하고 공개하지 않는다. 이전 정상 브리핑이 있으면 날짜와 마지막 갱신 시각을 표시한 채 유지한다.

## 7. n8n 환경과 비밀값

### 로컬 개발

- Phase 13에서 Docker Compose로 n8n과 영구 볼륨을 구성한다.
- 예약 실행 외에 수동 실행을 제공한다.
- 성공 실행에는 원문 전체와 OpenAI 입력을 장기 보관하지 않는다.
- workflow JSON에는 Credential 값이 포함되지 않아야 한다.

### 운영

운영 n8n 위치는 **미정**이다. n8n Cloud 또는 별도 상시 실행 서버 중에서 Phase 16 전에 결정한다. 로컬 PC가 꺼져 있으면 예약 실행도 멈추므로 로컬 Docker를 운영 환경으로 간주하지 않는다.

### 비밀값 이름

| 위치 | 이름 | 용도 |
|---|---|---|
| n8n Credential | `OPENAI_API_KEY` | OpenAI 요청 |
| n8n Credential·FastAPI `.env` | `VERY_RICH_N8N_INGEST_SECRET` | 내부 수집·저장 API 인증 |
| n8n 운영 `.env` | `N8N_ENCRYPTION_KEY` | n8n Credential 암호화 |

실제 값은 문서, workflow JSON, 코드, 로그와 Git에 넣지 않는다. OpenAI 키는 React와 FastAPI에 전달하지 않고 n8n Credential에서만 사용한다.

## 8. 호출량·비용 기준

- 공개 후보는 하루 최대 3건이다.
- 항목별 첫 요청 1회와 검증 실패 재시도 1회만 허용한다.
- 병렬 OpenAI 호출은 1개로 제한한다.
- 모델명과 금액 기준 일일 상한은 **미정**이다.
- Phase 14에서 서로 다른 유형의 공식 자료 10건으로 스키마 통과율, 근거 일치율, 숫자 오류, 토큰 사용량을 비교한 뒤 모델을 고른다.
- 모델 선택은 가격보다 사실 검증 통과율을 먼저 본다.
- OpenAI 프로젝트에는 월 예산 알림과 가능한 경우 지출 한도를 설정한다.

## 9. Phase 12로 넘길 미정 사항

다음 항목은 임의로 확정하지 않는다.

- 운영 n8n 배포 위치
- OpenAI 모델명과 금액 기준 일일 비용 상한
- 한국은행 보도자료를 AI 요약에 사용할 수 있는 승인 또는 공공데이터 해당 여부
- 한국은행 경제금융용어 자료를 가공해 30개 용어를 만들 수 있는지 여부
- 금융위원회 공식 RSS 503이 일시 장애인지 장기 중단인지
- 상업 서비스로 전환할 경우 금융위원회 사전 협의 결과

이 항목들은 데이터베이스 필드와 API의 상태값으로는 표현하되, 답을 얻기 전 실제 수집 범위를 넓히지 않는다.

## 10. 확인 근거

- [금융위원회 RSS 서비스](https://www.fsc.go.kr/ut060101)
- [금융위원회 저작권정책](https://www.fsc.go.kr/ut020104)
- [한국은행 RSS 서비스](https://www.bok.or.kr/static/view/popup/rss_popup.html)
- [한국은행 저작권보호방침](https://www.bok.or.kr/portal/main/contents.do?menuNo=200228)
- [Scrapling 저장소와 사용 기능](https://github.com/D4Vinci/Scrapling)
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI API 키 보안 안내](https://help.openai.com/en/articles/8304786-keeping-your-openai-account-secure)
