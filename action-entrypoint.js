/**
 * GitHub Action entrypoint for npm-publish-guard.
 *
 * Reads inputs from environment variables set by the Actions runner
 * (INPUT_DIRECTORY, INPUT_ALLOW-SRC, INPUT_FAIL-ON) and runs the scanner.
 * Outputs findings as GitHub Annotations so they appear inline in the PR diff.
 */
'use strict';

const path = require('path');
const { scanPackage, formatBytes } = require('./src/scan');

// ── Read Action inputs ────────────────────────────────────────────────────────
const directory    = process.env['INPUT_DIRECTORY'] || '.';
const allowSrc     = process.env['INPUT_ALLOW-SRC'] === 'true';
const failOn       = (process.env['INPUT_FAIL-ON'] || 'errors').toLowerCase();
const failOnWarn   = failOn === 'warnings';

const targetDir = path.resolve(directory);

// ── GitHub Actions annotation helpers ────────────────────────────────────────
const gha = {
  error:   (msg, file) => console.log(`::error file=${file || ''}::${msg}`),
  warning: (msg, file) => console.log(`::warning file=${file || ''}::${msg}`),
  notice:  (msg)       => console.log(`::notice::${msg}`),
  group:   (title)     => console.log(`::group::${title}`),
  endGroup:()          => console.log(`::endgroup::`),
  setFailed:(msg)      => { console.log(`::error::${msg}`); process.exitCode = 1; },
};

// ── Run scan ──────────────────────────────────────────────────────────────────
gha.group('npm-publish-guard scan');
console.log(`Scanning: ${targetDir}`);

let result;
try {
  result = scanPackage(targetDir, { allowSrc });
} catch (err) {
  gha.endGroup();
  gha.setFailed(`npm-publish-guard: ${err.message}`);
  process.exit(1);
}

const { errors, warnings, fileCount, totalBytes, meta } = result;
console.log(`Package: ${meta.name}@${meta.version}  |  ${formatBytes(totalBytes)}  |  ${fileCount} files`);

// Emit inline annotations
for (const f of errors) {
  gha.error(
    `[${f.id}] ${f.label} — Fix: ${f.fix}`,
    f.path,
  );
}
for (const f of warnings) {
  gha.warning(
    `[${f.id}] ${f.label} — Fix: ${f.fix}`,
    f.path,
  );
}

gha.endGroup();

// ── Summary ───────────────────────────────────────────────────────────────────
if (errors.length > 0) {
  gha.setFailed(
    `npm-publish-guard: ${errors.length} error(s) found — publish would be blocked. ` +
    `Run \`npx npm-publish-guard\` locally for details.`
  );
} else if (failOnWarn && warnings.length > 0) {
  gha.setFailed(
    `npm-publish-guard: ${warnings.length} warning(s) found and --fail-on warnings is set.`
  );
} else if (warnings.length > 0) {
  gha.notice(`${warnings.length} advisory warning(s). Run \`npx npm-publish-guard\` locally for details.`);
} else {
  gha.notice(`All clear — ${fileCount} files scanned, no issues found.`);
}
