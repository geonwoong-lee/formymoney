# relay/inbox/<에이전트>/ 에 작업 파일이 생기면 해당 에이전트를 비대화형으로 실행한다.
# 실행: powershell -ExecutionPolicy Bypass -File relay\relay.ps1
param(
  [int]$MaxHops = 6,
  [int]$PollSeconds = 3
)

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# 한글 지시가 깨지지 않게 네이티브 CLI와 주고받는 인코딩을 UTF-8로 맞춘다.
$utf8 = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

$agentsDir = Join-Path $root 'relay'
$board = Join-Path $agentsDir 'board.md'
$agents = 'claude', 'codex'
foreach ($d in @('done', 'blocked', 'logs') + ($agents | ForEach-Object { "inbox\$_" })) {
  New-Item -ItemType Directory -Force (Join-Path $agentsDir $d) | Out-Null
}
if (-not (Test-Path $board)) { Set-Content $board "# 작업 보드`r`n" -Encoding UTF8 }

# 지시 본문은 stdin으로 넘긴다. 긴 여러 줄 지시를 명령줄 인자로 넘기면 따옴표가 깨진다.
function Invoke-Agent($agent, $prompt) {
  switch ($agent) {
    'claude' { $prompt | claude -p '표준입력으로 받은 작업을 수행하라.' --permission-mode acceptEdits }
    'codex'  { $prompt | codex exec --sandbox workspace-write - }
  }
}

function Add-Board($line) {
  Add-Content $board "- [$(Get-Date -Format 'MM-dd HH:mm')] $line" -Encoding UTF8
}

Write-Host "relay 시작: $root (최대 hop $MaxHops, Ctrl+C로 종료)" -ForegroundColor Cyan

while ($true) {
  $next = $agents |
    ForEach-Object { Get-ChildItem (Join-Path $agentsDir "inbox\$_") -Filter *.md } |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddSeconds(-2) } |  # 아직 쓰는 중인 파일은 건너뜀
    Sort-Object LastWriteTime |
    Select-Object -First 1

  if (-not $next) { Start-Sleep $PollSeconds; continue }

  $agent = $next.Directory.Name
  $text = Get-Content $next.FullName -Raw -Encoding UTF8
  $hop = if ($text -match '(?m)^hop:\s*(\d+)') { [int]$Matches[1] } else { 1 }
  $from = if ($text -match '(?m)^from:\s*(\S+)') { $Matches[1] } else { 'user' }
  $name = "$agent-$($next.Name)"

  if ($hop -gt $MaxHops) {
    Move-Item $next.FullName (Join-Path $agentsDir "blocked\$name") -Force
    Add-Board "relay: hop $hop 초과로 $agent 작업 중단 -> relay/blocked/$name 확인 필요"
    Write-Host "[$agent] hop $hop 초과, blocked로 이동: $name" -ForegroundColor Red
    continue
  }

  Move-Item $next.FullName (Join-Path $agentsDir "done\$name") -Force
  Write-Host "[$agent] 작업 시작 (from $from, hop $hop): $($next.Name)" -ForegroundColor Yellow

  $prompt = @"
너는 이 저장소의 '$agent' 에이전트다. AGENTS.md의 작업 규칙과 멀티에이전트 협업 규칙을 따른다.
아래는 '$from'이(가) 보낸 작업이다 (hop $hop).
다른 에이전트에게 넘길 일이 있으면 hop을 $($hop + 1)로 적어 relay/inbox/<에이전트>/ 에 파일을 만든다.
작업을 마치면 relay/board.md 에 한 줄로 기록한다.

$text
"@

  $log = Join-Path $agentsDir "logs\$agent.log"
  Add-Content $log "`r`n===== $(Get-Date -Format s) $($next.Name) =====" -Encoding UTF8
  try {
    # Tee-Object는 PowerShell 5.1에서 UTF-16으로 써서 로그가 깨지므로 직접 UTF-8로 남긴다.
    Invoke-Agent $agent $prompt 2>&1 | ForEach-Object { $line = "$_"; Write-Host $line; Add-Content $log $line -Encoding UTF8 }
    Write-Host "[$agent] 완료: $($next.Name)" -ForegroundColor Green
  } catch {
    Add-Board "relay: $agent 실행 실패 ($($next.Name)): $($_.Exception.Message)"
    Write-Host "[$agent] 실패: $($_.Exception.Message)" -ForegroundColor Red
  }
}
