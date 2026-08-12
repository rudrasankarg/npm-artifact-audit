#!/usr/bin/env node
'use strict';

const { scanPackage, formatBytes } = require('../src/scan');

// ─── ANSI color helpers (zero dependencies) ──────────────────────────────────
const IS_TTY = process.stdout.isTTY;
const c = IS_TTY ? {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', white: '\x1b[37m',
} : Object.fromEntries(['reset','bold','dim','red','green','yellow','cyan','white'].map(k=>[k,'']));

const bold   = s => `${c.bold}${s}${c.reset}`;
const dim    = s => `${c.dim}${s}${c.reset}`;
const red    = s => `${c.red}${s}${c.reset}`;
const green  = s => `${c.green}${s}${c.reset}`;
const yellow = s => `${c.yellow}${s}${c.reset}`;
const cyan   = s => `${c.cyan}${s}${c.reset}`;

const HR = dim('─'.repeat(54));

// ─── Help ────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
${bold('npm-publish-guard')} — scan what npm publish would ship, before it ships.

${bold('Usage:')}
  npm-publish-guard [options]
  npx npm-publish-guard [options]

${bold('Options:')}
  --allow-src          Don't warn about src/ directory being included
  --fail-on warnings   Also exit 1 when warnings are found (default: errors only)
  --quiet              Suppress output when the scan passes (useful in scripts)
  --json               Output results as JSON (for CI parsing)
  --version, -v        Show version number
  --help,    -h        Show this help message

${bold('What it checks:')}
  Errors (block publish):
    .env files, .npmrc, SSH keys, .pem/.key files, source maps (.map),
    .git/ directories, credentials.json, Google service account keys,
    local databases (.sqlite, .db), shell history, .netrc, .docker/config.json,
    .cursor/settings.json, .claude/settings.local.json,
    AWS keys, GitHub tokens, Stripe keys, OpenAI (legacy + sk-proj-), Anthropic,
    Hugging Face, npm tokens, Slack tokens, JWTs, GCP service account markers,
    Azure SAS tokens, HashiCorp Vault/Terraform tokens, and more.

  Warnings (flag for review):
    Test files, IDE configs (.vscode/, .idea/, .cursor/), tooling configs,
    log files (*.log), src/ directory, large files (>5MB),
    generic secret-shaped assignments.

${bold('Recommended setup:')} add to your package.json:
  ${cyan('"prepublishOnly": "npm-publish-guard"')}

  Runs automatically before every \`npm publish\`. No memory required.

${bold('Exit codes:')}
  0  Clean (no errors; warnings advisory unless --fail-on warnings)
  1  Errors found — publish blocked (or warnings, with --fail-on warnings)
  2  Tool error (not a valid npm package, npm not on PATH, etc.)
`);
}

// ─── Print a single finding ──────────────────────────────────────────────────

function printFinding(f, isError) {
  const bullet = isError ? red('▸') : yellow('▸');
  const sizeStr = f.sizeBytes > 0 ? dim(` (${formatBytes(f.sizeBytes)})`) : '';
  const loc = f.line ? dim(`:${f.line}`) : '';

  console.log(`   ${bullet} ${bold(f.path)}${loc}${sizeStr}`);
  console.log(`     ${f.label}`);
  console.log(`     ${dim('→ ' + f.fix)}`);
  console.log('');
}

// ─── Human-readable output ───────────────────────────────────────────────────

function printResults({ errors, warnings, fileCount, totalBytes, meta }, opts = {}) {
  const pkgId = `${meta.name}@${meta.version}`;
  const { quiet, failOnWarnings } = opts;

  // In quiet mode, only print if there's something to report
  const hasIssues = errors.length > 0 || warnings.length > 0;
  if (quiet && !hasIssues) return;

  console.log('');
  console.log(`${bold('npm-publish-guard')} — pre-publish safety check`);
  console.log(HR);
  console.log(`Package:  ${bold(pkgId)}`);
  console.log(`Size:     ${formatBytes(totalBytes)}`);
  console.log(`Scanning  ${fileCount} file(s)…`);
  console.log('');

  if (warnings.length > 0) {
    console.log(yellow(bold(`⚠  ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`)));
    for (const f of warnings) printFinding(f, false);
  }

  if (errors.length === 0) {
    if (warnings.length > 0) {
      console.log(HR);
      if (failOnWarnings) {
        console.log(red(bold('✖  Warnings treated as errors (--fail-on warnings). Fix them before publishing.')));
      } else {
        console.log(green('✔  No errors. Warnings above are advisory — safe to publish.'));
      }
    } else {
      console.log(green('✔  All clear. Safe to publish.'));
    }
    console.log('');
    return;
  }

  console.log(red(bold(`✖  ${errors.length} error${errors.length === 1 ? '' : 's'} — publish blocked`)));
  for (const f of errors) printFinding(f, true);
  console.log(HR);
  console.log(red(bold('Publish aborted. Fix the errors above before publishing.')));
  console.log('');
}

// ─── JSON output ─────────────────────────────────────────────────────────────

function printJson({ errors, warnings, fileCount, totalBytes, meta }, opts = {}) {
  const { failOnWarnings } = opts;
  const out = {
    package: {
      name:      meta.name,
      version:   meta.version,
      size:      totalBytes,
      fileCount,
    },
    errors: errors.map(f => ({
      file: f.path, rule: f.id, severity: 'error',
      description: f.label, fix: f.fix,
      ...(f.line      ? { line: f.line }           : {}),
      ...(f.sizeBytes ? { sizeBytes: f.sizeBytes }  : {}),
    })),
    warnings: warnings.map(f => ({
      file: f.path, rule: f.id, severity: 'warn',
      description: f.label, fix: f.fix,
      ...(f.line      ? { line: f.line }           : {}),
      ...(f.sizeBytes ? { sizeBytes: f.sizeBytes }  : {}),
    })),
    passed: errors.length === 0 && (!failOnWarnings || warnings.length === 0),
  };
  console.log(JSON.stringify(out, null, 2));
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(require('../package.json').version);
    process.exit(0);
  }

  const useJson       = args.includes('--json');
  const allowSrc      = args.includes('--allow-src');
  const quiet         = args.includes('--quiet');
  const failOnWarnings = args.includes('--fail-on') &&
    args[args.indexOf('--fail-on') + 1] === 'warnings';

  const targetDir = process.cwd();
  const printOpts = { quiet, failOnWarnings };

  if (!useJson && !quiet) {
    process.stdout.write(dim(`npm-publish-guard: running npm pack in ${targetDir} …\n`));
  }

  let result;
  try {
    result = scanPackage(targetDir, { allowSrc });
  } catch (err) {
    if (useJson) {
      console.log(JSON.stringify({ error: err.message, passed: false }, null, 2));
    } else {
      console.error(red('\n✖ npm-publish-guard failed:'));
      console.error(err.message);
    }
    process.exit(2);
  }

  if (useJson) {
    printJson(result, printOpts);
  } else {
    printResults(result, printOpts);
  }

  const shouldFail = result.errors.length > 0 ||
    (failOnWarnings && result.warnings.length > 0);
  process.exit(shouldFail ? 1 : 0);
}

main();
