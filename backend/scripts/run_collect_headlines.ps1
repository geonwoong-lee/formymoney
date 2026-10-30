# 하루 한 번 뉴스 헤드라인을 수집하고 해외 헤드라인을 한국어로 해석합니다.
# 등록 예(매일 오전 7시, 한 번만 실행):
#   schtasks /Create /SC DAILY /ST 07:00 /TN "VeryRichHeadlines" /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\aicam\Desktop\formymoney\backend\scripts\run_collect_headlines.ps1"
# PC가 꺼져 있으면 실행되지 않습니다. 로그는 backend\logs\headlines.log에 남습니다(키 값은 출력하지 않음).
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = "utf-8"
$backend = Split-Path -Parent $PSScriptRoot
$python = Join-Path (Split-Path -Parent $backend) ".venv\Scripts\python.exe"
$logDir = Join-Path $backend "logs"
New-Item -ItemType Directory -Force $logDir | Out-Null
Set-Location $backend
"=== $(Get-Date -Format s) ===" | Out-File -Append -Encoding utf8 (Join-Path $logDir "headlines.log")
& $python -X utf8 -m scripts.collect_news_headlines 2>&1 | Out-File -Append -Encoding utf8 (Join-Path $logDir "headlines.log")
exit $LASTEXITCODE
