import json
from pathlib import Path


WORKFLOW_PATH = Path(__file__).resolve().parents[2] / "automation" / "n8n" / "workflows" / "daily-official-candidates.json"


def _workflow() -> dict[str, object]:
    return json.loads(WORKFLOW_PATH.read_text(encoding="utf-8"))


def test_workflow_uses_responses_structured_outputs_and_one_validation_retry() -> None:
    workflow = _workflow()
    serialized = json.dumps(workflow, ensure_ascii=False)
    node_names = {node["name"] for node in workflow["nodes"]}

    assert "https://api.openai.com/v1/responses" in serialized
    assert "type:'json_schema'" in serialized
    assert "strict:true" in serialized
    assert "additionalProperties:false" in serialized
    assert "OpenAI Structured Output" in node_names
    assert "OpenAI 한 번 재시도" in node_names
    assert "FastAPI 검증·저장" in node_names
    assert "FastAPI 최종 검증·저장" in node_names
    openai_nodes = [
        node
        for node in workflow["nodes"]
        if node["type"] == "n8n-nodes-base.httpRequest" and node["parameters"].get("url") == "https://api.openai.com/v1/responses"
    ]
    assert all(node["parameters"]["options"]["batching"]["batch"]["batchSize"] == 1 for node in openai_nodes)


def test_workflow_has_no_secret_or_personal_finance_values() -> None:
    workflow = _workflow()
    serialized = json.dumps(workflow, ensure_ascii=False)

    assert "OPENAI_API_KEY" not in serialized
    assert '"credentials"' not in serialized
    assert "@" not in serialized
    assert "member_id" not in serialized
    assert "monthly_deposit" not in serialized
    assert "account_number" not in serialized


def test_workflow_limits_daily_candidates_and_records_prompt_version() -> None:
    serialized = json.dumps(_workflow(), ensure_ascii=False)

    assert "slice(0, 3)" in serialized
    assert "max_output_tokens:900" in serialized
    assert "promptVersion:'1.0'" in serialized
    assert "gpt-6-luna" in serialized
