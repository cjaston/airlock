# Security Policy

Airlock is a local safety gate for developer machines and AI coding agents. It
does not run a backend service and does not collect telemetry.

## Supported Versions

Security fixes are released on the latest npm version.

## Reporting a Vulnerability

Please open a GitHub security advisory or email the maintainer directly if a
private disclosure path is available on the GitHub profile.

Useful reports include:

- A command Airlock allowed but should have blocked or warned on
- A package name Airlock misclassified
- A bypass in the Claude Code hook, MCP server, or shell shims
- A case where Airlock executes the wrong real package manager binary

Please include:

- OS and shell
- Node version
- Airlock version
- Exact command
- Expected vs actual verdict

## Design Notes

- Airlock should fail closed only for high-confidence blocks.
- Registry/network lookup errors are warnings, not blocks, to avoid breaking
  legitimate work during transient outages.
- Local `.airlock.json` policy can allow private packages and block known-bad
  names.
- Cache lives in `~/.airlock/cache` and can be cleared with
  `airlock cache clear`.
