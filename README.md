# Airlock

**A firewall between AI coding agents and dangerous actions.**

Airlock blocks hallucinated/slopsquatted package installs, `npx` package
execution, and destructive shell commands before they run. It works as a CLI,
an MCP server, a Claude Code `PreToolUse` hook, and universal PATH shims for
any agent or human using your shell.

```bash
npx airlock-cli demo
```

```console
Airlock demo: AI agent wants to run this:

 BLOCK  npx fast-csv-helper init && rm -rf ~
  x Recursive force-delete targeting a root/home path (rm -rf on / ~ or $HOME).
  x [fast-csv-helper] Package "fast-csv-helper" does not exist on npm.

Stopped before anything executed.
```

AI coding assistants can hallucinate plausible package names. Security
researchers call the attack pattern **slopsquatting**: attackers register names
that models tend to invent, then wait for developers or agents to install them.
See research from [Cloud Security Alliance](https://labs.cloudsecurityalliance.org/research/csa-research-note-slopsquatting-ai-supply-chain-20260419-csa/),
[Trend AI Security](https://www.trendaisecurity.com/en-us/resources-insights/research/slopsquatting-when-ai-agents-hallucinate-malicious-packages),
and [Socket](https://socket.dev/blog/slopsquatting-how-ai-hallucinations-are-fueling-a-new-class-of-supply-chain-attacks).

Airlock is the seatbelt: let the agent move fast, but force the scary stuff
through a deterministic check first.

## Quick Start

```bash
# one-off package checks
npx airlock-cli check express
npx airlock-cli check requests -e pypi

# vet a whole command before an agent runs it
npx airlock-cli vet-command "npx fast-csv-helper init && rm -rf ~"
```

Exit codes:

- `0`: allowed or warning only
- `1`: blocked
- `2`: usage error

## Wire It Into Your Agent

```bash
npx airlock-cli init claude-code   # MCP + native PreToolUse hook
npx airlock-cli init codex         # MCP in ~/.codex/config.toml
npx airlock-cli init gemini        # MCP in ~/.gemini/settings.json
npx airlock-cli init cursor        # MCP in .cursor/mcp.json
npx airlock-cli init shell         # universal PATH shims
npx airlock-cli init all
```

| Surface | Integration | What it protects |
|---|---|---|
| Claude Code | MCP + `PreToolUse` hook | Blocks dangerous Bash tool calls before execution |
| Codex | MCP server | Gives Codex `vet_package` and `vet_command` tools |
| Gemini CLI | MCP server | Gives Gemini `vet_package` and `vet_command` tools |
| Cursor | MCP server | Gives Cursor `vet_package` and `vet_command` tools |
| Any shell / any agent | PATH shims | Intercepts package managers at the process level |

Claude Code hooks can return `permissionDecision: "deny"` for `PreToolUse`
events, so Airlock can block a Bash command without relying on the model to
remember a rule. Claude Code, Codex, Gemini CLI, and Cursor all support MCP
server configuration; Airlock writes those config files for you.

## Universal Shell Guard

For the wrapper-agnostic layer:

```bash
npx airlock-cli guard install
export PATH="$HOME/.airlock/shims:$PATH"
```

This installs shims for:

```text
npm, npx, pnpm, yarn, bun, bunx, pip, pip3, pipx, uv, uvx, poetry
```

Now these are vetted whether they are run by you, Claude Code, Codex, Gemini,
Cursor, OpenCode, Roo, Cline, a random shell script, or anything else:

```bash
npm install express
npx create-next-app@latest app
pnpm dlx shadcn@latest init
uvx ruff check
pipx run black .
```

Remove shims:

```bash
npx airlock-cli guard uninstall
```

## What Airlock Checks

Dependency and package-execution guard:

- **Package existence**: nonexistent npm/PyPI package -> block
- **Typosquat**: `expresss` -> `express`
- **Mashup/slopsquat**: `lodash-utils`, `requests-helper`
- **New + low adoption**: recently published packages with weak adoption -> warn/block
- **Provenance**: missing source repository or deprecated packages -> warn
- **Package executors**: `npx`, `npm exec`, `pnpm dlx`, `yarn dlx`, `bunx`,
  `uvx`, `pipx run`
- **Scaffold aliases**: `npm create vite` maps to the actual `create-vite`
  package before vetting

Destructive-command guard:

- `rm -rf /`, `rm -rf ~`, `rm --no-preserve-root` -> block
- fork bombs, `dd`/`mkfs` to devices, redirects to raw block devices -> block
- `git push --force`, `git reset --hard`, `git clean -f` -> warn
- `DROP TABLE`, `TRUNCATE TABLE`, `curl ... | sh` -> warn
- package execution from URL/Git specs -> warn

In Claude Code:

- **BLOCK** -> `deny`
- **WARN** -> `ask`
- **ALLOW** -> silent

## Project Policy

Private packages and team decisions belong in policy, not in CLI flags:

```bash
npx airlock-cli policy init
```

Creates `.airlock.json`:

```json
{
  "allow": {
    "npm": ["@your-org/*"],
    "pypi": ["your-private-package"]
  },
  "block": {
    "npm": ["known-bad-package"],
    "pypi": ["known-bad-package"]
  }
}
```

Policy files are discovered from the current directory upward, so a repo can
carry its own allow/block rules.

## MCP Tools

Airlock exposes two tools:

- `vet_package({ name, ecosystem, cwd? })`
- `vet_command({ command, cwd? })`

Agents should call `vet_command` before shell commands that install packages,
execute packages, delete files, rewrite git history, touch disks, or touch
databases. If the result is **BLOCK**, do not run the command.

## Privacy

- No backend
- No telemetry
- Package names are looked up directly against public npm/PyPI APIs
- Registry facts are cached locally in `~/.airlock/cache`
- Disable cache for a run with `AIRLOCK_NO_CACHE=1`

```bash
npx airlock-cli cache status
npx airlock-cli cache clear
```

## Build From Source

```bash
git clone https://github.com/cjaston/airlock.git
cd airlock
npm install
npm test
node dist/index.js demo
```

Requires Node 20+.

## Roadmap

- [x] npm + PyPI package existence/age/adoption/provenance checks
- [x] typosquat + mashup/slopsquat heuristics
- [x] `npx`/`dlx`/`uvx`/`pipx` package execution checks
- [x] destructive-command guard
- [x] MCP server (`vet_package`, `vet_command`)
- [x] Claude Code `PreToolUse` hook
- [x] universal PATH shims
- [x] project policy file (`.airlock.json`)
- [ ] more ecosystems: cargo, go, gem, maven, nuget
- [ ] secret-leak guard
- [ ] test-subversion detector
- [ ] signed policy bundles for teams

## License

MIT
