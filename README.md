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

```json
{
  "scripts": {
    "prepublishOnly": "npm-artifact-audit"
  }
}
```

```bash
npm install --save-dev npm-artifact-audit
```

---

## Why this exists

`npm publish` doesn't publish your source folder — it builds a tarball based on three rules that interact in surprising ways:

- If **`.npmignore`** exists, your **`.gitignore` is ignored entirely**. Files you excluded from git can still ship to npm.
- The **`files`** field in `package.json`, if present, overrides both ignore files.
- The interaction between these three is npm-specific logic that generic scanners don't know about.

The result: `.env` files, private keys, source maps, and AI configs quietly end up in public packages. This isn't hypothetical:

- **Anthropic leaked their Claude Code source code to npm twice** via accidentally included `.map` files — a 59.8MB source map containing ~512,000 lines of TypeScript. The second time was March 31, 2026, one year after the first incident. This tool would have caught it both times.
- Thousands of real packages have leaked API keys, `.env` files, and SSH keys this way.

`npm-artifact-audit` automates the check you'd otherwise do manually: run `npm pack`, read the file list, and audit the resulting security surface. It blocks the publish if it finds a problem.

---

## How it differs from other tools

| Tool | What it does | Gap |
|---|---|---|
| `gitleaks` / `trufflehog` | Scans git **history** for secrets | Doesn't know what npm will actually ship |
| `npm audit` | Checks your **dependencies** for CVEs | Doesn't scan your own files |
| Socket.dev | Behavioral analysis of **dependencies** | Different layer entirely |
| `npm pack --dry-run` | Lists files, no analysis | You have to read the list yourself |
| **npm-artifact-audit** | Audits exactly what `npm pack` produces | **The first tool in this specific security surface** |

The key difference: this tool uses `npm pack` itself (not a reimplementation) to determine what will ship, then scans those exact files. `.npmignore` / `.gitignore` / `files` field precedence is handled correctly because npm does it.

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
Builds the package twice and compares the resulting artifacts to verify **reproducibility**:

```bash
npx npm-artifact-audit reproduce
```

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
| `embedded-binary-magic` | ELF, PE, Mach-O native executable magic headers |
| `embedded-binary-ext` | `.exe`, `.dll`, `.so`, `.dylib`, `.wasm` |
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
| `doppler-token` | `dp.st.` Doppler service tokens |
| `twilio-token` | `SK[a-f0-9]{32}` Twilio API key |
| `sendgrid-key` | `SG.` SendGrid API key |
| `cloudflare-token` | 40-character Cloudflare API token |

### Warnings — advisory

| Rule | What's caught |
|---|---|
| `test-files` | `.test.ts`, `.spec.js`, `__tests__/`, `test/` |
| `ide-files` | `.vscode/`, `.idea/`, `.cursor/` |
| `tooling-config` | `.eslintrc.*`, `jest.config.js`, `.babelrc`, etc. |
| `log-file` | `*.log` files |
| `shell-script-file` | `.sh`, `.bat`, `.cmd` scripts |
| `src-directory` | Raw `src/` (use `--allow-src` to suppress) |
| `large-file` | Files between 5–20MB |
| `generic-secret` | `api_key=`, `access_token=`, `secret_key=` patterns |

---

## Example Output

```
npm-artifact-audit

Package:  my-package@1.2.0
Artifact: 847 KB (compressed)
Files:    31

Security
─────────────────────────────────────────────
✓ No credentials detected
✓ No private keys detected
✓ No suspicious scripts detected
✓ No executable binaries detected

Packaging
─────────────────────────────────────────────
⚠  dist/index.js.map
   Source map exposes source code

⚠  test/fixtures/large-response.json
   184 KB test fixture included in package

Dependency surface
─────────────────────────────────────────────
⚠  14 production dependencies
⚠  3 packages contain install scripts

Artifact
─────────────────────────────────────────────
Files:       31
Compressed:  847 KB
Unpacked:    2.4 MB

Result: PASS WITH WARNINGS
```

Exit codes: `0` = clean, `1` = errors found (or warnings with `--fail-on warnings`), `2` = tool error.

---

## Options

| Flag | Description |
|---|---|
| `--allow-src` | Don't warn about `src/` directory being included |
| `--fail-on warnings` | Also exit 1 when warnings are found (strict mode) |
| `--json` | Output results as JSON (for CI parsing) |
| `--version`, `-v` | Show version |
| `--help`, `-h` | Show help |

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

Internally runs `npm pack --json` to get the exact file set npm would publish — using npm's own resolution logic, not a reimplementation. That means `.npmignore` vs `.gitignore` vs `files` field precedence is handled correctly. Each file is then checked against filename rules, execution hooks, dependency scripts, file sizes, and scanned for secret-shaped content patterns. Temp files are cleaned up automatically.

---

## What this is not

- **Not a general-purpose secret scanner.** Tools like [gitleaks](https://github.com/gitleaks/gitleaks) and [trufflehog](https://github.com/trufflesecurity/trufflehog) scan your git history — use those too. This tool is scoped to the npm publish surface specifically.
- **Not a guarantee.** Regex-based matching will miss obfuscated or unusual secret formats. Treat findings as "review this," not "definitely a leak."

---

## License

MIT — [Rudra Sankar Ghosh Dastidar](https://github.com/rudrasankarg)
