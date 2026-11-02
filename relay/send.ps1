# 사람이 직접 에이전트에게 작업을 넣을 때 쓴다.
# 예: powershell -ExecutionPolicy Bypass -File relay\send.ps1 claude "backend 테스트 실패 원인 찾아서 고쳐줘"
param(
  [Parameter(Mandatory)][ValidateSet('claude', 'codex')][string]$To,
  [Parameter(Mandatory)][string]$Task
)

$inbox = Join-Path $PSScriptRoot "inbox\$To"
New-Item -ItemType Directory -Force $inbox | Out-Null
$file = Join-Path $inbox "$(Get-Date -Format 'yyyyMMdd-HHmmss')-user.md"
$body = "hop: 1`r`nfrom: user`r`n---`r`n$Task`r`n"
[IO.File]::WriteAllText($file, $body, (New-Object System.Text.UTF8Encoding $false))
Write-Host "보냄 -> $file"
