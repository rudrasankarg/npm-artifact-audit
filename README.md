# npm-publish-guard

> Scan exactly what `npm publish` would ship — for leaked secrets, dangerous files, and packaging mistakes — **before** it happens.

[![npm version](https://img.shields.io/npm/v/npm-publish-guard.svg)](https://www.npmjs.com/package/npm-publish-guard)
[![license](https://img.shields.io/npm/l/npm-publish-guard.svg)](LICENSE)
[![node](https://img.shields.io/node/v/npm-publish-guard.svg)](package.json)

---

## Quick Start

```bash
# Run once, right now, in any npm package directory
npx npm-publish-guard
```

Or wire it in so it **runs automatically before every publish** — no memory required:

```json
{
  "scripts": {
    "prepublishOnly": "npm-publish-guard"
  }
}
```

```bash
npm install --save-dev npm-publish-guard
```

---

## Why this exists

`npm publish` doesn't publish your source folder — it builds a tarball based on three rules that interact in surprising ways:

- If **`.npmignore`** exists, your **`.gitignore` is ignored entirely**. Files you excluded from git can still ship to npm.
- The **`files`** field in `package.json`, if present, overrides both ignore files.
- The interaction between these three is npm-specific logic that generic scanners don't know about.

The result: `.env` files, private keys, source maps, and AI config quietly end up in public packages. This isn't hypothetical:

- **Anthropic leaked their Claude Code source code to npm twice** via accidentally included `.map` files — a 59.8MB source map containing ~512,000 lines of TypeScript. The second time was March 31, 2026, one year after the first incident. This tool would have caught it both times.
- Thousands of real packages have leaked API keys, `.env` files, and SSH keys this way.

`npm-publish-guard` automates the check you'd otherwise do manually: run `npm pack`, read the file list, look for anything dangerous. It blocks the publish if it finds a problem.

---

## How it differs from other tools

| Tool | What it does | Gap |
|---|---|---|
| `gitleaks` / `trufflehog` | Scans git **history** for secrets | Doesn't know what npm will actually ship |
| `npm audit` | Checks your **dependencies** for CVEs | Doesn't scan your own files |
| Socket.dev | Behavioral analysis of **dependencies** | Different layer entirely |
| `npm pack --dry-run` | Lists files, no analysis | You have to read the list yourself |
| **npm-publish-guard** | Scans exactly what `npm pack` produces | **The only tool in this specific niche** |

The key difference: this tool uses `npm pack` itself (not a reimplementation) to determine what will ship, then scans those exact files. `.npmignore` / `.gitignore` / `files` field precedence is handled correctly because npm does it.

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
| `source-map` | `*.map` — exposes full unminified source |
| `git-dir` | `.git/`, `.svn/` directories |
| `claude-settings` | `.claude/settings.local.json` |
| `cursor-settings` | `.cursor/settings.json` |
| `google-credentials` | `credentials.json` |
| `google-service-account` | `service-account*.json` |
| `local-db` | `*.sqlite`, `*.db` |
| `shell-history` | `.bash_history`, `.zsh_history` |
| `netrc` | `.netrc` |
| `docker-config` | `.docker/config.json` |
| `large-file-extreme` | Any file over 20MB |
| `package-too-large` | Total package over 20MB |

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

### Warnings — advisory

| Rule | What's caught |
|---|---|
| `test-files` | `.test.ts`, `.spec.js`, `__tests__/`, `test/` |
| `ide-files` | `.vscode/`, `.idea/`, `.cursor/` |
| `tooling-config` | `.eslintrc.*`, `jest.config.js`, `.babelrc`, etc. |
| `log-file` | `*.log` files |
| `src-directory` | Raw `src/` (use `--allow-src` to suppress) |
| `large-file` | Files between 5–20MB |
| `generic-secret` | `api_key=`, `access_token=`, `secret_key=` patterns |

---

## Example output

```
npm-publish-guard — pre-publish safety check
──────────────────────────────────────────────────────
Package:  my-package@2.1.88
Size:     59.8MB
Scanning  6 file(s)…

⚠  1 warning
   ▸ src/index.test.ts (5B)
     Test files — usually not needed by package consumers
     → Use the 'files' field in package.json or .npmignore to exclude tests.

✖  2 errors — publish blocked
   ▸ dist/cli.js.map (59.8MB)
     Source map — exposes your full unminified source code
     → Add '*.map' to .npmignore, or set sourceMap: false in your bundler config.

   ▸ .env (21B)
     .env file — may contain API keys or secrets
     → Add '.env*' to .npmignore or use the 'files' field in package.json.

──────────────────────────────────────────────────────
Publish aborted. Fix the errors above before publishing.
```

Exit codes: `0` = clean, `1` = errors found (or warnings with `--fail-on warnings`), `2` = tool error.

---

## Options

| Flag | Description |
|---|---|
| `--allow-src` | Don't warn about `src/` directory being included |
| `--fail-on warnings` | Also exit 1 when warnings are found (strict mode) |
| `--quiet` | Suppress all output when the scan passes (for use in scripts) |
| `--json` | Output results as JSON (for CI parsing) |
| `--version`, `-v` | Show version |
| `--help`, `-h` | Show help |

---

## JSON output

Use `--json` for machine-readable output in CI pipelines:

```bash
npx npm-publish-guard --json
```

```json
{
  "package": { "name": "my-pkg", "version": "1.0.0", "size": 1234, "fileCount": 3 },
  "errors": [
    {
      "file": "dist/app.js.map",
      "rule": "source-map",
      "severity": "error",
      "description": "Source map — exposes your full unminified source code",
      "fix": "Add '*.map' to .npmignore, or set sourceMap: false in your bundler config."
    }
  ],
  "warnings": [],
  "passed": false
}
```

---

## CI integration

Exit code `1` on errors means it blocks pipelines automatically.

**GitHub Actions:**
```yaml
- name: Check for publish safety
  run: npx npm-publish-guard

# Strict mode — also block on warnings:
- name: Check for publish safety (strict)
  run: npx npm-publish-guard --fail-on warnings
```

**GitLab CI:**
```yaml
publish:
  script:
    - npx npm-publish-guard
    - npm publish
```

**prepublishOnly (recommended):**
```json
{
  "scripts": {
    "prepublishOnly": "npm-publish-guard"
  }
}
```

---

## How it works

Internally runs `npm pack --json` to get the exact file set npm would publish — using npm's own resolution logic, not a reimplementation. That means `.npmignore` vs `.gitignore` vs `files` field precedence is handled correctly. Each file is then checked against filename rules and scanned for secret-shaped content patterns. Temp files are cleaned up automatically.

---

## What this is not

- **Not a general-purpose secret scanner.** Tools like [gitleaks](https://github.com/gitleaks/gitleaks) and [trufflehog](https://github.com/trufflesecurity/trufflehog) scan your git history — use those too. This tool is scoped to the npm publish surface specifically.
- **Not a guarantee.** Regex-based matching will miss obfuscated or unusual secret formats. Treat findings as "review this," not "definitely a leak."

---

## License

MIT — [Rudra Sankar Ghosh Dastidar](https://github.com/rudrasankarg)
