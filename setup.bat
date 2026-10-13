
@echo off
setlocal
cd /d "%~dp0"

if not exist ".claude\agents" mkdir ".claude\agents"

(
echo ---
echo name: explorer
echo description: Investigates code and architecture without modifying files.
echo tools: Read, Grep, Glob
echo ---
echo.
echo Investigate the codebase and trace relevant execution paths.
echo Report findings, file paths, risks, and recommended next steps.
echo Never modify files.
) > ".claude\agents\explorer.md"

(
echo ---
echo name: reviewer
echo description: Reviews code changes for bugs and regressions.
echo tools: Read, Grep, Glob
echo ---
echo.
echo Review the Git diff and surrounding code.
echo Report actionable issues with severity and file paths.
echo Never modify files.
) > ".claude\agents\reviewer.md"

(
echo ---
echo name: test-analyst
echo description: Analyzes test coverage and diagnoses test failures.
echo tools: Read, Grep, Glob, Bash
echo ---
echo.
echo Identify relevant tests and recommend verification steps.
echo Analyze failures using evidence.
echo Never modify files.
) > ".claude\agents\test-analyst.md"

echo Subagents created in .claude\agents
pause