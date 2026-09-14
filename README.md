# npm-artifact-audit

> Treat your npm package as a security artifact. Audits execution surfaces, file contents, sizes, dependencies, and diffs against the registry before shipping.

[![npm version](https://img.shields.io/npm/v/npm-artifact-audit.svg)](https://www.npmjs.com/package/npm-artifact-audit)
[![license](https://img.shields.io/npm/l/npm-artifact-audit.svg)](LICENSE)
[![node](https://img.shields.io/node/v/npm-artifact-audit.svg)](package.json)

---

## Quick Start

```bash
# Run once, right now, in any npm package directory
npx npm-artifact-audit
```

Or wire it so it **runs automatically before every publish**:

```bash
npm install --save-dev npm-artifact-audit
```

```json
{
  "scripts": {
    "prepublishOnly": "npm-artifact-audit"
  }
}
```
---

## Why this exists

Most security tooling operates on your source code or git history. But `npm publish` doesn't publish your source folder — it builds a **tarball** based on three rules that interact in ways generic scanners don't understand:

- If **`.npmignore`** exists, your **`.gitignore` is ignored entirely**. Files you excluded from git can still ship to npm.
- The **`files`** field in `package.json`, if present, overrides both ignore files.
- The interaction between these three is npm-specific logic that no git scanner can replicate.

`npm-artifact-audit` audits the **exact artifact** that `npm pack` would produce — not your source tree, not your git history. It runs analyzers across that artifact:

- **File content** — credential patterns, private keys, AI editor configs, database files
- **Install scripts** — static behavioral analysis of what postinstall scripts actually do (network access, env reads, dynamic eval, obfuscated code)
- **File names** — `.env`, `.npmrc`, source maps, shell scripts, IDE configs
- **Dependencies** — production dependency count, packages with install hooks
- **Size** — oversized files and packages that suggest accidental inclusion
- **Registry diff** — what changed since the last published version

This matters because the packaging surface is where real leaks happen:

- **Anthropic leaked their Claude Code source code to npm twice** via accidentally included `.map` files — a 59.8 MB source map containing ~512,000 lines of TypeScript. The second time was March 31, 2026, one year after the first. This tool would have caught it both times.
- Thousands of real packages have leaked API keys, `.env` files, and SSH keys because `.npmignore` and `.gitignore` interact unexpectedly.

---

## How it differs from other tools

| Tool | What it does | Gap |
|---|---|---|
| `gitleaks` / `trufflehog` | Scans git **history** for secrets | Doesn't know what npm will actually ship |
| `npm audit` | Checks your **dependencies** for CVEs | Doesn't scan your own files |
| Socket.dev | Behavioral analysis of **dependencies** | Different layer entirely |
| `npm pack --dry-run` | Lists files, no analysis | You have to read the list yourself |
| **npm-artifact-audit** `audit` | Audits exactly what `npm pack` produces — static analysis | **Scoped to the publish surface specifically — the exact artifact that leaves your machine** |
| **npm-artifact-audit** `runtime` | Executes install scripts in a Node.js sandbox — dynamic analysis | **What does this package actually do at install time?** |

The key difference: this tool uses `npm pack` itself (not a reimplementation) to determine what will ship, then scans those exact files. `.npmignore` / `.gitignore` / `files` field precedence is handled correctly because npm does it.

The two commands are complementary layers:
- `audit` → *"What's inside the package?"* (static)
- `runtime` → *"What happens when this package runs?"* (dynamic)

---

## Commands

### 1. `npx npm-artifact-audit` (or `audit`)
Inspects the package for security, packaging, and size issues. This is the default command.

```bash
npx npm-artifact-audit
```

### 2. `npx npm-artifact-audit diff [version]`
Compare the current package against a published version from the registry (defaults to `latest`):

```bash
npx npm-artifact-audit diff 1.1.0
```

Shows added, removed, or changed files, new dependencies, and **new execution surfaces** (install scripts).

### 3. `npx npm-artifact-audit why [file]`
Answers the question: **Why is this file being shipped?**

```bash
npx npm-artifact-audit why dist/debug.log
```
Exposes if it came from a `files` array whitelist, default npm includes, or missing ignore patterns, and suggests a fix.

### 4. `npx npm-artifact-audit reproduce`
Runs `npm pack` twice and compares the resulting tarballs byte-for-byte:

```bash
npx npm-artifact-audit reproduce
```

Useful for detecting nondeterministic build pipelines — but note the limits:
- **Identical artifacts** do not prove the build is trustworthy or free of sensitive content.
- **Differing artifacts** do not automatically indicate a security problem — timestamps, random IDs, and nondeterministic bundlers are common causes.

### 5. `npx npm-artifact-audit runtime <package>`

Performs **dynamic behavioral analysis** on a target package's install scripts (e.g. `preinstall`, `postinstall`).

While the default `audit` command statically analyzes what a package *says* it will do, the `runtime` command runs the install scripts in a lightweight Node.js instrumentation sandbox to log what they *actually* do:

```bash
npx npm-artifact-audit runtime suspicious-package@2.4.1
```

**What it intercepts:**
- Outbound network requests (`http`, `https`, `fetch`)
- Spawning child processes and shell commands (`child_process.exec`, `spawn`)
- Sensitive filesystem writes (modifying files in `~/.config`, `/etc/`)
- Environment variable access (`process.env.NPM_TOKEN`, etc.)

---

## What it checks

### Errors — block publish

| Rule | What's caught |
|---|---|
| `env-file` | `.env`, `.env.production`, `.env.local`, etc. |
| `npm-auth` | `.npmrc` (auth tokens for private registries) |
| `aws-credentials` | `.aws/credentials` |
| `ssh-key` | `id_rsa`, `id_ed25519`, etc. |
| `private-key-file` | `*.pem`, `*.key`, `*.pfx`, `*.p12` |
| `git-dir` | `.git/`, `.svn/` directories |
| `claude-settings` | `.claude/settings.local.json` |
| `claude-settings-project` | `.claude/settings.json` — Claude Code project settings |
| `cursor-settings` | `.cursor/settings.json` |
| `windsurf-settings` | `.windsurf/settings.json` — Windsurf AI editor config |
| `google-credentials` | `credentials.json` |
| `google-service-account` | `service-account*.json` |
| `local-db` | `*.sqlite`, `*.db` |
| `shell-history` | `.bash_history`, `.zsh_history` |
| `netrc` | `.netrc` |
| `docker-config` | `.docker/config.json` |
| `terraform-vars` | `*.tfvars`, `*.tfvars.json` — Terraform variable files |
| `k8s-secret` | `*.secret.yaml`, `*.secret.yml` — Kubernetes secret manifests |
| `pypirc` | `.pypirc` — PyPI auth token / credentials |
| `embedded-binary-magic` | ELF, PE, Mach-O native executable magic headers |
| `embedded-binary-ext` | `.exe`, `.dll`, `.so`, `.dylib` — native binaries |
| `large-file-extreme` | Any single file over 20MB |

**Secret content patterns (error):**

| Rule | Matches |
|---|---|
| `aws-key-id` | `AKIA[A-Z0-9]{16}` |
| `aws-secret` | `aws_secret_access_key = ...` |
| `pem-block` | `-----BEGIN PRIVATE KEY-----` |
| `github-pat-new` | `github_pat_...` (fine-grained) |
| `github-ghp/gho/ghs` | `ghp_`, `gho_`, `ghs_` tokens |
| `stripe-secret` | `sk_live_...`, `rk_live_...` |
| `openai-key` | `sk-proj-...` and legacy `sk-...T3BlbkFJ...` |
| `anthropic-key` | `sk-ant-api...` |
| `huggingface-token` | `hf_...` |
| `slack-token` | `xox[baprs]-...` |
| `npm-token` | `npm_...` |
| `jwt` | `eyJ...` JWT-shaped strings |
| `gcp-key-id` | `"private_key_id": "<40-hex>"` |
| `azure-sas` | `SharedAccessSignature...sv=` |
| `vault-token` | `hvs.` (HashiCorp Vault / Terraform Cloud) |
| `doppler-token` | `dp.st.` Doppler service tokens |
| `twilio-token` | `SK[a-f0-9]{32}` Twilio API key |
| `sendgrid-key` | `SG.` SendGrid API key |
| `cloudflare-token` | `CLOUDFLARE_API_TOKEN=` / `CF_API_TOKEN=` 40-char token |
| `databricks-token` | `dapi[a-f0-9]{32}` Databricks PAT |
| `discord-token` | Discord bot token format |
| `linear-key` | `lin_api_...` Linear API key |
| `planetscale-token` | `pscale_tkn_...` PlanetScale service token |
| `gemini-key` | `AIza...` Google Gemini / Firebase / GCP API key |
| `firebase-token` | `FIREBASE_TOKEN=1/...` Firebase CI token |

### Warnings — advisory

| Rule | What's caught |
|---|---|
| `source-map` | `*.map` — exposes unminified source and internal paths. Normal for OSS; a concern for proprietary code. |
| `test-files` | `.test.ts`, `.spec.js`, `__tests__/`, `test/` |
| `ide-files` | `.vscode/`, `.idea/`, `.cursor/` |
| `tooling-config` | `.eslintrc.*`, `jest.config.js`, `.babelrc`, etc. |
| `log-file` | `*.log` files |
| `shell-script-file` | `.sh`, `.bat`, `.cmd` scripts |
| `cursorrules` | `.cursorrules` — may embed private project context |
| `src-directory` | Raw `src/` (use `--allow-src` to suppress) |
| `large-file` | Files between 5–20MB |
| `package-too-large` | Total package over 20MB — review whether all files are needed |
| `wasm-file` | `*.wasm` — WebAssembly is valid in many packages; confirm it is intentional |
| `generic-secret` | `api_key=`, `access_token=`, `secret_key=` patterns |

---

## Example Output

### `audit` (static)

```
npm-artifact-audit

Package:  my-package@1.2.0
Artifact: 847 KB (compressed)
Files:    31

Security
─────────────────────────────────────────────
✓ No credentials detected
✓ No private keys detected
✓ No executable binaries detected

Install Scripts
─────────────────────────────────────────────
⚠  postinstall: scripts/install.js
   WARN  Install script reads environment variables
         → process.env.HOME (line 4)
   WARN  Install script spawns child processes
         → execSync( (line 9)

Packaging
─────────────────────────────────────────────
⚠  dist/index.js.map
   Source map — exposes unminified source and internal paths

Dependency surface
─────────────────────────────────────────────
✓  3 production dependencies listed
✓  No production dependencies with install scripts

Artifact
─────────────────────────────────────────────
Files:       31
Compressed:  847 KB
Unpacked:    2.4 MB

Result: PASS WITH WARNINGS
```

### `runtime` (dynamic)

```
npm-runtime-audit

Package:  suspicious-tool@2.4.1
Status:   Executed: postinstall

BEHAVIOR
─────────────────────────────────────────────
HIGH   Network access
       → http://198.51.100.42/collect

MEDIUM Environment access
       → process.env.NPM_TOKEN
       → process.env.HOME

MEDIUM Child process execution
       → /bin/sh -c ...

Result: REVIEW REQUIRED
```

Exit codes: `0` = clean, `1` = errors found (or warnings with `--fail-on warnings`), `2` = tool error.

---

## Options

| Flag | Description |
|---|---|
| `--allow-src` | Don't warn about `src/` directory being included |
| `--fail-on warnings` | Also exit 1 when warnings are found (strict mode) |
| `--fix` | Auto-append `.npmignore` entries for every finding |
| `--quiet`, `-q` | Suppress all output when the scan passes cleanly |
| `--json` | Output results as JSON (for CI parsing) |
| `--version`, `-v` | Show version |
| `--help`, `-h` | Show help |

---

## Configuration

Rules can be suppressed without disabling the tool. Add an `auditConfig` key to `package.json`:

```json
{
  "auditConfig": {
    "ignoreRules": ["test-files", "source-map", "wasm-file"],
    "allowSrc": true,
    "failOnWarnings": false,
    "quiet": false
  }
}
```

Or use a standalone `.npmauditrc.json` file in the project root:

```json
{
  "ignoreRules": ["test-files"],
  "allowSrc": true
}
```

**CLI flags always take precedence** over the config file. Available rule IDs for `ignoreRules` match the `id` field shown in `--json` output — for example `"test-files"`, `"source-map"`, `"wasm-file"`, `"src-directory"`, `"large-file"`.

---

## Programmatic API

```bash
npm install npm-artifact-audit
```

```js
const { audit } = require('npm-artifact-audit');

async function check() {
  const result = await audit({
    directory:      './packages/my-lib',  // default: process.cwd()
    allowSrc:       false                 // default: false
  });

  console.log(result.findings); // Array of findings
  console.log(result.meta);     // package.json metadata
}
```

---

## JSON Output

Use `--json` for machine-readable output in CI pipelines:

```bash
npx npm-artifact-audit --json
```

```json
{
  "package": { "name": "my-pkg", "version": "1.0.0", "size": 1234, "fileCount": 3 },
  "findings": [
    {
      "analyzer": "files",
      "type": "filename",
      "id": "source-map",
      "severity": "error",
      "file": "dist/app.js.map",
      "label": "Source map — exposes your full unminified source code",
      "fix": "Add '*.map' to .npmignore, or set sourceMap: false in your bundler config."
    }
  ],
  "passed": false,
  "result": "FAIL"
}
```

---

## CI Integration

Exit code `1` on errors means it blocks pipelines automatically.

**GitHub Actions:**
```yaml
- name: Audit npm artifact
  run: npx npm-artifact-audit

# Strict mode — also block on warnings:
- name: Audit npm artifact (strict)
  run: npx npm-artifact-audit --fail-on warnings
```

**GitLab CI:**
```yaml
publish:
  script:
    - npx npm-artifact-audit
    - npm publish
```

**prepublishOnly (recommended):**
```json
{
  "scripts": {
    "prepublishOnly": "npm-artifact-audit"
  }
}
```

---

## How it works

**`audit` (static):** Runs `npm pack --json` to get the exact file set npm would publish — using npm's own resolution logic, not a reimplementation. That means `.npmignore` vs `.gitignore` vs `files` field precedence is handled correctly. Each file is then checked against filename rules, install hooks, dependency scripts, file sizes, and scanned for secret-shaped content patterns. Install scripts are statically analyzed for behavioral patterns (network, eval, env access). Temp files are cleaned up automatically.

**`runtime` (dynamic):** Packs the target package via `npm pack`, extracts it, and executes its lifecycle scripts (`preinstall`, `install`, `postinstall`) inside a Node.js instrumentation sandbox. The sandbox monkey-patches `http`, `https`, `child_process`, `fs`, and `process.env` to intercept and log actual runtime behavior. The results are formatted into a severity-ranked behavioral report. Note: this executes the package's code on your machine — it is best-effort instrumentation, not full hypervisor isolation.

---

## What this is not

- **Not a general-purpose secret scanner.** Tools like [gitleaks](https://github.com/gitleaks/gitleaks) and [trufflehog](https://github.com/trufflesecurity/trufflehog) scan your git history — use those too. This tool is scoped to the npm publish surface specifically.
- **Not a guarantee.** Regex-based matching will miss obfuscated or unusual secret formats. Treat findings as "review this," not "definitely a leak."

---

## License

MIT — [Rudra Sankar Ghosh Dastidar](https://github.com/rudrasankarg)
