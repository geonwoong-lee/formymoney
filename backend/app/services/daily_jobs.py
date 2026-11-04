"""Daily collection jobs shared by the CLI scripts and the n8n-triggered internal API.

news: Naver headlines + Fed/ECB RSS + Bank of Korea press titles (link only), Korean interpretation of official releases, today's AI digest.
market: Bank of Korea ECOS series for the market tab.
Both end by refreshing 머니독's knowledge base (only changed text is embedded again).
Each job returns counts and a status (success / partial / failed) instead of raising, so the caller
can record the run and the scheduler can tell a partial day from a broken one.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.collectors.dart import BANK_CORPS, FILING_CORPS, DartError, fetch_filings, fetch_main_accounts
from app.collectors.ecos import SERIES, EcosError, fetch_series
from app.collectors.finlife import GROUPS as FINLIFE_GROUPS, FinlifeError, ProductRate, fetch_products
from app.collectors.finlife_loan import LoanRate, fetch_loans
from app.collectors.youth_policy import YouthPolicy, YouthPolicyError, fetch_youth_policies
from app.collectors.naver_news import NaverNewsError, fetch_headlines
from app.collectors.official_rss import LINK_ONLY_FEEDS, OFFICIAL_FEEDS, OfficialRssError, fetch_feed
from app.collectors.press_text import PressTextError, fetch_paragraphs
from app.core.config import Settings
from app.services.dart_service import DartService
from app.services.headline_interpreter import InterpretationError, interpret
from app.services.knowledge_base import sync as sync_knowledge
from app.services.market_service import MarketService
from app.services.news_digest import DigestError, build_sources, korea_today, save_digest, write_digest
from app.services.news_headline_service import NewsHeadlineService
from app.services.openai_client import OpenAIError, embed_texts
from app.services.loan_service import save_loans
from app.services.youth_policy_service import save_youth_policies
from app.services.product_rate_service import ProductRateService

# The first six are about the savings and loans this site compares; the rest let 머니독 and the digest answer about the
# economy around them (prices, exchange rate, housing, stocks, trade, growth).
NEWS_TOPICS = [
    "예금 금리", "적금", "기준금리", "청년미래적금", "금융당국", "가계대출",
    "소비자물가", "환율", "부동산 주택담보대출", "코스피 증시", "수출 무역수지", "경제성장률",
]
INTERPRET_LIMIT = 10


@dataclass
class JobResult:
    job: str
    attempted: int = 0  # sources or series tried
    collected: int = 0  # items received
    saved: int = 0  # new or changed rows
    failures: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    @property
    def status(self) -> str:
        if self.attempted and len(self.failures) >= self.attempted:
            return "failed"
        return "partial" if self.failures else "success"

    def fail(self, stage: str, error: Exception | str) -> None:
        self.failures.append(f"{stage}: {error}")


def run_news_job(settings: Settings, session: Session) -> JobResult:
    result = JobResult("news")
    service = NewsHeadlineService(session)
    # The Naver snippet only lives in memory for today's digest; it is never stored.
    snippets: dict[str, str] = {}
    for topic in NEWS_TOPICS:
        result.attempted += 1
        try:
            headlines = fetch_headlines(settings, topic)
        except NaverNewsError as error:
            result.fail(f"네이버:{topic}", error)
            continue
        snippets.update({headline.url: headline.snippet for headline in headlines if headline.snippet})
        result.collected += len(headlines)
        result.saved += service.save("naver", "domestic", topic, headlines)
    for feed in OFFICIAL_FEEDS:
        result.attempted += 1
        try:
            headlines = fetch_feed(feed)
        except OfficialRssError as error:
            result.fail(feed.code, error)
            continue
        result.collected += len(headlines)
        result.saved += service.save(feed.code, "international", feed.publisher, headlines)
    for feed in LINK_ONLY_FEEDS:
        result.attempted += 1
        try:
            headlines = fetch_feed(feed)
        except OfficialRssError as error:
            result.fail(feed.code, error)
            continue
        result.collected += len(headlines)
        result.saved += service.save(feed.code, "domestic", feed.publisher, headlines)

    if not settings.openai_api_key:
        result.attempted += 1
        result.fail("경제 뉴스 요약", "VERY_RICH_OPENAI_API_KEY가 없어 해외 해석과 요약을 만들지 않았습니다.")
    else:
        interpreted = 0
        for headline in service.pending_interpretation("international", INTERPRET_LIMIT):
            try:
                interpretation = interpret(settings, headline.title, headline.publisher, fetch_paragraphs(headline.url))
            except (PressTextError, InterpretationError):
                continue  # one release that fails validation is skipped, not a broken run
            service.store_interpretation(headline, interpretation.title_ko, interpretation.summary_ko, interpretation.model)
            interpreted += 1
        result.notes.append(f"해외 해석 {interpreted}건")
        result.attempted += 1
        try:
            digest = write_digest(settings, build_sources(session, snippets))
            save_digest(session, digest, korea_today())
            result.notes.append(f"경제 뉴스 요약 {len(digest.points)}개 항목, 내 돈과의 관계 {len(digest.money_notes)}개")
        except (DigestError, OpenAIError) as error:
            result.fail("경제 뉴스 요약", error)
    result.notes.append(f"만료 헤드라인 {service.purge_expired()}건 삭제")
    refresh_knowledge(settings, session, result)
    return result


def refresh_knowledge(settings: Settings, session: Session, result: JobResult) -> None:
    if not settings.openai_api_key:
        result.notes.append("도우미 자료: OpenAI 키가 없어 갱신하지 않음")
        return
    result.attempted += 1
    try:
        synced = sync_knowledge(session, lambda texts: embed_texts(settings, texts))
    except (OpenAIError, SQLAlchemyError, ValueError) as error:
        session.rollback()
        result.fail("도우미 자료", error)
        return
    result.notes.append(f"도우미 자료 {synced.total}개(새로 임베딩 {synced.embedded}, 삭제 {synced.removed})")


FetchSeries = Callable[..., list]


def run_market_job(settings: Settings, session: Session, fetch: FetchSeries = fetch_series) -> JobResult:
    result = JobResult("market")
    if not settings.ecos_api_key:
        result.attempted = 1
        result.fail("ECOS", "VERY_RICH_ECOS_API_KEY가 설정되지 않았습니다.")
        return result
    today = datetime.now(ZoneInfo("Asia/Seoul")).date()
    service = MarketService(session)
    for series in SERIES:
        result.attempted += 1
        try:
            points = fetch(settings.ecos_api_key, series, today)
        except EcosError as error:
            result.fail(f"ECOS:{series.code}", error)
            continue
        result.collected += len(points)
        result.saved += service.save(series.code, points)
    collect_product_rates(settings, session, result, today)
    collect_loans(settings, session, result, today)
    collect_youth_policies(settings, session, result, today)
    collect_dart(settings, session, result, today)
    refresh_knowledge(settings, session, result)
    return result


FILING_DAYS = 7


def collect_dart(settings: Settings, session: Session, result: JobResult, today, fetch_accounts=fetch_main_accounts, fetch_list=fetch_filings) -> None:
    """Compared banks' latest business-report accounts and the last week's bank/holding filings, from OpenDART."""
    if not settings.dart_api_key:
        result.notes.append("DART: VERY_RICH_DART_API_KEY가 없어 건너뜀")
        return
    service = DartService(session)
    stored = 0
    for bank_code, (corp_code, corp_name) in BANK_CORPS.items():
        result.attempted += 1
        try:
            accounts = fetch_accounts(settings.dart_api_key, corp_code, today.year - 1)
        except DartError as error:
            result.fail(f"DART:{corp_name}", error)
            continue
        if accounts is not None:
            service.save_financials(bank_code, accounts)
            stored += 1
    filings = []
    for corp_code, corp_name in FILING_CORPS.items():
        result.attempted += 1
        try:
            filings += fetch_list(settings.dart_api_key, corp_code, today - timedelta(days=FILING_DAYS - 1), today)
        except DartError as error:
            result.fail(f"DART 공시:{corp_name}", error)
    added = service.save_filings(filings, today)
    result.collected += stored + len(filings)
    result.notes.append(f"DART 재무 {stored}개 은행, 공시 {len(filings)}건(새로 {added}건)")


FetchProducts = Callable[[str, str, str], list[ProductRate]]


def collect_product_rates(
    settings: Settings, session: Session, result: JobResult, today, fetch: FetchProducts = fetch_products,
) -> None:
    """금감원 deposit and savings rates for banks and savings banks; skipped quietly until a key is set."""
    if not settings.finlife_api_key:
        result.notes.append("금감원 공시 금리: VERY_RICH_FINLIFE_API_KEY가 없어 건너뜀")
        return
    rates: list[ProductRate] = []
    for kind in ("deposit", "saving"):
        for group in FINLIFE_GROUPS:
            result.attempted += 1
            try:
                found = fetch(settings.finlife_api_key, kind, group)
            except FinlifeError as error:
                result.fail(f"금감원:{kind}:{group}", error)
                continue
            result.collected += len(found)
            rates += found
    if rates:
        stored = ProductRateService(session).save_snapshot(today, rates)
        result.notes.append(f"금감원 공시 금리 {stored}개 상품·기간 저장")


FetchLoans = Callable[[str, str], list[LoanRate]]


def collect_loans(settings: Settings, session: Session, result: JobResult, today, fetch: FetchLoans = fetch_loans) -> None:
    """금감원 rent deposit loan rates for banks and savings banks; skipped quietly until a key is set."""
    if not settings.finlife_api_key:
        return
    loans: list[LoanRate] = []
    for group in FINLIFE_GROUPS:
        result.attempted += 1
        try:
            found = fetch(settings.finlife_api_key, group)
        except FinlifeError as error:
            result.fail(f"금감원:rent_loan:{group}", error)
            continue
        result.collected += len(found)
        loans += found
    # A failed group would otherwise wipe its products from the stored list, so only a full set replaces it.
    if loans and not any(line.startswith("금감원:rent_loan") for line in result.failures):
        result.notes.append(f"금감원 전세자금대출 {save_loans(session, today, loans)}개 상품 저장")


FetchYouth = Callable[[str], list[YouthPolicy]]


def collect_youth_policies(settings: Settings, session: Session, result: JobResult, today, fetch: FetchYouth = fetch_youth_policies) -> None:
    """온통청년 policies; skipped quietly until a key is set. A partial list never replaces the stored one."""
    if not settings.youth_api_key:
        return
    result.attempted += 1
    try:
        policies = fetch(settings.youth_api_key)
    except YouthPolicyError as error:
        result.fail("온통청년", error)
        return
    result.collected += len(policies)
    result.notes.append(f"온통청년 청년정책 {save_youth_policies(session, today, policies)}건 저장")


JOBS: dict[str, Callable[[Settings, Session], JobResult]] = {"news": run_news_job, "market": run_market_job}
EXIT_CODES = {"success": 0, "partial": 2, "failed": 1}


def print_result(result: JobResult) -> int:
    print(f"[{result.job}] {result.status}: 시도 {result.attempted}, 받음 {result.collected}, 저장·변경 {result.saved}")
    for line in result.notes:
        print(f"  - {line}")
    for line in result.failures:
        print(f"  ! {line}")
    return EXIT_CODES[result.status]
