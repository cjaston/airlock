# Airlock

**A firewall between AI coding agents and dangerous actions.**

Airlock blocks hallucinated/slopsquatted package installs, package execution,
leaked secrets, destructive shell commands, and suspicious test changes before
they ship. It works as a CLI, an MCP server, a Claude Code `PreToolUse` hook,
a git pre-commit hook, and universal PATH shims for any agent or human using
your shell.

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

# run the full repo safety pass before saying "done"
npx airlock-cli audit

# see which protection layers are installed
npx airlock-cli doctor
```

Exit codes:

- `0`: no blocking finding for the command
- `1`: blocked package/command, leaked secret, or audit finding
- `2`: usage error

## Wire It Into Your Agent

```bash
npx airlock-cli init claude-code   # MCP + native PreToolUse hook
npx airlock-cli init codex         # MCP in ~/.codex/config.toml
npx airlock-cli init gemini        # MCP in ~/.gemini/settings.json
npx airlock-cli init cursor        # MCP in .cursor/mcp.json
npx airlock-cli init shell         # universal PATH shims
npx airlock-cli init git           # pre-commit secrets + test-change guard
npx airlock-cli init all
```

| Surface | Integration | What it protects |
|---|---|---|
| Claude Code | MCP + `PreToolUse` hook | Blocks dangerous Bash tool calls before execution |
| Codex | MCP server | Gives Codex `vet_package` and `vet_command` tools |
| Gemini CLI | MCP server | Gives Gemini `vet_package` and `vet_command` tools |
| Cursor | MCP server | Gives Cursor `vet_package` and `vet_command` tools |
| Any shell / any agent | PATH shims | Intercepts package managers at the process level |
| Git | pre-commit hook | Blocks leaked secrets and suspicious staged test changes |

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
npm, npx, pnpm, yarn, bun, bunx, pip, pip3, pipx, uv, uvx, poetry, cargo, gem, bundle, bundler, go
```

Now these are vetted whether they are run by you, Claude Code, Codex, Gemini,
Cursor, OpenCode, Roo, Cline, a random shell script, or anything else:

```bash
npm install express
npx create-next-app@latest app
pnpm dlx shadcn@latest init
uvx ruff check
pipx run black .
cargo add serde
gem install rails
go install github.com/gin-gonic/gin@latest
```

Remove shims:

```bash
npx airlock-cli guard uninstall
```

## What Airlock Checks

Dependency and package-execution guard (`npm`, `PyPI`, `crates.io`,
`RubyGems`, Go modules):

- **Package existence**: nonexistent packages/modules -> block
- **Typosquat**: `expresss` -> `express`
- **Mashup/slopsquat**: `lodash-utils`, `requests-helper`
- **New + low adoption**: recently published packages with weak adoption -> warn/block
- **Provenance**: missing source repository or deprecated packages -> warn
- **Package executors**: `npx`, `npm exec`, `pnpm dlx`, `yarn dlx`, `bunx`,
  `uvx`, `pipx run`
- **Scaffold aliases**: `npm create vite` maps to the actual `create-vite`
  package before vetting
- **Manifest scan**: `package.json`, `requirements.txt`, `pyproject.toml`,
  `Cargo.toml`, `Gemfile`, `go.mod`

Destructive-command guard:

- `rm -rf /`, `rm -rf ~`, `rm --no-preserve-root` -> block
- fork bombs, `dd`/`mkfs` to devices, redirects to raw block devices -> block
- `git push --force`, `git reset --hard`, `git clean -f` -> warn
- `DROP TABLE`, `TRUNCATE TABLE`, `curl ... | sh` -> warn
- package execution from URL/Git specs -> warn

Repo-audit guards:

- `airlock secrets` blocks high-confidence GitHub/OpenAI/Anthropic/AWS/Slack
  tokens and private keys
- `airlock diff --staged` warns on suspicious test changes: removed assertions,
  skipped tests, focused-only tests, or deleted test files
- `airlock audit` runs dependency, secret, and test-change checks together

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
    "pypi": ["your-private-package"],
    "cargo": ["your-private-crate"],
    "rubygems": ["your-private-gem"],
    "go": ["github.com/your-org/*"]
  },
  "block": {
    "npm": ["known-bad-package"],
    "pypi": ["known-bad-package"],
    "cargo": ["known-bad-crate"],
    "rubygems": ["known-bad-gem"],
    "go": ["github.com/bad/*"]
  }
}
```

Policy files are discovered from the current directory upward, so a repo can
carry its own allow/block rules.

## MCP Tools

Airlock exposes these MCP tools:

- `vet_package({ name, ecosystem, cwd? })`
- `vet_command({ command, cwd? })`
- `scan_project({ cwd? })`
- `scan_secrets({ cwd? })`
- `scan_diff({ cwd?, staged? })`
- `audit_project({ cwd?, staged? })`

Agents should call `vet_command` before shell commands that install packages,
execute packages, delete files, rewrite git history, touch disks, or touch
databases. Agents should call `audit_project` before finishing or committing
code. If the result is **BLOCK**, do not run the command.

## Privacy

- No backend
- No telemetry
- Package names are looked up directly against public registry APIs
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

## Acknowledgements

Built by Chris Jaston with AI-assisted development from
[OpenAI Codex](https://openai.com/codex/). Airlock is an independent open-source
project and is not an official OpenAI product or endorsement.

## Roadmap

- [x] npm + PyPI + crates.io + RubyGems + Go module checks
- [x] typosquat + mashup/slopsquat heuristics
- [x] `npx`/`dlx`/`uvx`/`pipx` package execution checks
- [x] destructive-command guard
- [x] MCP server (`vet_package`, `vet_command`)
- [x] Claude Code `PreToolUse` hook
- [x] universal PATH shims
- [x] project policy file (`.airlock.json`)
- [x] repo manifest scan
- [x] secret-leak guard
- [x] test-subversion detector
- [x] git pre-commit hook
- [ ] more ecosystems: maven, nuget, composer
- [ ] signed policy bundles for teams

## License

MIT
