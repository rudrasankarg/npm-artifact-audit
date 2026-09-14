'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const { packAndUnpack } = require('../artifact/pack');
const { readManifest } = require('../artifact/manifest');
const { inspectPackage } = require('../artifact/inspect');
const { explainInclusion } = require('../analyzers/files');
const { diffArtifact } = require('../diff/artifact-diff');
const { reportAudit, reportDiff } = require('../reporters/terminal');
const { reportAuditJson, reportDiffJson } = require('../reporters/json');
const { loadConfig } = require('../config');

function getSha256(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function runReproduce() {
  console.log('\nRunning Reproducibility Check...');
  console.log('Running npm pack twice and comparing the resulting tarballs.\n');
  console.log('Note: This checks whether your build pipeline produces byte-for-byte');
  console.log('identical output across two consecutive runs. It does NOT guarantee');
  console.log('the build is trustworthy, and differences do not automatically indicate');
  console.log('a security problem — timestamps, random IDs, or nondeterministic');
  console.log('bundlers are common causes of divergence.\n');

  const tmp1 = fs.mkdtempSync(path.join(require('os').tmpdir(), 'reproduce-1-'));
  const tmp2 = fs.mkdtempSync(path.join(require('os').tmpdir(), 'reproduce-2-'));

  try {
    // Build #1
    const p1 = spawnSync('npm', ['pack', '--json', '--pack-destination', tmp1], { cwd: process.cwd(), shell: true, encoding: 'utf8' });
    if (p1.status !== 0) throw new Error('First build failed: ' + p1.stderr);
    const meta1 = JSON.parse(p1.stdout)[0];
    const path1 = path.join(tmp1, meta1.filename);
    const hash1 = getSha256(path1);

    // Build #2
    const p2 = spawnSync('npm', ['pack', '--json', '--pack-destination', tmp2], { cwd: process.cwd(), shell: true, encoding: 'utf8' });
    if (p2.status !== 0) throw new Error('Second build failed: ' + p2.stderr);
    const meta2 = JSON.parse(p2.stdout)[0];
    const path2 = path.join(tmp2, meta2.filename);
    const hash2 = getSha256(path2);

    console.log(`Build #1: SHA256 ${hash1.slice(0, 12)}...`);
    console.log(`Build #2: SHA256 ${hash2.slice(0, 12)}...`);

    if (hash1 === hash2) {
      console.log('\n\x1b[32m✓ Artifacts are byte-for-byte identical across two consecutive builds.\x1b[0m');
      console.log('\x1b[2m  This suggests your build pipeline is deterministic, but does not\x1b[0m');
      console.log('\x1b[2m  prove the resulting artifact is free of malicious or sensitive content.\x1b[0m\n');
      process.exit(0);
    }

    console.log('\n\x1b[31m✗ Artifacts differ between the two builds.\x1b[0m\n');

    // Extract both to diff files
    const tar = require('tar');
    const ext1 = path.join(tmp1, 'ext');
    const ext2 = path.join(tmp2, 'ext');
    fs.mkdirSync(ext1);
    fs.mkdirSync(ext2);
    tar.extract({ file: path1, cwd: ext1, sync: true });
    tar.extract({ file: path2, cwd: ext2, sync: true });

    const dir1 = path.join(ext1, 'package');
    const dir2 = path.join(ext2, 'package');

    function walk(dir) {
      const results = [];
      const list = fs.readdirSync(dir);
      list.forEach(file => {
        const full = path.join(dir, file);
        const stat = fs.statSync(full);
        if (stat && stat.isDirectory()) {
          results.push(...walk(full));
        } else {
          results.push(full);
        }
      });
      return results;
    }

    const files1 = walk(dir1).map(p => path.relative(dir1, p).replace(/\\/g, '/'));
    const files2 = walk(dir2).map(p => path.relative(dir2, p).replace(/\\/g, '/'));

    const changed = [];
    const allFiles = new Set([...files1, ...files2]);

    for (const f of allFiles) {
      const f1 = path.join(dir1, f);
      const f2 = path.join(dir2, f);
      if (!fs.existsSync(f1) || !fs.existsSync(f2)) {
        changed.push(f);
      } else {
        const h1 = getSha256(f1);
        const h2 = getSha256(f2);
        if (h1 !== h2) changed.push(f);
      }
    }

    console.log('Files that differed between builds:');
    changed.forEach(f => console.log(`  - ${f}`));

    console.log('\nCommon non-security causes of build divergence:');
    console.log('  - Timestamps embedded in bundle files or generated assets');
    console.log('  - Random IDs or build hashes injected by bundlers (webpack, esbuild, etc.)');
    console.log('  - Nondeterministic dependency resolution (missing lock file)');
    console.log('  - Environment-specific metadata (hostnames, paths, env vars in output)');
    console.log('');
    console.log('If none of the above apply, investigate whether the changing files');
    console.log('could be influenced by external state (network, time, random seeds).');
    console.log('');
    process.exit(1);

  } finally {
    fs.rmSync(tmp1, { recursive: true, force: true });
    fs.rmSync(tmp2, { recursive: true, force: true });
  }
}

function printVersion() {
  let version = 'unknown';
  try {
    const pkgPath = path.join(__dirname, '..', '..', 'package.json');
    version = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
  } catch {}
  console.log(version);
}

function printHelp() {
  console.log(`
npm-artifact-audit — treat the npm tarball as a security artifact

Usage:
  npx npm-artifact-audit [command] [options]

Commands:
  audit                  Inspect the local package tarball for security and size issues (default)
  diff [version]         Compare the local package tarball against a published version (default: latest)
  why [file]             Explain why a specific file is being shipped in the package
  reproduce              Compare two package builds to check for reproducibility

Options:
  --json                 Output results as JSON
  --allow-src            Don't warn about raw src/ directory
  --fail-on warnings     Treat warnings as errors
  --quiet, -q            Suppress output when scan passes cleanly
  --fix                  Auto-append .npmignore entries for every finding
  --version, -v          Show version
  --help, -h             Show help message
`);
}

/**
 * Applies --fix: appends missing .npmignore entries for path-based findings.
 *
 * @param {object[]} findings
 * @param {string} projectDir
 */
function applyFix(findings, projectDir) {
  const npmignorePath = path.join(projectDir, '.npmignore');

  // Collect unique globs/paths from findings that have a real file path
  const toAdd = new Set();
  for (const f of findings) {
    if (!f.path || f.path === '(whole package)' || f.path === 'package.json') continue;
    // Use the fix hint to extract the pattern if it mentions .npmignore, else use the path directly
    const hintMatch = f.fix && f.fix.match(/Add '([^']+)' to \.npmignore/);
    if (hintMatch) {
      toAdd.add(hintMatch[1]);
    } else {
      toAdd.add(f.path);
    }
  }

  if (toAdd.size === 0) {
    console.log('\n--fix: No file-based findings to fix.');
    return;
  }

  // Read existing .npmignore (if any)
  let existing = '';
  try {
    existing = fs.readFileSync(npmignorePath, 'utf8');
  } catch {}
  const existingLines = new Set(existing.split('\n').map(l => l.trim()).filter(Boolean));

  const newEntries = [...toAdd].filter(e => !existingLines.has(e));
  if (newEntries.length === 0) {
    console.log('\n--fix: All suggested patterns are already in .npmignore.');
    return;
  }

  const append = (existing.endsWith('\n') || existing === '' ? '' : '\n') + newEntries.join('\n') + '\n';
  fs.appendFileSync(npmignorePath, append, 'utf8');

  console.log(`\n--fix: Appended ${newEntries.length} entr${newEntries.length === 1 ? 'y' : 'ies'} to .npmignore:`);
  newEntries.forEach(e => console.log(`  + ${e}`));
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] && !args[0].startsWith('-') ? args[0] : 'audit';
  const flags = args.filter(a => a.startsWith('-'));

  if (flags.includes('--help') || flags.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  if (flags.includes('--version') || flags.includes('-v')) {
    printVersion();
    process.exit(0);
  }

  const useJson = flags.includes('--json');
  const fix = flags.includes('--fix');

  const projectDir = process.cwd();

  // Load config file, then override with any explicitly-set CLI flags
  const cliOverrides = {};
  if (flags.includes('--allow-src'))    cliOverrides.allowSrc = true;
  if (flags.includes('--fail-on') && args[args.indexOf('--fail-on') + 1] === 'warnings') cliOverrides.failOnWarnings = true;
  if (flags.includes('--quiet') || flags.includes('-q')) cliOverrides.quiet = true;

  const config = loadConfig(projectDir, cliOverrides);
  const { allowSrc, failOnWarnings, quiet, ignoreRules } = config;

  if (command === 'why') {
    const file = args[1];
    if (!file) {
      console.error('Error: Please specify a file path. E.g. "npx npm-artifact-audit why dist/index.js"');
      process.exit(2);
    }
    let manifest = {};
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
    } catch {}
    const explanation = explainInclusion(file, projectDir, manifest);
    console.log(`\n${file}\n`);
    console.log(`Included because:\n  ${explanation.reason}\n`);
    console.log(`Suggested fix:\n  ${explanation.suggestion}\n`);
    process.exit(0);
  }

  if (command === 'reproduce') {
    runReproduce();
    return;
  }

  if (command === 'diff') {
    const targetVersion = args[1] && !args[1].startsWith('-') ? args[1] : 'latest';
    let localResult;
    try {
      localResult = packAndUnpack(projectDir, false);
    } catch (err) {
      console.error('Failed to pack local directory:', err.message);
      process.exit(2);
    }

    try {
      const localManifest = readManifest(localResult.extractDir);
      const diffResult = diffArtifact(projectDir, localManifest, localResult.extractDir, targetVersion);
      if (useJson) {
        reportDiffJson(diffResult);
      } else {
        reportDiff(diffResult);
      }
    } finally {
      fs.rmSync(localResult.tmpDir, { recursive: true, force: true });
    }
    process.exit(0);
  }

  if (command === 'audit') {
    let localResult;
    try {
      localResult = packAndUnpack(projectDir, false);
    } catch (err) {
      console.error('Failed to pack local directory:', err.message);
      process.exit(2);
    }

    try {
      const localManifest = readManifest(localResult.extractDir);
      const findings = inspectPackage(localResult.extractDir, {
        projectDir,
        manifest: localManifest,
        allowSrc,
        ignoreRules,
      });

      // Calculate sizes
      const unpackedSize = findings
        .filter(f => f.analyzer === 'size' && f.type === 'file-size')
        .reduce((sum, f) => sum + (f.sizeBytes || 0), 0);

      const auditData = {
        findings,
        meta: localManifest,
        compressedSize: localResult.meta.size,
        fileCount: localResult.meta.unpackedSize ? localResult.meta.files.length : findings.length,
        unpackedSize: localResult.meta.unpackedSize || unpackedSize
      };

      if (useJson) {
        reportAuditJson(auditData);
      } else {
        const hasErrors = findings.some(f => f.severity === 'error');
        const hasWarnings = findings.some(f => f.severity === 'warn');
        const exitCode = hasErrors || (failOnWarnings && hasWarnings) ? 1 : 0;

        if (quiet && exitCode === 0) {
          // Silent pass — no output
        } else {
          reportAudit(auditData);
        }

        if (fix) {
          applyFix(findings, projectDir);
        }

        process.exit(exitCode);
      }
    } finally {
      fs.rmSync(localResult.tmpDir, { recursive: true, force: true });
    }
  }
}

module.exports = { main };
