# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.3.0] — 2026-08-23

### Added

**New secret content patterns:**
- **Databricks** — `dapi[a-f0-9]{32}` personal access tokens
- **Discord** — Bot token format (`M/N` prefix + structured dots)
- **Linear** — `lin_api_...` API keys
- **PlanetScale** — `pscale_tkn_...` service tokens
- **Google Gemini / Firebase / GCP** — `AIza...` API keys (covers all three surfaces)
- **Firebase CI** — `FIREBASE_TOKEN=1/...` CI token assignments

**New filename rules (errors):**
- `.windsurf/settings.json` — Windsurf AI editor config (may contain tokens)
- `.claude/settings.json` — Claude Code project settings (non-local variant)
- `*.tfvars`, `*.tfvars.json` — Terraform variable files (often contain secrets)
- `*.secret.yaml`, `*.secret.yml` — Kubernetes secret manifests
- `.pypirc` — PyPI auth token / credentials file

**New filename rules (warnings):**
- `.cursorrules` — may embed private project context or internal instructions

### Fixed
- **`--fix` flag** — now actually implemented; auto-appends patterns to `.npmignore` for every finding that references a specific file path. Extracts the suggested glob from the fix hint when available, otherwise falls back to the raw file path.
- **`--quiet` / `-q` flag** — now actually implemented; suppresses all output when the scan passes cleanly (no errors, no warnings). Useful in `prepublishOnly` scripts.
- **`--version` / `-v` flag** — now actually implemented; prints the package version from `package.json` and exits.
- **Cloudflare regex** — tightened from a bare 40-character pattern (high false-positive rate) to require `CLOUDFLARE_API_TOKEN` or `CF_API_TOKEN` context.

### Changed
- Terminal reporter now prints a **Summary line** (`N errors, N warnings`) before the final `Result:` banner.

---

## [1.1.0] — 2026-08-12


### Added
- **GitHub Action** — use as `rudrasankarg/npm-publish-guard@v1` in CI. Emits inline PR annotations.
  - Inputs: `directory`, `allow-src`, `fail-on`
- **Programmatic API** — `const { scan } = require('npm-publish-guard')`
- **`--fix` flag** — auto-appends `.npmignore` entries for every finding
- **Config file** — `.publish-guardrc.json` or `package.json#publishGuard`
  - Supports `allowSrc`, `failOnWarnings`, `quiet`, `ignoreRules`
- **4 new secret patterns**: Doppler (`dp.st.`), Twilio (`SK[hex32]`), SendGrid (`SG.`), Cloudflare (40-char token)
- **Dual bin alias**: `publish-guard` (short form) + `npm-publish-guard`

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
