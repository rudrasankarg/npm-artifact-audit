# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-08-12

Initial stable release.

### Added

**Filename rules (errors — block publish):**
- `.env` files (`.env`, `.env.production`, `.env.local`, etc.)
- `.npmrc` (auth tokens for private registries)
- `.aws/credentials`
- SSH private keys (`id_rsa`, `id_ed25519`, etc.)
- Private key / certificate files (`.pem`, `.key`, `.pfx`, `.p12`, `.crt`, `.cer`)
- Source maps (`*.map`) — exposes full unminified source code
- `.git/` directory — version control internals
- `.claude/settings.local.json` — Claude Code config
- `.cursor/settings.json` — Cursor AI editor config
- `credentials.json` — Google OAuth credentials
- `service-account*.json` — Google Cloud service account keys
- Local database files (`.sqlite`, `.db`)
- Shell history files (`.bash_history`, `.zsh_history`, `.fish_history`)
- `.netrc` — credential store for curl/wget
- `.docker/config.json` — Docker registry credentials

**Filename rules (warnings — advisory):**
- Test files (`.test.ts`, `.spec.js`, `__tests__/`, `test/`)
- IDE config directories (`.vscode/`, `.idea/`, `.cursor/`)
- Internal tooling configs (`.eslintrc`, `jest.config.js`, `.babelrc`, etc.)
- Log files (`*.log`)
- Raw `src/` directory (bypassable with `--allow-src`)

**Secret content patterns (errors):**
- AWS access key IDs (`AKIA...`)
- AWS secret access key assignments
- PEM private key blocks
- GitHub tokens (`ghp_`, `gho_`, `ghs_`, `github_pat_`, legacy `gh[pousr]_`)
- Stripe secret keys (`sk_live_`, `rk_live_`)
- OpenAI API keys — legacy (`sk-...T3BlbkFJ...`) and new `sk-proj-` format
- Anthropic API keys (`sk-ant-api...`)
- Hugging Face tokens (`hf_`)
- Slack tokens (`xox*`)
- npm publish tokens (`npm_`)
- JWT-shaped strings (`eyJ...`)
- Google Cloud service account key markers (`"private_key_id"`)
- Azure SAS tokens (`SharedAccessSignature...sv=`)
- HashiCorp Vault / Terraform Cloud tokens (`hvs.`)

**Secret content patterns (warnings):**
- Generic API key / secret assignments (`api_key=`, `access_token=`, etc.)

**Size rules:**
- Files over 20MB → error
- Files between 5–20MB → warning
- Total package over 20MB → error

**CLI flags:**
- `--allow-src` — suppress warning about `src/` directory
- `--fail-on warnings` — treat warnings as errors (exit code 1)
- `--quiet` — suppress output when scan passes (useful in scripts)
- `--json` — machine-readable JSON output for CI pipelines
- `--version` / `-v` — show version
- `--help` / `-h` — show help

**Other:**
- TTY-aware color stripping (colors disabled when piped or in CI)
- Windows compatible
- Per-finding actionable fix hints
- Zero runtime dependencies beyond `tar` (used to extract npm pack output)
