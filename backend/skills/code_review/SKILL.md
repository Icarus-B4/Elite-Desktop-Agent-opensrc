---
name: code-review
description: Reviews code changes for bugs, security issues, and quality in this Elite Desktop Agent repo. USE WHEN code review, review changes, analyze code for errors, CodeReview, or code-review. Read this SKILL.md via read_file — never spawn run_code_review.py. NOT FOR self-healing patch approval (Elite-Auditor).
---

# code-review (Elite Runtime)

**Canonical PAI skill:** `.claude/skills/CodeReview/SKILL.md`  
**Workflow:** `.claude/skills/CodeReview/Workflows/Review.md`  
**Stack reference:** `.claude/skills/CodeReview/References/EliteStack.md`

## How to run (Elite agent)

1. `read_file` on this file or the canonical paths above.
2. Gather diff: `git diff` or user-specified scope.
3. Read full files before commenting.
4. Verify: `yarn run typecheck` (frontend), `python -m py_compile` (backend) when relevant.
5. Report CRITICAL / IMPORTANT / NITPICK with verdict.

## Do not

- `spawn_agent_worker` with `run_code_review.py`, `elite_dev_runner.py`, or any skill runner — **they do not exist**.

## Severity

- **CRITICAL:** Security, crashes, data loss
- **IMPORTANT:** Logic bugs, wrong ports/APIs, missing error handling
- **NITPICK:** Style inconsistent with repo only

## Elite checks

- Log widget: new `log.type` values need `LogEntry` + `TYPE_CONFIG` in `log-stream-widget.tsx`
- Windows paths, AppData backups for self-healing
- MC API default port **3001**, HUD **3000**
- Skills = Markdown at `<available_skills><location>`, not Python scripts

See canonical workflow file for full step-by-step review.
