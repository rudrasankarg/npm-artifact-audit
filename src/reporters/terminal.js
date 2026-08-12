'use strict';

const IS_TTY = process.stdout.isTTY;
const c = IS_TTY ? {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', white: '\x1b[37m',
} : { reset: '', bold: '', dim: '', red: '', green: '', yellow: '', cyan: '', white: '' };

const bold = s => `${c.bold}${s}${c.reset}`;
const dim = s => `${c.dim}${s}${c.reset}`;
const red = s => `${c.red}${s}${c.reset}`;
const green = s => `${c.green}${s}${c.reset}`;
const yellow = s => `${c.yellow}${s}${c.reset}`;
const cyan = s => `${c.cyan}${s}${c.reset}`;

const HR = dim('─'.repeat(45));

function formatBytes(bytes) {
  const sign = bytes < 0 ? '-' : '';
  const absBytes = Math.abs(bytes);
  if (absBytes >= 1024 * 1024) return `${sign}${(absBytes / 1024 / 1024).toFixed(1)} MB`;
  if (absBytes >= 1024) return `${sign}${(absBytes / 1024).toFixed(1)} KB`;
  return `${sign}${absBytes} B`;
}

/**
 * Renders the terminal audit report.
 */
function reportAudit({ findings, meta, compressedSize, fileCount, unpackedSize }) {
  console.log(`\n${bold('npm-artifact-audit')}\n`);
  console.log(`Package:  ${cyan(meta.name + '@' + meta.version)}`);
  console.log(`Artifact: ${formatBytes(compressedSize)} (compressed)`);
  console.log(`Files:    ${fileCount}`);
  console.log('');

  // 1. Security
  console.log(bold('Security'));
  console.log(HR);
  
  const secrets = findings.filter(f => f.analyzer === 'secrets');
  const binaries = findings.filter(f => f.analyzer === 'binaries' && f.severity === 'error');
  const scripts = findings.filter(f => f.analyzer === 'scripts' && f.severity === 'error');

  if (secrets.length === 0) console.log(`${green('✓')} No credentials detected`);
  else secrets.forEach(s => console.log(`${red('✖')} ${bold(s.path)}:${s.line} — ${s.label}`));

  const privateKeys = findings.filter(f => f.id === 'private-key-file');
  if (privateKeys.length === 0) console.log(`${green('✓')} No private keys detected`);

  if (scripts.length === 0) console.log(`${green('✓')} No suspicious scripts detected`);
  else scripts.forEach(s => console.log(`${red('✖')} Suspicious script run: ${s.label}`));

  if (binaries.length === 0) console.log(`${green('✓')} No executable binaries detected`);
  else binaries.forEach(b => console.log(`${red('✖')} Binary detected: ${b.path}`));
  console.log('');

  // 2. Packaging
  console.log(bold('Packaging'));
  console.log(HR);
  
  const packaging = findings.filter(f => f.analyzer === 'files' || (f.analyzer === 'size' && f.severity !== 'info'));
  if (packaging.length === 0) {
    console.log(`${green('✓')} No packaging warnings`);
  } else {
    packaging.forEach(p => {
      console.log(`${yellow('⚠')}  ${bold(p.path)}`);
      console.log(`   ${dim(p.label)}`);
    });
  }
  console.log('');

  // 3. Dependency Surface
  console.log(bold('Dependency surface'));
  console.log(HR);
  
  const depSummary = findings.find(f => f.id === 'dependency-surface');
  const depScripts = findings.find(f => f.id === 'dependencies-with-install-scripts');

  if (depSummary) {
    console.log(`${depSummary.count > 10 ? yellow('⚠') : green('✓')}  ${depSummary.label}`);
  }
  if (depScripts) {
    console.log(`${yellow('⚠')}  ${depScripts.label}`);
    depScripts.dependencies.forEach(d => console.log(`   - ${d.name} (${d.hooks.join(', ')})`));
  } else {
    console.log(`${green('✓')}  No production dependencies with install scripts`);
  }
  console.log('');

  // 4. Artifact Specs
  console.log(bold('Artifact'));
  console.log(HR);
  console.log(`Files:       ${fileCount}`);
  console.log(`Compressed:  ${formatBytes(compressedSize)}`);
  console.log(`Unpacked:    ${formatBytes(unpackedSize)}`);
  console.log('');

  // Final Result
  const errors = findings.filter(f => f.severity === 'error');
  const warnings = findings.filter(f => f.severity === 'warn');

  if (errors.length > 0) {
    console.log(`${red(bold('Result: FAIL'))}`);
    return false;
  } else if (warnings.length > 0) {
    console.log(`${yellow(bold('Result: PASS WITH WARNINGS'))}`);
    return true;
  } else {
    console.log(`${green(bold('Result: PASS'))}`);
    return true;
  }
}

/**
 * Renders the terminal diff report.
 */
function reportDiff(diff) {
  if (diff.isNewPackage) {
    console.log(`\n${bold('Artifact diff')}: First publish of ${cyan(diff.currentVersion)} (new package)`);
    console.log(HR);
    console.log(`${green('✓')} Package is new to the registry.`);
    console.log(`Files in package: ${diff.addedFiles.length}`);
    console.log(`Unpacked size:    ${formatBytes(diff.sizeDiff.currentTotal)}`);
    console.log('');
    return;
  }

  console.log(`\n${bold('Artifact diff')}: ${cyan(diff.prevVersion)} → ${cyan(diff.currentVersion)}\n`);

  if (diff.addedFiles.length > 0) {
    console.log(bold('Added files:'));
    diff.addedFiles.forEach(f => console.log(`  ${green('+')} ${f.name} (${formatBytes(f.size)})`));
    console.log('');
  }

  if (diff.removedFiles.length > 0) {
    console.log(bold('Removed files:'));
    diff.removedFiles.forEach(f => console.log(`  ${red('-')} ${f.name} (${formatBytes(f.size)})`));
    console.log('');
  }

  if (diff.changedFiles.length > 0) {
    console.log(bold('Changed files:'));
    diff.changedFiles.forEach(f => {
      const sign = f.diffSize >= 0 ? '+' : '';
      console.log(`    ${f.name}  ${dim(`${formatBytes(f.oldSize)} → ${formatBytes(f.newSize)}`)} (${sign}${formatBytes(f.diffSize)})`);
    });
    console.log('');
  }

  if (diff.addedDependencies.length > 0 || diff.removedDependencies.length > 0) {
    console.log(bold('Dependencies:'));
    diff.addedDependencies.forEach(d => console.log(`  ${green('+')} ${d}`));
    diff.removedDependencies.forEach(d => console.log(`  ${red('-')} ${d}`));
    console.log('');
  }

  if (diff.addedExecutionSurface.length > 0) {
    console.log(`${yellow(bold('⚠ NEW EXECUTION SURFACE'))}`);
    diff.addedExecutionSurface.forEach(s => {
      console.log(`  ${bold(s.hook)}: ${s.command}`);
    });
    console.log('');
  }

  const pct = diff.sizeDiff.prevTotal > 0 
    ? ((diff.sizeDiff.diff / diff.sizeDiff.prevTotal) * 100).toFixed(0)
    : 0;

  console.log(bold('Artifact Size'));
  console.log(HR);
  console.log(`Previous:    ${formatBytes(diff.sizeDiff.prevTotal)}`);
  console.log(`Current:     ${formatBytes(diff.sizeDiff.currentTotal)}`);
  if (diff.sizeDiff.diff !== 0) {
    const sign = diff.sizeDiff.diff > 0 ? '+' : '';
    console.log(`Difference:  ${sign}${formatBytes(diff.sizeDiff.diff)} (${sign}${pct}%)`);
  }
  console.log('');

  const requiresReview = diff.addedExecutionSurface.length > 0 || diff.addedDependencies.length > 0;
  if (requiresReview) {
    console.log(`${yellow(bold('Result: REVIEW REQUIRED'))}`);
  } else {
    console.log(`${green(bold('Result: PASS'))}`);
  }
}

module.exports = { reportAudit, reportDiff, formatBytes };
