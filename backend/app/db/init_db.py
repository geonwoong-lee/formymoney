import json
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionFactory
from app.models.investment import InvestmentAsset, InvestmentMonthlyPoint
from app.models.reference_item import ReferenceItem
from app.models.savings_product import BankSavingsProduct, PreferentialCondition, SavingsPolicy

POLICY_SOURCE_URL = "https://www.kinfa.or.kr/financialProduct/youthFutureSavings.do"
RATE_SOURCE_URL = "https://portal.kfb.or.kr/compare/receiving_youth_future.php"
RATE_SOURCE_DATE = "2026-10-13"
MARKET_SNAPSHOT_PATH = Path(__file__).resolve().parents[1] / "data" / "investment_market_snapshot.json"


def initialize_database(session_factory: SessionFactory) -> None:
    with session_factory() as session:
        if session.scalar(select(ReferenceItem).where(ReferenceItem.key == "phase1-ready")) is None:
            session.add(ReferenceItem(key="phase1-ready", label="Phase 1 database connection"))

        policy = session.scalar(select(SavingsPolicy).where(SavingsPolicy.code == "youth_future_savings"))
        if policy is None:
            policy = SavingsPolicy(code="youth_future_savings")
            session.add(policy)
        for field, value in {
            "name": "청년미래적금", "term_months": 36, "minimum_monthly_amount": 1_000,
            "maximum_monthly_amount": 500_000, "annual_limit": 6_000_000,
            "general_contribution_rate": Decimal("6.00"), "preferred_contribution_rate": Decimal("12.00"),
            "tax_exempt": True, "source_url": POLICY_SOURCE_URL, "source_date": "2026-10-06",
        }.items():
            setattr(policy, field, value)

        for product in _all_products():
            _upsert_bank_product(session, product)
        _initialize_investments(session)
        session.commit()


def _initialize_investments(session: Session) -> None:
    snapshot = json.loads(MARKET_SNAPSHOT_PATH.read_text(encoding="utf-8"))
    for data in snapshot["assets"]:
        values = dict(data)
        points = values.pop("points")
        asset = session.scalar(select(InvestmentAsset).where(InvestmentAsset.code == values["code"]))
        if asset is None:
            asset = InvestmentAsset(**values)
            session.add(asset)
        else:
            for field, value in values.items():
                setattr(asset, field, value)
            asset.points.clear()
            session.flush()
        asset.points.extend(InvestmentMonthlyPoint(**point) for point in points)


def _upsert_bank_product(session: Session, data: dict[str, object]) -> None:
    values = dict(data)
    conditions = values.pop("conditions")
    product = session.scalar(select(BankSavingsProduct).where(BankSavingsProduct.bank_code == values["bank_code"]))
    if product is None:
        product = BankSavingsProduct(**values)
        session.add(product)
    else:
        for field, value in values.items():
            setattr(product, field, value)
        product.conditions.clear()
        session.flush()
    product.conditions.extend(PreferentialCondition(**condition) for condition in conditions)


