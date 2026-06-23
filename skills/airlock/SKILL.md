---
name: airlock
description: Vet packages and shell commands for hallucinated/typosquatted dependencies and destructive operations BEFORE running them. Use before any npm/pip/yarn/pnpm/uv install or any risky shell command.
---

# Airlock — verify before you install or run

You (the agent) must not install a package or run a destructive command without
checking it first. AI models hallucinate package names that attackers register
(slopsquatting), and can be nudged into irreversible commands.

## When to use

- **Before any package install** — `npm install`, `pip install`, `yarn add`,
  `pnpm add`, `uv pip install`, `poetry add`, etc.
- **Before any command that deletes files, rewrites VCS history, or touches a
  database/disk** — `rm -rf`, `git push --force`, `git reset --hard`,
  `DROP TABLE`, `dd`, `mkfs`, `curl … | sh`.

## How to use

If the Airlock MCP server is available, call its tools:

- `vet_package({ name, ecosystem })` — verify a single package (`ecosystem`:
  `npm` or `pypi`).
- `vet_command({ command })` — vet a full shell command (installs + destructive
  ops) in one call.

Otherwise, run the CLI and read the exit code (0 = ok/warn, 1 = BLOCKED):

```bash
airlock check <package> [-e npm|pypi]
airlock vet-command "<the exact command you are about to run>"
```

## How to act on the result

- **BLOCK** → do **not** run it. Stop and tell the user what was flagged and why
  (e.g. the package doesn't exist, or looks like a typosquat of a popular one).
  Suggest the correct package name if there's an obvious intended target.
- **WARN** → surface the warning to the user and get confirmation before
  proceeding.
- **ALLOW** → proceed normally.

Always prefer confirming a suspicious name with the user over guessing.
