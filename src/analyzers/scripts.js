'use strict';

const fs = require('fs');
const path = require('path');
const { analyzeContent, analyzeInlineCommand } = require('./installscript');

const HOOKS = ['preinstall', 'postinstall', 'install', 'prepare'];

/**
 * Resolves local file paths from a shell script execution string.
 * E.g., "node scripts/install.js" -> "scripts/install.js"
 */
function extractLocalFile(cmd, files) {
  const words = cmd.split(/\s+/);
  for (const word of words) {
    const cleanWord = word.replace(/['"]/g, '');
    if (files.includes(cleanWord)) {
      return cleanWord;
    }
    // Handle paths without extension
    const altExts = ['.js', '.sh', '.bat', '.cmd'];
    for (const ext of altExts) {
      const candidate = cleanWord + ext;
      if (files.includes(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * Analyzes the lifecycle scripts in the package manifest for risky execution surfaces.
 * 
 * For each hook:
 *   - If the hook resolves to a local file: runs full behavioral analysis on the file content
 *   - If the hook is an inline shell command: runs inline command analysis
 *   - Either way: always emits an advisory "execution-surface" finding so the hook is visible
 *
 * @param {string[]} files - Package-relative file paths.
 * @param {object} context - { extractDir: string, manifest: object }
 * @returns {object[]} Findings array.
 */
function analyze(files, { extractDir, manifest }) {
  const findings = [];
  const scripts = manifest.scripts || {};

  for (const hook of HOOKS) {
    if (!scripts[hook]) continue;

    const cmd = scripts[hook];
    const localFile = extractLocalFile(cmd, files);

    // Always emit an advisory "hook exists" finding so it's visible in the audit.
    // This is NOT an error — it surfaces the hook for review.
    findings.push({
      analyzer: 'scripts',
      type: 'execution-surface',
      severity: 'info',
      id: `execution-surface-${hook}`,
      path: 'package.json',
      hook,
      label: `Lifecycle hook "${hook}": ${cmd}`,
      localFile: localFile || null,
      fix: 'Review the script content. Native module compilation (node-gyp) is expected; arbitrary network or eval patterns are not.',
    });

    if (localFile) {
      // Deep behavioral analysis of the resolved file
      const absPath = path.join(extractDir, localFile);
      try {
        const content = fs.readFileSync(absPath, 'utf8');
        const behaviorFindings = analyzeContent(content, localFile, hook);
        findings.push(...behaviorFindings);
      } catch {
        // File unreadable — note it but don't crash
        findings.push({
          analyzer: 'scripts',
          type: 'execution-surface',
          severity: 'warn',
          id: `execution-surface-unreadable-${hook}`,
          path: localFile,
          hook,
          label: `Lifecycle hook "${hook}" references a file that could not be read: ${localFile}`,
          fix: 'Verify the file exists and is readable in the published package.',
        });
      }
    } else {
      // Inline command analysis
      const inlineFindings = analyzeInlineCommand(cmd, hook);
      findings.push(...inlineFindings);
    }
  }

  return findings;
}

module.exports = { analyze };
