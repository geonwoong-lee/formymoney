from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.reference_item import ReferenceItem
from app.models.savings_product import BankSavingsProduct, PreferentialCondition, SavingsPolicy
from app.db.session import SessionFactory


def initialize_database(session_factory: SessionFactory) -> None:
    with session_factory() as session:
        existing = session.scalar(select(ReferenceItem).where(ReferenceItem.key == "phase1-ready"))
        if existing is None:
            session.add(
                ReferenceItem(
                    key="phase1-ready",
                    label="Phase 1 database connection",
                )
            )
            session.commit()

        policy = session.scalar(select(SavingsPolicy).where(SavingsPolicy.code == "youth_future_savings"))
        if policy is None:
            session.add(
                SavingsPolicy(
                    code="youth_future_savings",
                    name="청년미래적금",
                    term_months=36,
                    minimum_monthly_amount=1_000,
                    maximum_monthly_amount=500_000,
                    annual_limit=6_000_000,
                    general_contribution_rate=Decimal("6.00"),
                    preferred_contribution_rate=Decimal("12.00"),
                    tax_exempt=True,
                    source_url="https://www.kinfa.or.kr/financialProduct/youthFutureSavings.do",
                    source_date="2026-10-06",
                )
            )

        _seed_bank_product(session, _kb_product())
        _seed_bank_product(session, _shinhan_product())
        session.commit()


def _seed_bank_product(session: Session, data: dict[str, object]) -> None:
    bank_code = str(data["bank_code"])
    existing = session.scalar(select(BankSavingsProduct).where(BankSavingsProduct.bank_code == bank_code))
    if existing is not None:
        return

    conditions = data.pop("conditions")
    product = BankSavingsProduct(**data)
    product.conditions = [PreferentialCondition(**condition) for condition in conditions]
    session.add(product)


def _kb_product() -> dict[str, object]:
    return {
        "bank_code": "kb",
        "bank_name": "KB국민은행",
        "product_name": "KB 청년미래적금",
        "base_rate": Decimal("5.00"),
        "maximum_bonus_rate": Decimal("3.00"),
        "source_url": "https://ombr1.kbstar.com/quics?TmpltID=TP03037&page=C106592",
        "source_date": "2026-08-26",
        "conditions": [
            _condition("salary_transfer", "급여이체", "1.00", "급여 입금 실적이 12개월 이상입니다.", "급여를 이 계좌로 12개월 이상 받을 수 있나요?", 1),
            _condition("withdrawal_activity", "생활거래", "0.80", "공과금·Liiv M 자동이체 또는 KB카드 결제 출금 실적이 12개월 이상입니다.", "공과금·Liiv M 또는 KB카드 결제를 12개월 이상 연결할 수 있나요?", 2),
            _condition("relationship_thanks", "거래 감사", "0.50", "청년도약계좌 이력, 최근 6개월 예적금 미보유, 모임통장 요건 중 하나를 충족합니다.", "KB의 거래 감사 조건 중 하나를 충족하나요?", 3, True),
            _condition("income_plus", "소득 플러스", "0.50", "총급여 3,600만원 이하 또는 종합소득 2,600만원 이하입니다.", "소득 기준을 충족하나요?", 4),
            _condition("financial_counseling", "금융상담", "0.20", "만기 3개월 전 말일까지 서민금융진흥원 청년 금융상담을 이수합니다.", "정해진 기한 안에 청년 금융상담을 이수할 수 있나요?", 5),
        ],
    }


def _shinhan_product() -> dict[str, object]:
    return {
        "bank_code": "shinhan",
        "bank_name": "신한은행",
        "product_name": "신한 청년미래적금",
        "base_rate": Decimal("5.00"),
        "maximum_bonus_rate": Decimal("3.00"),
        "source_url": "https://img.shinhan.com/sbank2016/seol/20260602000000540001LC000030.PDF?1782055233048=",
        "source_date": "2026-06-22",
        "conditions": [
            _condition("income_plus", "소득 플러스", "0.50", "총급여 3,600만원 이하 또는 종합소득 2,600만원 이하입니다.", "소득 기준을 충족하나요?", 1),
            _condition("financial_counseling", "금융상담", "0.20", "정해진 기한 안에 서민금융진흥원 청년 금융상담을 이수합니다.", "청년 금융상담을 이수할 수 있나요?", 2),
            _condition("income_transfer", "소득이체", "0.30", "50만원 이상 급여 또는 가맹점 매출을 18개월 이상 입금합니다.", "소득 입금을 18개월 이상 유지할 수 있나요?", 3),
            _condition("shinhan_card", "신한카드", "0.20", "신한카드 결제대금을 신한은행 계좌에서 18개월 이상 출금합니다.", "신한카드를 발급해 18개월 이상 결제할 생각이 있나요?", 4),
            _condition("securities_trading", "증권거래", "0.50", "연결된 신한투자증권 계좌에서 3개월 이상 거래합니다.", "신한투자증권 거래를 3개월 이상 할 수 있나요?", 5),
            _condition("first_or_linked", "첫 거래·연계", "0.30", "최근 6개월 정기예적금 미보유 또는 청년도약계좌 연계 조건을 충족합니다.", "첫 거래 또는 청년도약계좌 연계 조건을 충족하나요?", 6, True),
            _condition("linked_special", "연계 특별우대", "1.00", "2026년 8월 31일까지 청년도약계좌 연계 가입 요건을 충족해야 합니다.", "연계 특별우대 대상인지 확인했나요?", 7, True),
        ],
    }


def _condition(code: str, title: str, rate: str, description: str, question: str, order: int, review: bool = False) -> dict[str, object]:
    return {
        "code": code,
        "title": title,
        "bonus_rate": Decimal(rate),
        "description": description,
        "question": question,
        "requires_additional_review": review,
        "sort_order": order,
    }
