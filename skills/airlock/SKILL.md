---
name: airlock
description: Use Airlock before installing or executing packages, running risky shell commands, committing generated code, or declaring an agent task complete. Airlock detects hallucinated/slopsquatted dependencies, destructive commands, leaked secrets, and suspicious test changes.
---

# Airlock — verify before you act

You (the agent) should use Airlock as a local safety gate. AI coding agents can
hallucinate package names, install packages through executors like `npx`, leak
secrets into config/test files, or weaken tests to make a task pass.

## Required uses

- **Before package installs or package execution**:
  `npm install`, `npx`, `npm exec`, `pnpm dlx`, `yarn dlx`, `bunx`,
  `pip install`, `uvx`, `pipx run`, `cargo add`, `cargo install`,
  `gem install`, `bundle add`, `go get`, `go install`.
- **Before destructive commands**:
  `rm -rf`, `git push --force`, `git reset --hard`, `git clean -f`,
  `DROP TABLE`, `dd`, `mkfs`, `curl ... | sh`.
- **Before finishing a coding task**:
  run the full audit so dependency manifests, secrets, and test changes are
  checked before you tell the user the work is done.

## MCP tools

Prefer MCP tools when available:

- `vet_package({ name, ecosystem, cwd? })`
  Verify a single package. Ecosystems: `npm`, `pypi`, `cargo`, `rubygems`, `go`.
- `vet_command({ command, cwd? })`
  Vet an exact shell command before running it.
- `scan_project({ cwd? })`
  Scan dependency manifests: `package.json`, `requirements.txt`,
  `pyproject.toml`, `Cargo.toml`, `Gemfile`, `go.mod`.
- `scan_secrets({ cwd? })`
  Scan for high-confidence leaked GitHub/OpenAI/Anthropic/AWS/Slack tokens and
  private keys.
- `scan_diff({ cwd?, staged? })`
  Scan git diff for removed assertions, skipped/focused tests, and deleted test
  files.
- `audit_project({ cwd?, staged? })`
  Run the full local audit. Use this before finishing or committing.

## CLI fallback

If MCP is unavailable:

```bash
airlock vet-command "<the exact command you are about to run>"
airlock audit .
airlock audit . --staged
```

## How to act on results

- **BLOCK**: do not run or commit. Explain what was blocked and ask the user or
  fix the issue.
- **WARN**: surface the warning and get confirmation before proceeding.
- **ALLOW**: proceed normally.

Never guess a suspicious dependency name. Confirm the intended package or module
with the user.
