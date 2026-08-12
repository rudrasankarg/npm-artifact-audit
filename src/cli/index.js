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

function getSha256(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function runReproduce() {
  console.log('\nRunning Reproducibility Check...');
  console.log('Building package twice to compare artifacts...\n');

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
      console.log('\n\x1b[32m✓ Artifacts are identical. Build is reproducible.\x1b[0m\n');
      process.exit(0);
    }

    console.log('\n\x1b[31m✗ Artifacts differ\x1b[0m\n');

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

    console.log('Changed files:');
    changed.forEach(f => console.log(`  - ${f}`));

    console.log('\nPossible causes:');
    console.log('  - Timestamps embedded in assets or bundle files');
    console.log('  - Generated metadata (e.g. build id, compilation dates)');
    console.log('  - Nondeterministic build compilation/bundling steps');
    console.log('');
    process.exit(1);

  } finally {
    fs.rmSync(tmp1, { recursive: true, force: true });
    fs.rmSync(tmp2, { recursive: true, force: true });
  }
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
  --help, -h             Show help message
`);
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] && !args[0].startsWith('-') ? args[0] : 'audit';
  const flags = args.filter(a => a.startsWith('-'));

  if (flags.includes('--help') || flags.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const useJson = flags.includes('--json');
  const allowSrc = flags.includes('--allow-src');
  const failOnWarnings = flags.includes('--fail-on') && args[args.indexOf('--fail-on') + 1] === 'warnings';

  const projectDir = process.cwd();

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
        allowSrc
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
        const passed = reportAudit(auditData);
        const hasErrors = findings.some(f => f.severity === 'error');
        const hasWarnings = findings.some(f => f.severity === 'warn');
        const exitCode = hasErrors || (failOnWarnings && hasWarnings) ? 1 : 0;
        process.exit(exitCode);
      }
    } finally {
      fs.rmSync(localResult.tmpDir, { recursive: true, force: true });
    }
  }
}

module.exports = { main };
