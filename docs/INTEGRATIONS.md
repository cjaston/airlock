# Airlock Integrations

Airlock is intentionally wrapper-agnostic. Use the strongest layer your agent
supports, and use the shell guard when you want process-level protection across
everything.

## Recommended Setup

```bash
npx airlock-cli init all
npx airlock-cli guard install
npx airlock-cli init git
npx airlock-cli doctor
```

Then add the shim directory to the front of your shell PATH:

```bash
export PATH="$HOME/.airlock/shims:$PATH"
```

## Claude Code

```bash
npx airlock-cli init claude-code
```

This writes:

- `.mcp.json` with the Airlock MCP server
- `.claude/settings.json` with a `PreToolUse` hook for Bash

The hook path is the strongest integration. Clean commands produce no output;
warnings ask for confirmation; blocks return `permissionDecision: "deny"`.

## Codex

```bash
npx airlock-cli init codex
```

This appends an Airlock server to `~/.codex/config.toml`:

```toml
[mcp_servers.airlock]
command = "..."
args = ["...", "mcp"]
```

Restart Codex after editing MCP configuration.

## Gemini CLI

```bash
npx airlock-cli init gemini
```

This writes `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "airlock": {
      "command": "...",
      "args": ["...", "mcp"]
    }
  }
}
```

Restart Gemini CLI after editing MCP configuration.

## Cursor

```bash
npx airlock-cli init cursor
```

This writes `.cursor/mcp.json` in the current project:

```json
{
  "mcpServers": {
    "airlock": {
      "command": "...",
      "args": ["...", "mcp"]
    }
  }
}
```

Open Cursor's MCP settings to verify that the server is connected.

## Git Pre-Commit Hook

```bash
npx airlock-cli init git
```

This appends an Airlock block to `.git/hooks/pre-commit`:

- `airlock secrets .`
- `airlock diff . --staged`

It blocks high-confidence secrets and suspicious staged test changes before a
commit is created.

## Shell Guard

```bash
npx airlock-cli guard install
export PATH="$HOME/.airlock/shims:$PATH"
```

The shell guard works with every agent because it intercepts package tools at
the process layer:

```text
npm, npx, pnpm, yarn, bun, bunx, pip, pip3, pipx, uv, uvx, poetry, cargo, gem, bundle, bundler, go
```

Use this when an agent does not support MCP, or when you want defense in depth.

## Agent Completion Check

For agents with MCP, the most important end-of-task tool is:

```text
audit_project({ cwd, staged })
```

It runs dependency manifest checks, secret scanning, and suspicious test-change
detection in one pass. Agents should call it before saying a task is complete
or before asking to commit.

## Stable Invocation

If `init` runs from a source checkout or global install, Airlock writes configs
that point to that exact local binary. If `init` runs from an ephemeral `npx`
cache, Airlock writes stable `npx -y airlock-cli@<version>` invocations so agent
configs do not break when npm deletes the temp cache.
