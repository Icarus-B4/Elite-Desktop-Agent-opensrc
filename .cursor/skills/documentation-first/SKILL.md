---
name: documentation-first
description: Enforces a documentation-first implementation workflow for the Elite Desktop Agent. Use when implementing features, fixing bugs, reviewing code, diagnosing Python issues, changing Android apps, or when a task must update project memory after completion.
---

# Documentation First

## Purpose

Use this skill before changing code in this repository. The goal is to prevent wrong-version integrations, catch bugs and security issues early, and keep project memory usable across future chats.

## Workflow

1. Read project context first:
   - `README.md`
   - `GEMINI.md`
   - `AGENTS.md`
   - relevant `.agent/skills/*/SKILL.md`
   - relevant `package.json`, `requirements.txt`, lockfiles, and local docs

2. Check version constraints:
   - Prefer documentation for the versions already used by the project.
   - Do not blindly apply newest-framework patterns when `package.json`, `requirements.txt`, or existing code is pinned to older APIs.
   - If a library version is unclear, inspect local code and package metadata before editing.

3. Implement conservatively:
   - Follow existing project patterns.
   - Keep changes scoped to the task.
   - Do not delete uncertain files; archive clear cleanup candidates in `Abadoned/`.

4. Review changes before finalizing:
   - Check for correctness bugs and edge cases.
   - Check for security issues, especially secrets, unsafe file access, shell execution, auth, and data exposure.
   - Check quality problems such as unnecessary coupling, missing error handling, or fragile version assumptions.

5. Python diagnosis:
   - For Python problems, inspect tracebacks and run targeted syntax/compile checks when useful.
   - For hardware/device workflows, use the three phases: compile, upload, monitor.
   - Apply corrections after observing the actual failure mode.

6. Android work:
   - When creating or changing Android apps, use `@android-e2e-testing`.
   - Verify UI and behavior through an emulator or suitable end-to-end path.

7. Memory update:
   - At the end of every completed task, append a chronological entry to `.agent/CONVERSATION_MEMORY.md`.
   - Never overwrite the memory file.
   - If the user asks to summarize the chat and update memory, append the new summary at the end.

## Output Expectations

When finishing a task, report:

- What changed.
- Which checks ran and whether they passed.
- What was appended to memory.
- Any uncertainty or files intentionally left untouched.