def _all_products() -> list[dict[str, object]]:
    c = _condition
    common = _common_conditions
    return [
        _product("nh", "NH농협은행", "NH청년미래적금", "3.00", [
            c("income_transfer", "급여·가맹점 대금", "1.00", "급여 또는 가맹점 대금을 18개월 이상 입금합니다.", "급여 또는 가맹점 대금을 18개월 이상 받을 수 있나요?", 1),
            c("nh_card", "NH카드", "0.70", "NH카드를 월평균 20만원 이상 이용합니다.", "NH카드를 월평균 20만원 이상 사용할 수 있나요?", 2),
            c("first_or_linked", "첫 거래·도약계좌 연계", "0.30", "가입 전 1년간 예·적금이 없거나 NH 청년도약계좌 연계가입자입니다.", "첫 거래 또는 NH 청년도약계좌 연계 조건을 충족하나요?", 3),
            c("mydata", "NH마이데이터", "0.30", "2개 업권 이상의 자산을 연결하고 18개월 이상 유지합니다.", "NH마이데이터에 2개 업권 이상을 연결해 18개월 유지할 수 있나요?", 4), *common(5),
        ]),
        _product("shinhan", "신한은행", "신한 청년미래적금", "3.00", [
            c("income_transfer", "소득이체", "0.30", "50만원 이상 급여 또는 가맹점 매출대금을 18개월 이상 입금합니다.", "소득 입금을 18개월 이상 유지할 수 있나요?", 1),
            c("income_transfer_first", "소득이체 첫 거래", "1.00", "가입 직전 6개월간 소득이체 실적이 없고 소득이체 조건을 충족합니다.", "직전 6개월 소득이체 실적이 없고 앞으로 18개월 이상 유지할 수 있나요?", 2),
            c("shinhan_card", "신한카드", "0.20", "신한카드 결제대금을 18개월 이상 출금합니다.", "신한카드를 18개월 이상 사용할 수 있나요?", 3),
            c("securities_trading", "신한투자증권", "0.50", "연결된 신한투자증권 계좌에서 3개월 이상 거래합니다.", "신한투자증권에서 3개월 이상 거래할 수 있나요?", 4),
            c("first_or_linked", "첫 적금·도약계좌 연계", "0.30", "첫 적금이거나 신한 청년도약계좌 연계가입자입니다.", "첫 적금 또는 신한 청년도약계좌 연계 조건을 충족하나요?", 5), *common(6),
        ]),
        _product("woori", "우리은행", "우리 청년미래적금", "3.00", [
            c("income_transfer", "급여·가맹점 대금", "1.50", "급여 100만원 이상 또는 가맹점 대금을 18회 이상 입금합니다.", "급여 100만원 이상 또는 가맹점 대금을 18회 이상 받을 수 있나요?", 1),
            c("first_or_linked", "첫 거래·도약계좌 연계", "0.50", "직전 6개월 예·적금이 없거나 청년도약계좌 연계가입자입니다.", "첫 거래 또는 청년도약계좌 연계 조건을 충족하나요?", 2),
            c("woori_activity", "카드·생활 자동이체", "0.50", "우리카드 결제나 통신비 자동이체 등을 18회 이상 이용합니다.", "우리카드나 생활비 자동이체를 18회 이상 이용할 수 있나요?", 3),
            c("launch_event", "출시 기념", "0.30", "2026년 12월 31일까지 가입을 신청합니다.", "2026년 12월 31일까지 가입 신청했나요?", 4), *common(5),
        ]),
        _product("hana", "하나은행", "하나 청년미래적금", "3.00", [
            c("income_transfer", "급여·가맹점 대금", "1.20", "급여 또는 가맹점 대금을 24회 이상 입금합니다.", "급여 또는 가맹점 대금을 24회 이상 받을 수 있나요?", 1),
            c("hana_card", "하나카드", "0.60", "하나카드 결제 실적을 24회 이상 쌓습니다.", "하나카드를 24회 이상 사용할 수 있나요?", 2),
            c("first_customer", "첫 거래", "0.50", "정책상품을 제외하고 직전 1년간 예·적금이 없습니다.", "직전 1년간 하나은행 예·적금 거래가 없나요?", 3), *common(4),
        ]),
        _product("ibk", "IBK기업은행", "IBK청년미래적금", "3.00", [
            c("salary_transfer", "급여이체", "1.00", "월 50만원 이상 급여를 24개월 이상 이체합니다.", "월 50만원 이상 급여이체를 24개월 유지할 수 있나요?", 1),
            c("ibk_card", "IBK카드", "0.50", "IBK카드를 월평균 30만원 이상 사용하고 만기까지 보유합니다.", "IBK카드를 월평균 30만원 이상 사용하고 만기까지 보유할 수 있나요?", 2),
            c("housing_subscription", "주택청약", "0.50", "만기 시 IBK 주택청약종합저축을 보유합니다.", "만기까지 IBK 주택청약종합저축을 보유할 수 있나요?", 3),
            c("sme_preferred", "중소기업 우대형", "0.30", "중소기업 우대형 가입자로 확정됩니다.", "중소기업 우대형 가입 대상인가요?", 4),
            c("first_or_linked", "첫 거래·도약계좌 연계", "0.50", "IBK 청년도약계좌 연계가입자이거나 최초 고객입니다.", "IBK 청년도약계좌 연계 또는 최초 고객 조건을 충족하나요?", 5), *common(6),
        ]),
        _product("kb", "KB국민은행", "KB 청년미래적금", "3.00", [
            c("salary_transfer", "급여이체", "1.00", "급여를 12회 이상 입금합니다.", "급여를 12회 이상 받을 수 있나요?", 1),
            c("withdrawal_activity", "생활거래", "0.80", "공과금·KB리브모바일·KB국민카드 대금 중 하나를 12회 이상 출금합니다.", "생활거래 출금을 12회 이상 유지할 수 있나요?", 2),
            c("first_or_linked", "첫 거래·도약계좌 연계", "0.50", "KB 청년도약계좌 가입이력이 있거나 최근 6개월 예·적금이 없습니다.", "KB 도약계좌 연계 또는 첫 거래 조건을 충족하나요?", 3), *common(4),
        ], "https://ombr1.kbstar.com/quics?TmpltID=TP03037&page=C106592", "2026-08-26"),
        _product("post", "우정사업본부", "우체국 청년미래적금", "3.00", [
            c("second_round_event", "2차 가입 이벤트", "1.00", "2026년 11월 16일부터 27일 사이 계좌를 개설합니다.", "2026년 11월 16~27일에 계좌를 개설하나요?", 1),
            c("first_or_salary", "첫 거래·급여이체", "0.50", "우체국 적금 첫 거래이거나 급여를 12회 이상 이체합니다.", "우체국 적금 첫 거래이거나 급여이체 12회를 채울 수 있나요?", 2),
            c("post_card", "우체국 체크카드", "0.40", "가입 후 정해진 기간 안에 체크카드를 20만원 이상 사용합니다.", "우체국 체크카드를 20만원 이상 사용할 수 있나요?", 3),
            c("automatic_transfer", "적금 자동이체", "0.40", "월 1만원 이상 적금 자동이체를 18개월 이상 유지합니다.", "월 1만원 이상 자동이체를 18개월 유지할 수 있나요?", 4), *common(5),
        ]),
        _product("sh", "Sh수협은행", "Sh청년미래적금", "2.00", [
            c("salary_transfer", "급여이체", "0.50", "건당 50만원 이상 급여를 20개월 이상 입금합니다.", "건당 50만원 이상 급여를 20개월 받을 수 있나요?", 1),
            c("sh_card", "수협카드", "0.60", "수협카드 대금을 월 10만원 이상 20개월 납부합니다.", "수협카드를 월 10만원 이상 20개월 사용할 수 있나요?", 2),
            c("marketing", "마케팅 동의", "0.20", "마케팅 동의를 만기까지 유지합니다.", "마케팅 동의를 만기까지 유지할 수 있나요?", 3), *common(4),
        ]),
        _product("im", "iM뱅크", "iM 청년미래적금", "2.00", [
            c("first_customer", "첫 거래", "0.30", "iM뱅크 첫 거래 고객입니다.", "iM뱅크 첫 거래 고객인가요?", 1),
            c("salary_transfer", "급여이체", "0.30", "월 50만원 이상 급여를 24개월 이상 입금합니다.", "월 50만원 이상 급여를 24개월 받을 수 있나요?", 2),
            c("automatic_transfer", "적금 자동이체", "0.30", "적금 자동이체로 24개월 이상 납입합니다.", "적금 자동이체로 24개월 이상 납입할 수 있나요?", 3),
            c("im_card", "iM뱅크 BC카드", "0.30", "월 10만원 이상 카드를 24개월 사용합니다.", "iM뱅크 BC카드를 월 10만원 이상 24개월 사용할 수 있나요?", 4),
            c("marketing", "마케팅 동의", "0.10", "마케팅 수신에 동의합니다.", "마케팅 수신에 동의할 수 있나요?", 5), *common(6),
        ]),
        _product("busan", "BNK부산은행", "BNK 청년미래적금", "2.00", [
            c("salary_transfer", "급여이체", "0.50", "급여를 18개월 이상 입금합니다.", "급여를 18개월 이상 받을 수 있나요?", 1),
            c("busan_card", "부산은행 카드", "0.50", "카드를 누적 300만원 이상 사용합니다.", "부산은행 카드를 누적 300만원 이상 사용할 수 있나요?", 2),
            c("housing_subscription", "주택청약", "0.30", "부산은행 주택청약종합저축을 보유합니다.", "부산은행 주택청약종합저축을 보유하고 있나요?", 3), *common(4),
        ]),
        _product("gwangju", "광주은행", "KJB 청년미래적금", "2.00", [
            c("first_or_linked", "첫 거래·도약계좌 연계", "0.50", "첫 거래 고객이거나 KJB 청년도약계좌 연계가입자입니다.", "첫 거래 또는 KJB 도약계좌 연계 조건을 충족하나요?", 1),
            c("salary_transfer", "급여이체", "0.30", "급여를 30회 이상 입금합니다.", "급여를 30회 이상 받을 수 있나요?", 2),
            c("automatic_transfer", "적금 자동이체", "0.20", "광주은행 통장에서 20회 이상 자동이체합니다.", "광주은행 통장에서 적금을 20회 이상 자동이체할 수 있나요?", 3),
            c("term_deposit", "정기예금", "0.30", "1년 이상, 1천만원 이상의 정기예금을 가입해 만기해지합니다.", "1천만원 이상 정기예금을 1년 이상 유지할 수 있나요?", 4), *common(5),
        ]),
        _product("jeonbuk", "전북은행", "JB 청년미래적금", "2.00", [
            c("income_transfer", "급여·가맹점 대금", "0.50", "월 50만원 이상을 계약기간의 절반 이상 입금합니다.", "월 50만원 이상 소득 입금을 계약기간 절반 이상 유지할 수 있나요?", 1),
            c("jb_card", "JB카드", "0.30", "계약기간의 절반 이상 JB카드를 사용합니다.", "JB카드를 계약기간 절반 이상 사용할 수 있나요?", 2),
            c("automatic_transfer", "적금 자동이체", "0.30", "계약기간의 절반 이상 자동이체로 납입합니다.", "적금 자동이체를 계약기간 절반 이상 유지할 수 있나요?", 3),
            c("marketing", "마케팅 동의", "0.20", "마케팅 수신에 동의합니다.", "마케팅 수신에 동의할 수 있나요?", 4), *common(5),
        ]),
        _product("gyeongnam", "BNK경남은행", "BNK 청년미래적금", "2.00", [
            c("support_rate", "응원금리", "0.30", "가입자에게 적용되는 응원금리입니다.", "가입자 공통 응원금리를 반영할까요?", 1),
            c("income_transfer", "급여·가맹점 대금", "0.70", "건당 50만원 이상을 계약기간의 절반 이상 입금합니다.", "50만원 이상 소득 입금을 계약기간 절반 이상 유지할 수 있나요?", 2),
            c("gyeongnam_card", "경남은행 카드", "0.20", "가입월 포함 3개월 동안 10만원 이상 사용합니다.", "경남은행 카드를 3개월 동안 10만원 이상 사용할 수 있나요?", 3),
            c("first_customer", "첫 거래", "0.20", "직전 1년간 예·적금 신규·해지 이력이 없습니다.", "직전 1년간 경남은행 예·적금 신규·해지 이력이 없나요?", 4),
            c("marketing", "마케팅 동의", "0.10", "가입 전에 마케팅 수신에 동의합니다.", "가입 전에 마케팅 수신에 동의할 수 있나요?", 5), *common(6),
        ]),
        _product("kakao", "카카오뱅크", "카카오뱅크 청년미래적금", "2.00", [
            c("first_customer", "첫 입출금통장", "0.70", "카카오뱅크 입출금통장을 처음 만든 뒤 2개월 안에 적금을 개설합니다.", "첫 입출금통장 개설 후 2개월 안에 가입하나요?", 1),
            c("kakao_card", "카카오뱅크 체크카드", "0.60", "체크카드를 월 50만원 이상 24개월 사용합니다.", "체크카드를 월 50만원 이상 24개월 사용할 수 있나요?", 2), *common(3),
        ]),
    ]


