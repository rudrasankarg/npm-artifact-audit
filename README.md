# npm-artifact-audit

> Treat your npm package as a security artifact. Audits execution surfaces, file contents, sizes, dependencies, and diffs against the registry before shipping.

[![npm version](https://img.shields.io/npm/v/npm-artifact-audit.svg)](https://www.npmjs.com/package/npm-artifact-audit)
[![license](https://img.shields.io/npm/l/npm-artifact-audit.svg)](LICENSE)
[![node](https://img.shields.io/node/v/npm-artifact-audit.svg)](package.json)

---

## Quick Start

```bash
# Run the security & artifact audit in any npm package directory
npx npm-artifact-audit
```

Or configure it to **run automatically before every publish** (in `package.json`):

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

## Commands

### 1. `npm-artifact-audit` (or `audit`)
Performs a deep scan of the package's unpacked files, code contents, and dependencies.

* Checks for leaked secrets/credentials (AWS, Stripe, OpenAI, Anthropic, private keys, etc.).
* Warns about accidental package file inclusions (log files, raw `src/`, tooling configs, test fixtures).
* Audits the **Dependency Surface** and reports production dependency metrics.

### 2. `npm-artifact-audit diff [version]`
Compares the current local package build against a previously published version from the registry (defaults to `latest`).

* Tracks newly added, removed, or significantly altered files.
* Detects **new dependencies** introduced since the last release.
* Highlights **new execution surfaces** (e.g. newly introduced `postinstall` or `preinstall` scripts).

### 3. `npm-artifact-audit why [file]`
Answers the question: **Why is this file inside my npm package?**

* Explains if a file was included because of the `files` array whitelist in `package.json`, because it is a default npm required inclusion, or because it was not ignored by `.npmignore`/`.gitignore`.
* Provides suggestions on how to fix accidental inclusions.

### 4. `npm-artifact-audit reproduce`
Builds your package twice in temporary directories and compares the resulting tarball hashes to check for **build reproducibility**.

* Reports mismatches and identifies nondeterministic file additions/differences.

---

## GitHub Action

Add this to `.github/workflows/artifact-audit.yml`:

```yaml
name: Artifact Audit
on: [push, pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: rudrasankarg/npm-publish-guard@v1
```

> [!NOTE]
> The GitHub action is backwards compatible and supports all features, displaying findings directly as inline annotations on your PR diffs.

### Action inputs

| Input | Default | Description |
|---|---|---|
| `directory` | `.` | Directory of the npm package to scan |
| `allow-src` | `false` | Don't warn about `src/` directory |
| `fail-on` | `errors` | Set to `warnings` to also fail on warnings |

---

## What is Scanned & Audited

### Security Checks
* **Credentials & Tokens:** Detects AWS keys, GitHub tokens, Stripe secrets, OpenAI keys, Anthropic tokens, npm tokens, private PEM keys, and GCP markers.
* **Suspicious Hook Scripts:** Audits package installers (`preinstall`, `postinstall`, etc.) for network requests, filesystem writes, and child process execution.
* **Executable Binaries:** Scan magic bytes for embedded native binaries (ELF, PE, Mach-O) and compiled scripts.

### Packaging Checks
* **Artifact Bloat:** Warns on source maps (`.map`), tests, logs, or tooling configurations shipped accidentally.
* **Size Intelligence:** Alerts on individual files or total package unpacked size exceeding thresholds (5MB warning, 20MB error).

---

## Programmatic API

```bash
npm install npm-artifact-audit
```

```javascript
const { audit } = require('npm-artifact-audit');

const result = await audit({
  directory: '.',       // default: process.cwd()
  allowSrc: false       // default: false
});

console.log(result.findings); // Array of audit findings
console.log(result.meta);     // package.json metadata
```

---

## License

MIT — Rudra Sankar Ghosh Dastidar
