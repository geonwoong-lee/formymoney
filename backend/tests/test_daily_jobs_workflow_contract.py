"""Contract checks for the n8n daily jobs workflow (the JSON that is imported into n8n)."""

import json
from pathlib import Path

WORKFLOW = Path(__file__).resolve().parents[2] / "automation" / "n8n" / "workflows" / "daily-market-news-jobs.json"


def _workflow() -> dict:
    return json.loads(WORKFLOW.read_text(encoding="utf-8"))


def _node(workflow: dict, name: str) -> dict:
    return next(node for node in workflow["nodes"] if node["name"] == name)


def test_jobs_run_market_then_news_daily_without_automatic_retry() -> None:
    workflow = _workflow()
    schedule = _node(workflow, "매일 오전 7시 30분 KST")
    assert schedule["parameters"]["rule"]["interval"][0]["expression"] == "30 7 * * *"
    assert workflow["settings"]["timezone"] == "Asia/Seoul"
    connections = workflow["connections"]
    assert connections["매일 오전 7시 30분 KST"]["main"][0][0]["node"] == "시장 지표 수집"
    assert connections["시장 지표 수집"]["main"][0][0]["node"] == "뉴스 수집·요약"
    assert connections["뉴스 수집·요약"]["main"][0][0]["node"] == "실패한 작업이 있나"
    for name, job in (("시장 지표 수집", "market"), ("뉴스 수집·요약", "news")):
        node = _node(workflow, name)
        assert node["parameters"]["url"].endswith(f"/api/v1/internal/daily/jobs/{job}")
        assert node["parameters"]["headerParameters"]["parameters"][0]["name"] == "X-Very-Rich-Ingest-Secret"
        assert "$execution.id" in node["parameters"]["body"]
        assert not node.get("retryOnFail")
        assert node["onError"] == "continueRegularOutput"


def test_request_failure_failed_status_or_missing_run_record_stops_with_error() -> None:
    workflow = _workflow()
    condition = _node(workflow, "실패한 작업이 있나")["parameters"]["conditions"]["conditions"][0]["leftValue"]
    for check in ("body.error !== undefined", "!body.status", "body.status === 'failed'", "body.runRecorded !== true"):
        assert check in condition
    true_branch, false_branch = workflow["connections"]["실패한 작업이 있나"]["main"]
    assert true_branch[0]["node"] == "실행 실패로 표시"
    assert _node(workflow, "실행 실패로 표시")["type"] == "n8n-nodes-base.stopAndError"
    assert "실행 기록 저장 실패" in _node(workflow, "실행 실패로 표시")["parameters"]["errorMessage"]
    assert false_branch[0]["node"] == "완료"


def test_workflow_has_no_secrets_or_openai_credentials() -> None:
    text = WORKFLOW.read_text(encoding="utf-8")
    assert "$env.VERY_RICH_N8N_INGEST_SECRET" in text
    assert "credentials" not in text and "sk-" not in text
