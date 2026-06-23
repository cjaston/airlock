# 🛟 Airlock

**A firewall between AI coding agents and dangerous actions.**

AI agents now write most of the code — but **96% of developers don't fully trust the output**, and LLMs routinely *hallucinate* package names that attackers pre-register (**slopsquatting**). Airlock sits in the agent's loop and **blocks hallucinated/typosquatted package installs and destructive shell commands before they run** — across Claude Code, Codex, Gemini CLI, Cursor, or any agent at all.

```console
$ airlock check fast-csv-helper
 BLOCK  fast-csv-helper (npm)
  ✗ Package "fast-csv-helper" does not exist on npm. This is the #1 sign
    of a hallucinated dependency — do not install.

$ airlock check expresss
 BLOCK  expresss (npm)
  ✗ "expresss" is one character off from the popular package "express", and is
    newly-published / low-adoption — the classic typosquat attack. Did you mean "express"?
```

It's **wrapper-agnostic**: one engine, exposed as a CLI, an MCP server, native hooks, and universal shell shims — so it protects whatever agent you use.

---

## Why

- **96%** of developers don't fully trust AI-generated code; only ~48% verify it before committing.
- LLMs invent plausible package names; attackers register them. One hallucinated package recently propagated through **237 repos**.
- AI agents are documented "shortcut-seekers" — they'll happily run `rm -rf`, force-push, or `DROP TABLE` when nudged.

Airlock is the seatbelt: let the agent move fast, but never let it install something that doesn't check out — or run something that can't be undone.

---

## Quick start

```bash
# vet a package before installing
npx airlock-cli check left-pad
npx airlock-cli check flask -e pypi

# vet a whole command (installs + destructive ops)
npx airlock-cli vet-command "npm install lodash && rm -rf ~"
```

Exit code is `1` on any **BLOCK**, so it works as a gate in scripts and hooks.

---

## Make your agent use it (wrapper-agnostic)

One command wires Airlock into your agent of choice:

```bash
airlock init claude-code   # MCP server + PreToolUse hook (auto-blocks installs)
airlock init codex         # MCP server (~/.codex/config.toml)
airlock init gemini        # MCP server (~/.gemini/settings.json)
airlock init cursor        # MCP server (.cursor/mcp.json)
airlock init shell         # universal PATH shims for npm/pip/yarn/pnpm/uv/...
airlock init all
```

| Agent / surface | How Airlock plugs in | Effect |
|---|---|---|
| **Claude Code** | `PreToolUse` hook **+** MCP | Auto-blocks dangerous `Bash` installs/commands; no agent cooperation needed |
| **Codex / Gemini / Cursor / Copilot** | MCP server (`vet_package`, `vet_command`) | Agent calls Airlock in its loop before installing |
| **Any agent or human** | Shell shims (PATH interception) | `npm/pip/...install` is vetted no matter who runs it |

### The universal layer: shell shims

```bash
airlock guard install
export PATH="$HOME/.airlock/shims:$PATH"   # add to ~/.zshrc
```

Now every `npm install` / `pip install` — by **you or any agent** — is vetted first, then forwarded to the real tool. Truly agent-agnostic, because it works at the process level.

---

## What it checks

**Dependency guard (npm + PyPI):**
- **Existence** — non-existent package → BLOCK (the #1 hallucination signal)
- **Typosquat** — 1–2 edits from a popular name (`expresss` → `express`)
- **Mashup / slopsquat** — popular name + filler (`lodash-utils`, `requests-helper`)
- **Adoption & age** — newly-registered + low-download packages are flagged
- **Provenance** — missing repo, deprecated, single-maintainer

**Destructive-command guard:**
- `rm -rf /` · `~` · `$HOME` · `--no-preserve-root` → BLOCK
- fork bombs, `dd`/`mkfs` to a device, redirect-to-block-device → BLOCK
- `git push --force`, `git reset --hard`, `git clean -f` → WARN
- `DROP TABLE` / `TRUNCATE`, `curl … | sh` → WARN

In Claude Code: **BLOCK → deny**, **WARN → ask** (you're prompted), clean → silent.

---

## How it works

- **No backend, no telemetry.** Airlock queries the public npm and PyPI registries directly — the same lookups you'd do by hand. Only package *names* leave your machine.
- **Local heuristics** for typosquat/mashup detection against a curated list of high-value targets — no giant data file, low false-positive rate.
- **One engine**, four surfaces: CLI · MCP server · Claude Code hook · shell shims.

---

## Build from source

```bash
git clone <repo> && cd airlock
npm install
npm run build
node dist/index.js check express
npm test   # offline unit tests
```

Requires Node ≥ 20.

---

## Roadmap

- [x] Dependency vetter (npm + PyPI): existence, age, adoption, provenance
- [x] Typosquat + mashup/slopsquat heuristics
- [x] Destructive-command guard
- [x] MCP server (`vet_package`, `vet_command`)
- [x] Claude Code `PreToolUse` hook
- [x] Universal shell shims + `airlock init`
- [ ] Allowlist / project policy file (`.airlockrc`)
- [ ] Test-subversion detector (agent weakened a test to make it pass)
- [ ] Secret-leak guard
- [ ] More ecosystems (cargo, go, gem)

---

## License

MIT
