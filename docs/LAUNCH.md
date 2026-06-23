# Launch Playbook

Airlock's launch should sell one idea in under ten seconds:

> I asked an AI agent to add a feature. It tried to install a hallucinated
> package. Airlock blocked it before it touched my machine.

The second punchline:

> Before the agent says "done", Airlock audits the repo for suspicious
> dependencies, leaked secrets, and weakened tests.

## Assets

Record these before launch:

1. `npx airlock-cli demo`
2. Claude Code trying `npx fast-csv-helper init` and Airlock returning `deny`
3. Shell shim blocking `/Users/.../.airlock/shims/npx fast-csv-helper init`
4. `npx airlock-cli audit` showing dependencies/secrets/diff in one pass
5. `npx airlock-cli init all` showing Claude/Codex/Gemini/Cursor/Git support

Keep the video short. The red BLOCK should appear in the first 5 seconds.

## Show HN

Title candidates:

- Show HN: Airlock, a firewall for AI coding agents
- Show HN: I built a firewall that stops AI agents installing hallucinated packages
- Show HN: Airlock blocks slopsquatted packages before AI agents install them
- Show HN: Airlock audits AI-agent changes before they run or commit

Post body:

```text
AI coding agents routinely install packages while solving tasks. They also
hallucinate plausible package names, which creates a supply-chain opening known
as slopsquatting.

Airlock sits in the loop: CLI, MCP server, Claude Code hook, git pre-commit
hook, and universal shell shims. It blocks nonexistent npm/PyPI/crates/RubyGems
/Go packages, typosquat/mashup names, npx/dlx package execution, destructive
shell commands, leaked secrets, and suspicious test changes.

The demo command is:

  npx airlock-cli demo
  npx airlock-cli audit

No backend, no telemetry. Package names are checked against public registries
and cached locally. Secret scans never leave your machine.
```

## X / Bluesky Thread

1. "AI agents can run `npx`. That's both powerful and horrifying."
2. Show the block screenshot.
3. Explain slopsquatting in one sentence.
4. Show `airlock audit` catching secrets/test weakening before commit.
5. Show `init claude-code`, `init codex`, `init gemini`, `init cursor`, `init git`.
6. End with `npx airlock-cli demo`.

## Where To Submit

- Hacker News / Show HN
- r/programming
- r/LocalLLaMA
- r/ClaudeCode
- r/cursor
- MCP server directories
- Awesome MCP lists
- Security newsletters that cover npm/PyPI supply-chain attacks

## First 48 Hours

- Respond fast to false-positive reports.
- Add popular package targets as issues come in.
- Keep scope disciplined: do not turn it into a full SCA scanner.
- Point people to `.airlock.json` for private packages.
- Ship a patch release the same day if an install path is missed.