def _common_conditions(start_order: int) -> list[dict[str, object]]:
    return [
        _condition("income_plus", "소득 우대", "0.50", "총급여 3,600만원 이하 또는 종합소득 2,600만원 이하이면 자동 적용됩니다.", "소득 우대 기준을 충족하나요?", start_order),
        _condition("financial_counseling", "청년 재무상담", "0.20", "만기 3개월 전까지 서민금융진흥원 청년 재무상담을 이수합니다.", "기한 안에 청년 재무상담을 이수할 계획인가요?", start_order + 1),
    ]


def _product(bank_code: str, bank_name: str, product_name: str, maximum_bonus_rate: str,
             conditions: list[dict[str, object]], source_url: str = RATE_SOURCE_URL,
             source_date: str = RATE_SOURCE_DATE) -> dict[str, object]:
    return {"bank_code": bank_code, "bank_name": bank_name, "product_name": product_name,
            "base_rate": Decimal("5.00"), "maximum_bonus_rate": Decimal(maximum_bonus_rate),
            "source_url": source_url, "source_date": source_date, "conditions": conditions}


def _condition(code: str, title: str, rate: str, description: str, question: str,
               order: int) -> dict[str, object]:
    return {"code": code, "title": title, "bonus_rate": Decimal(rate), "description": description,
            "question": question, "requires_additional_review": False, "sort_order": order}
