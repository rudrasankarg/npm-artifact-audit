'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const tar = require('tar');
const { FILENAME_RULES, CONTENT_RULES, SIZE_RULES, SKIP_CONTENT_SCAN_EXT } = require('./rules');

// Skip content-scanning files larger than 1 MB to avoid hanging on bundles.
const MAX_CONTENT_SCAN_BYTES = 1 * 1024 * 1024;

/**
 * Runs `npm pack` and extracts the tarball to a temp directory.
 * Returns the exact file set npm would publish, using npm's own resolution logic.
 */
function packToTemp(targetDir) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-publish-guard-'));

  const result = spawnSync(
    'npm',
    ['pack', '--json', '--pack-destination', tmpDir],
    { cwd: targetDir, encoding: 'utf8', shell: true }
  );

  if (result.status !== 0 || result.error) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const detail = result.error ? result.error.message : (result.stderr || '').trim();
    throw new Error(
      `\`npm pack\` failed in ${targetDir}.\n` +
      `Make sure this is a valid npm package directory (has a package.json).\n` +
      (detail ? `\nDetail:\n${detail}` : '')
    );
  }

  let meta;
  try {
    [meta] = JSON.parse(result.stdout);
  } catch {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw new Error('Could not parse `npm pack --json` output. Unexpected npm version?');
  }

  const tarballPath = path.join(tmpDir, meta.filename);
  const extractDir = path.join(tmpDir, 'extracted');
  fs.mkdirSync(extractDir);
  tar.extract({ file: tarballPath, cwd: extractDir, sync: true });
  return { tmpDir, extractDir, meta };
}

function walkFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

/**
 * Scan one file for filename and content rule violations.
 *
 * @param {string} absPath  Absolute path to the extracted file
 * @param {string} relPath  Package-relative path (e.g. "src/index.js")
 * @param {object} opts     { allowSrc: boolean }
 * @returns {Array}         Array of finding objects
 */
function scanFile(absPath, relPath, opts = {}) {
  const findings = [];

  // ── File size check ──────────────────────────────────────────────────────
  let stat;
  try { stat = fs.statSync(absPath); } catch { stat = { size: 0 }; }
  const sizeBytes = stat.size;

  if (sizeBytes >= SIZE_RULES.errorBytes) {
    findings.push({
      type: 'size',
      severity: 'error',
      id: 'large-file-extreme',
      path: relPath,
      sizeBytes,
      label: `File is ${formatBytes(sizeBytes)} — almost certainly included by mistake`,
      fix: 'Add this file to .npmignore or remove it from the "files" field.',
    });
  } else if (sizeBytes >= SIZE_RULES.warnBytes) {
    findings.push({
      type: 'size',
      severity: 'warn',
      id: 'large-file',
      path: relPath,
      sizeBytes,
      label: `File is ${formatBytes(sizeBytes)} — verify this is intentional`,
      fix: 'If this is a build artifact that consumers don\'t need, add it to .npmignore.',
    });
  }

  // ── Filename rule check ──────────────────────────────────────────────────
  for (const rule of FILENAME_RULES) {
    if (rule.id === 'src-directory' && opts.allowSrc) continue;
    if (rule.re.test(relPath)) {
      findings.push({
        type: 'filename',
        severity: rule.severity,
        id: rule.id,
        path: relPath,
        sizeBytes,
        label: rule.label,
        fix: rule.fix,
      });
    }
  }

  // ── Content check (text files only, skip large and binary) ──────────────
  const ext = path.extname(relPath).toLowerCase();
  if (SKIP_CONTENT_SCAN_EXT.has(ext)) return findings;
  if (sizeBytes > MAX_CONTENT_SCAN_BYTES) return findings;

  let content;
  try {
    content = fs.readFileSync(absPath, 'utf8');
  } catch {
    return findings;
  }

  for (const rule of CONTENT_RULES) {
    const match = content.match(rule.re);
    if (match) {
      const line = content.slice(0, match.index).split('\n').length;
      findings.push({
        type: 'content',
        severity: rule.severity,
        id: rule.id,
        path: relPath,
        line,
        sizeBytes,
        label: rule.label,
        fix: 'Remove the secret from this file, or add the file to .npmignore.',
      });
    }
  }

  return findings;
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024)         return `${(bytes / 1024).toFixed(1)}KB`;
  return `${bytes}B`;
}

/**
 * Main entry point.
 *
 * @param {string}  targetDir  Project directory to scan (defaults to cwd)
 * @param {object}  opts       { allowSrc: boolean }
 * @returns {{ errors: object[], warnings: object[], fileCount: number, totalBytes: number, meta: object }}
 */
function scanPackage(targetDir = process.cwd(), opts = {}) {
  const { tmpDir, extractDir, meta } = packToTemp(targetDir);
  try {
    const files = walkFiles(extractDir);
    const allFindings = [];
    let totalBytes = 0;

    for (const absPath of files) {
      // Strip extractDir prefix + leading "package/" npm wraps tarballs in
      const relPath = path.relative(extractDir, absPath).split(path.sep).slice(1).join('/');
      let size = 0;
      try { size = fs.statSync(absPath).size; } catch {}
      totalBytes += size;
      allFindings.push(...scanFile(absPath, relPath, opts));
    }

    // ── Total package size check ───────────────────────────────────────────
    if (totalBytes >= SIZE_RULES.totalErrorBytes) {
      allFindings.push({
        type: 'package-size',
        severity: 'error',
        id: 'package-too-large',
        path: '(whole package)',
        sizeBytes: totalBytes,
        label: `Total package size is ${formatBytes(totalBytes)} — this is very large for an npm package`,
        fix: 'Use the "files" field in package.json to ship only what consumers need.',
      });
    }

    const errors   = allFindings.filter(f => f.severity === 'error');
    const warnings = allFindings.filter(f => f.severity === 'warn');

    return { errors, warnings, fileCount: files.length, totalBytes, meta };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = { scanPackage, formatBytes };
