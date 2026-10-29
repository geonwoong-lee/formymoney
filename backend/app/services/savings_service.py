from decimal import Decimal

from sqlalchemy.orm import Session

from app.calculators.savings import calculate_fixed_monthly_savings, calculate_variable_monthly_savings
from app.models.savings_product import BankSavingsProduct, PreferentialCondition
from app.repositories.savings_repository import SavingsRepository
from app.schemas.savings import (
    Answer,
    BankCalculationResult,
    CashflowCalculationRequest,
    CashflowCalculationResponse,
    CalculationRequest,
    CalculationResponse,
    ConditionResponse,
    ConditionResult,
    ContributionType,
    PolicyResponse,
    ProductResponse,
    ProductsResponse,
)


class SavingsDataError(RuntimeError):
    pass


class SavingsInputError(ValueError):
    pass


class SavingsService:
    def __init__(self, session: Session) -> None:
        self.repository = SavingsRepository(session)

    def get_products(self) -> ProductsResponse:
        policy = self.repository.get_policy()
        products = self.repository.list_products()
        if policy is None or not products:
            raise SavingsDataError("공식 상품 데이터를 불러오지 못했습니다.")

        return ProductsResponse(
            policy=PolicyResponse.model_validate(policy, from_attributes=True),
            products=[self._product_response(product) for product in products],
        )

    def calculate(self, request: CalculationRequest) -> CalculationResponse:
        policy = self.repository.get_policy()
        products = self.repository.list_products()
        if policy is None or not products:
            raise SavingsDataError("공식 상품 데이터를 불러오지 못했습니다.")

        known_bank_codes = {product.bank_code for product in products}
        selected_codes = set(request.bank_codes or known_bank_codes)
        unknown_banks = selected_codes - known_bank_codes
        if unknown_banks:
            raise SavingsInputError(f"지원하지 않는 은행 코드입니다: {', '.join(sorted(unknown_banks))}")
        if request.current_bank_code is not None and request.current_bank_code not in selected_codes:
            raise SavingsInputError("현재 거래 은행은 비교 대상 은행에 포함되어야 합니다.")

        selected_products = [product for product in products if product.bank_code in selected_codes]
        self._validate_answer_codes(request, selected_products)
        contribution_rate = self._contribution_rate(request.contribution_type, policy)
        results = [
            self._calculate_product(product, request, policy.term_months, contribution_rate)
            for product in selected_products
        ]
        current_amount = next(
            (result.expected_maturity_amount for result in results if result.bank_code == request.current_bank_code),
            None,
        )
        if current_amount is not None:
            results = [
                result.model_copy(
                    update={"difference_from_current_bank": result.expected_maturity_amount - current_amount}
                )
                for result in results
            ]
        results.sort(key=lambda result: (-result.expected_maturity_amount, result.bank_code))

        return CalculationResponse(
            monthly_amount=request.monthly_amount,
            term_months=policy.term_months,
            contribution_type=request.contribution_type,
            tax_exempt=policy.tax_exempt,
            results=results,
        )

    def calculate_cashflow(self, request: CashflowCalculationRequest) -> CashflowCalculationResponse:
        policy = self.repository.get_policy()
        if policy is None:
            raise SavingsDataError("공식 상품 정책을 불러오지 못했습니다.")
        if len(request.monthly_amounts) != policy.term_months:
            raise SavingsInputError(f"월별 납입액은 {policy.term_months}개월분이어야 합니다.")
        invalid_amounts = [
            amount for amount in request.monthly_amounts
            if amount < 0
            or amount > policy.maximum_monthly_amount
            or (amount != 0 and amount < policy.minimum_monthly_amount)
        ]
        if invalid_amounts:
            raise SavingsInputError(
                f"월별 납입액은 0원 또는 {policy.minimum_monthly_amount:,}원부터 "
                f"{policy.maximum_monthly_amount:,}원 사이여야 합니다."
            )

        fixed_request = CalculationRequest(
            monthly_amount=request.fixed_monthly_amount,
            contribution_type=request.contribution_type,
            condition_answers={request.bank_code: request.condition_answers},
            bank_codes=[request.bank_code],
        )
        fixed_result = self.calculate(fixed_request).results[0]
        contribution_rate = self._contribution_rate(request.contribution_type, policy)
        amounts = calculate_variable_monthly_savings(
            request.monthly_amounts,
            Decimal(str(fixed_result.expected_rate)),
            Decimal(str(fixed_result.base_rate)),
            contribution_rate,
        )
        variable_result = fixed_result.model_copy(update={
            "principal": amounts.principal,
            "deposit_interest": amounts.deposit_interest,
            "government_contribution": amounts.government_contribution,
            "government_contribution_interest": amounts.government_contribution_interest,
            "expected_maturity_amount": amounts.expected_maturity_amount,
        })
        return CashflowCalculationResponse(
            bank_code=request.bank_code,
            term_months=policy.term_months,
            monthly_amounts=request.monthly_amounts,
            result=variable_result,
            fixed_expected_maturity_amount=fixed_result.expected_maturity_amount,
            difference_from_fixed_plan=amounts.expected_maturity_amount - fixed_result.expected_maturity_amount,
        )

    def _calculate_product(
        self,
        product: BankSavingsProduct,
        request: CalculationRequest,
        term_months: int,
        contribution_rate: Decimal,
    ) -> BankCalculationResult:
        answers = request.condition_answers.get(product.bank_code, {})
        condition_results = [self._condition_result(condition, answers.get(condition.code, Answer.unknown)) for condition in product.conditions]
        applied_bonus = sum(
            (Decimal(str(result.applied_bonus_rate)) for result in condition_results),
            Decimal("0"),
        )
        applied_bonus = min(applied_bonus, product.maximum_bonus_rate)
        expected_rate = product.base_rate + applied_bonus
        maximum_rate = product.base_rate + product.maximum_bonus_rate
        if expected_rate > maximum_rate:
            raise SavingsDataError(f"{product.bank_name} 예상금리가 최고금리를 넘었습니다.")

        amounts = calculate_fixed_monthly_savings(
            request.monthly_amount,
            term_months,
            expected_rate,
            product.base_rate,
            contribution_rate,
        )
        return BankCalculationResult(
            bank_code=product.bank_code,
            bank_name=product.bank_name,
            product_name=product.product_name,
            base_rate=product.base_rate,
            maximum_rate=maximum_rate,
            applied_bonus_rate=applied_bonus,
            expected_rate=expected_rate,
            principal=amounts.principal,
            deposit_interest=amounts.deposit_interest,
            government_contribution=amounts.government_contribution,
            government_contribution_interest=amounts.government_contribution_interest,
            expected_maturity_amount=amounts.expected_maturity_amount,
            difference_from_current_bank=None,
            conditions=condition_results,
            source_url=product.source_url,
            source_date=product.source_date,
        )

    @staticmethod
    def _condition_result(condition: PreferentialCondition, answer: Answer) -> ConditionResult:
        if answer == Answer.yes and not condition.requires_additional_review:
            status, applied, reason = "applied", condition.bonus_rate, "답변에 따라 예상금리에 반영했습니다."
        elif answer == Answer.no:
            status, applied, reason = "not_applied", Decimal("0"), "조건을 충족하지 않아 반영하지 않았습니다."
        else:
            status, applied = "needs_review", Decimal("0")
            reason = "공식 조건을 추가로 확인해야 하므로 예상금리에 반영하지 않았습니다."
        return ConditionResult(
            code=condition.code,
            title=condition.title,
            answer=answer,
            status=status,
            bonus_rate=condition.bonus_rate,
            applied_bonus_rate=applied,
            reason=reason,
        )

    @staticmethod
    def _contribution_rate(contribution_type: ContributionType, policy: object) -> Decimal:
        if contribution_type == ContributionType.general:
            return policy.general_contribution_rate
        if contribution_type == ContributionType.preferred:
            return policy.preferred_contribution_rate
        return Decimal("0")

    @staticmethod
    def _validate_answer_codes(request: CalculationRequest, products: list[BankSavingsProduct]) -> None:
        products_by_code = {product.bank_code: product for product in products}
        unknown_answer_banks = set(request.condition_answers) - set(products_by_code)
        if unknown_answer_banks:
            raise SavingsInputError(f"지원하지 않는 은행 답변입니다: {', '.join(sorted(unknown_answer_banks))}")
        for bank_code, answers in request.condition_answers.items():
            valid_codes = {condition.code for condition in products_by_code[bank_code].conditions}
            unknown_conditions = set(answers) - valid_codes
            if unknown_conditions:
                raise SavingsInputError(f"{bank_code}의 알 수 없는 조건입니다: {', '.join(sorted(unknown_conditions))}")

    @staticmethod
    def _product_response(product: BankSavingsProduct) -> ProductResponse:
        return ProductResponse(
            bank_code=product.bank_code,
            bank_name=product.bank_name,
            product_name=product.product_name,
            base_rate=product.base_rate,
            maximum_rate=product.base_rate + product.maximum_bonus_rate,
            source_url=product.source_url,
            source_date=product.source_date,
            conditions=[ConditionResponse.model_validate(condition, from_attributes=True) for condition in product.conditions],
        )
