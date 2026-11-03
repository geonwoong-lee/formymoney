from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.api.v1.endpoints import dart as dart_endpoint
from app.collectors.dart import BANK_CORPS, FILING_CORPS, DartError, Filing, MainAccounts, parse_filings, parse_main_accounts
from app.core.config import Settings
from app.services.daily_jobs import JobResult, collect_dart
from app.services.dart_service import DartService


def _row(fs_div: str, name: str, now: str, before: str) -> dict[str, str]:
    return {"fs_div": fs_div, "account_nm": name, "thstrm_amount": now, "frmtrm_amount": before, "thstrm_dt": "2025.12.31 현재", "rcept_no": "20260314000001"}


def test_main_accounts_prefer_the_banks_own_statement_and_fall_back_to_consolidated() -> None:
    body = {"status": "000", "list": [
        _row("CFS", "자산총계", "999", "888"),
        _row("OFS", "자산총계", "1,000", "900"), _row("OFS", "부채총계", "920", "830"), _row("OFS", "자본총계", "80", "70"),
        _row("OFS", "예수부채", "700", "650"), _row("OFS", "당기순이익(손실)", "8", "-"), _row("OFS", "모르는 계정", "1", "1"),
    ]}
    found = parse_main_accounts(body, "00386937", 2025)

    assert (found.fs_div, found.period_end, found.receipt_no) == ("OFS", "2025.12.31", "20260314000001")
    assert found.current == {"assets": Decimal("1000"), "liabilities": Decimal("920"), "equity": Decimal("80"), "deposits": Decimal("700"), "net_income": Decimal("8")}
    assert "net_income" not in found.previous
    assert parse_main_accounts({"status": "000", "list": [_row("CFS", "자산총계", "5", "4")]}, "x", 2025).fs_div == "CFS"
    assert parse_main_accounts({"status": "013", "message": "조회된 데이타가 없습니다."}, "x", 2025) is None
    with pytest.raises(DartError, match="020"):
        parse_main_accounts({"status": "020", "message": "요청 제한"}, "x", 2025)


def test_filings_keep_title_date_and_receipt_number_only() -> None:
    filings = parse_filings({"status": "000", "list": [
        {"rcept_no": "20261102000123", "corp_code": "00688996", "corp_name": "KB금융", "report_nm": "  주요사항보고서(자기주식취득결정) ", "rcept_dt": "20261102", "flr_nm": "KB금융"},
        {"rcept_no": "", "rcept_dt": "20261102"},
        {"rcept_no": "x", "rcept_dt": "bad"},
    ]})
    assert filings == [Filing("20261102000123", "00688996", "KB금융", "주요사항보고서(자기주식취득결정)", date(2026, 11, 2), "KB금융")]
    assert parse_filings({"status": "013"}) == []


def test_financials_show_plain_ratios_and_derive_net_interest(client: TestClient) -> None:
    accounts = MainAccounts("01133217", 2025, "OFS", "2025.12.31", "20260314000001",
        {"assets": Decimal("1000"), "liabilities": Decimal("920"), "equity": Decimal("80"), "deposits": Decimal("690"),
         "interest_income": Decimal("50"), "interest_expense": Decimal("20"), "net_income": Decimal("9")},
        {"assets": Decimal("800"), "net_income": Decimal("10")})
    with client.app.state.session_factory() as session:
        DartService(session).save_financials("kakao", accounts)

    body = client.get("/api/v1/banks/kakao/financials").json()
    items = {item["key"]: item for item in body["items"]}
    assert (body["corpName"], body["year"], body["statement"]) == ("카카오뱅크", 2025, "별도재무제표")
    assert items["net_interest"]["current"] == "30"  # 이자수익 50 − 이자비용 20
    assert items["assets"]["changePercent"] == "25.00" and items["net_income"]["changePercent"] == "-10.00"
    assert items["liabilities"]["previous"] is None and items["liabilities"]["changePercent"] is None
    assert body["ratios"] == {"equityToAssets": "8.00", "depositsToLiabilities": "75.00", "netIncomeToAssets": "0.90"}
    assert body["balanced"] is True
    assert body["peers"]["equityToAssets"] == {"count": 1, "min": "8.00", "minBank": "카카오뱅크", "max": "8.00", "maxBank": "카카오뱅크"}
    assert body["sourceUrl"] == "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260314000001"
    assert client.get("/api/v1/banks/nh/financials").status_code == 404
    assert client.get("/api/v1/dart/banks").json() == {"banks": [{"bankCode": "kakao", "corpName": "카카오뱅크"}]}


def test_recent_filings_are_newest_first_within_the_window(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(dart_endpoint, "korea_today", lambda: date(2026, 11, 3))
    with client.app.state.session_factory() as session:
        service = DartService(session)
        filings = [Filing(f"2026110{day}000001", "00688996", "KB금융", f"공시 {day}", date(2026, 11, day), "KB금융") for day in (1, 2, 3)]
        assert service.save_filings(filings + [filings[0]], date(2026, 11, 3)) == 3
        assert service.save_filings(filings, date(2026, 11, 3)) == 0
        service.save_filings([Filing("20260801000001", "00688996", "KB금융", "오래된 공시", date(2026, 8, 1), "KB금융")], date(2026, 11, 3))
        service.save_filings([Filing("20261103000009", "00386937", "국민은행", "투자설명서(일괄신고)", date(2026, 11, 3), "국민은행")], date(2026, 11, 3))

    body = client.get("/api/v1/dart/filings", params={"days": 2}).json()
    assert [item["title"] for item in body["items"]] == ["공시 3", "공시 2"]
    assert body["routineBondFilings"] == 1  # bond paperwork is counted, not listed
    assert body["items"][0]["url"].endswith("rcpNo=20261103000001")
    assert "오래된 공시" not in [item["title"] for item in client.get("/api/v1/dart/filings", params={"days": 60}).json()["items"]]


def test_daily_job_skips_without_a_key_and_records_partial_failures(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        quiet = JobResult("market")
        collect_dart(Settings(_env_file=None), session, quiet, date(2026, 11, 3))
        assert quiet.failures == [] and "DART" in quiet.notes[0]

        def accounts(key, corp_code, year):
            if corp_code == BANK_CORPS["kb"][0]:
                raise DartError("DART에 연결하지 못했습니다.")
            assert year == 2025
            return MainAccounts(corp_code, year, "OFS", "2025.12.31", "1", {"assets": Decimal("1")}, {})

        result = JobResult("market")
        collect_dart(Settings(_env_file=None, dart_api_key="k" * 40), session, result, date(2026, 11, 3), accounts, lambda *_: [])

    assert result.attempted == len(BANK_CORPS) + len(FILING_CORPS)
    assert result.failures == ["DART:국민은행: DART에 연결하지 못했습니다."]
    assert result.notes == [f"DART 재무 {len(BANK_CORPS) - 1}개 은행, 공시 0건(새로 0건)"]
