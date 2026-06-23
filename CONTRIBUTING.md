# Contributing

Airlock's job is narrow: stop AI coding agents from doing dangerous things
before they happen. Prefer small, well-tested rules over broad scanners.

## Setup

```bash
npm install
npm test
node dist/index.js demo
```

## Good Contributions

- New install/execution patterns agents commonly use
- Low-noise destructive-command rules
- Better parsing for npm/PyPI specs
- More package ecosystems, if they can be verified quickly and locally
- False-positive reductions
- Integration docs for agent wrappers

## Rule Quality Bar

Blocks must be high-confidence. If a command is risky but sometimes legitimate,
make it a warning instead.

Examples:

- `rm -rf /` -> block
- `git push --force` -> warn
- `curl ... | sh` -> warn

## Tests

Add offline unit tests for parser/guard behavior. Avoid tests that depend on
live registry state unless the test is explicitly a manual smoke check.
