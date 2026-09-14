# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.6.0] — 2026-09-14

### Added
- **Dynamic Runtime Analyzer (`runtime` command):** Added a new security layer that executes a package's install scripts inside a lightweight Node.js instrumentation sandbox to log their actual behavior. This provides a dynamic complement to the static `audit` command.
- The `runtime` command intercepts and reports on outbound network requests, child process spawning, sensitive filesystem writes, and environment variable access.

---

## [1.5.0] — 2026-09-14

### Added
- **Per-rule configuration & noise suppression:** You can now suppress specific noisy rules without disabling the entire tool. Added support for `package.json#auditConfig` and standalone `.npmauditrc.json` files.
- **Install Script Behavioral Analysis:** Entirely replaced the old pattern scanner with a structured static behavioral analyzer for install hooks. It now categorizes install script behavior into `network-access`, `env-access`, `child-process`, `dynamic-eval`, `fs-home-write`, `data-exfil-pattern`, `obfuscated-code`, and `dynamic-require`, extracting the exact line of code and severity for each.
- **Install Scripts terminal section:** Added a dedicated "Install Scripts" section to the terminal output that visualizes behavioral findings grouped by hook.

### Changed
- **README positioning:** Rewrote the intro and positioning to emphasize "publish-surface analysis" rather than just "secret scanning," providing more concrete context on why this differs from git-history scanners.
- Downgraded the base "install hook exists" finding to severity `info` (advisory). The actual behavioral findings (e.g. `network-access`) now carry the `error` or `warn` severity.

---

## [1.4.0] — 2026-09-14

### Changed

**Severity corrections:**
- **`source-map`** — downgraded from `error` to `warn`. Source maps are entirely normal for open-source packages; the tool was creating noise for legitimate use cases. The finding now advisory, with a note that the concern applies primarily to proprietary code.
- **`package-too-large`** — downgraded from `error` to `warn`. Package size is not inherently a security issue; a legitimate package can be large. The finding now prompts review rather than blocking publish unconditionally. Individual file `large-file-extreme` (>20 MB single file) remains an `error`.
- **`.wasm`** — separated from the native binary `error` group and now emits a `warn` (`wasm-file`) instead. WebAssembly is increasingly normal in npm packages (parsers, codecs, crypto). The signal worth reviewing is whether WASM is *unexpected* for this package, not its mere presence.

**Wording corrections:**
- **`reproduce` command** — output now includes an explicit caveat that identical artifacts do not prove the build is trustworthy, and differing artifacts do not automatically indicate a security problem. The success message changed from `"Build is reproducible"` to `"Artifacts are byte-for-byte identical across two consecutive builds"` to accurately describe what was tested. The failure output now lists nondeterministic bundler behavior and missing lock files as common non-security causes.
- **`diff` execution surface label** — renamed from `"NEW EXECUTION SURFACE"` to `"INSTALL HOOK CHANGES"`, with a clarifying note that a changed install hook is not automatically a threat but warrants inspection. Now also distinguishes between new hooks and modified hooks.

**README corrections:**
- Removed the `"The first tool in this specific security surface"` claim from the comparison table. The defensible claim is `"Scoped to the publish surface specifically — the exact artifact that leaves your machine"`.
- Updated the `What it checks` tables to reflect the new severity levels for `source-map`, `wasm-file`, and `package-too-large`.
- Updated the `reproduce` command description with accurate scope and caveats.

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
