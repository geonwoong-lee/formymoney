@echo off
rem Open one Windows Terminal window split into claude / codex / relay panes.
chcp 65001 >nul
set "ROOT=%~dp0.."
wt -d "%ROOT%" --title claude cmd /k claude ; sp -V -d "%ROOT%" --title codex cmd /k codex ; sp -H -d "%ROOT%" --title relay powershell -NoExit -ExecutionPolicy Bypass -File "%ROOT%\relay\relay.ps1"
