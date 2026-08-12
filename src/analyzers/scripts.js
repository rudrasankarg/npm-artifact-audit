'use strict';

const fs = require('fs');
const path = require('path');

const HOOKS = ['preinstall', 'postinstall', 'install', 'prepare'];

const RISKY_PATTERNS = [
  { name: 'spawns child_process', re: /(child_process|spawn|exec|fork|execSync|spawnSync)/ },
  { name: 'accesses environment variables', re: /process\.env/ },
  { name: 'performs network request', re: /(http|https|fetch|axios|curl|wget|urllib|needle)/ },
  { name: 'writes or deletes files', re: /(fs\.(writeFile|appendFile|mkdir|rm|unlink|writeFileSync|appendFileSync|mkdirSync|rmSync|unlinkSync))/ },
];

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
 * @param {string[]} files - Package-relative file paths.
 * @param {object} context - { extractDir: string, manifest: object }
 * @returns {object[]} Findings array.
 */
function analyze(files, { extractDir, manifest }) {
  const findings = [];
  const scripts = manifest.scripts || {};

  for (const hook of HOOKS) {
    if (scripts[hook]) {
      const cmd = scripts[hook];
      const localFile = extractLocalFile(cmd, files);

      const details = [];
      let riskLevel = 'LOW';

      if (localFile) {
        const absPath = path.join(extractDir, localFile);
        try {
          const content = fs.readFileSync(absPath, 'utf8');
          for (const pattern of RISKY_PATTERNS) {
            if (pattern.re.test(content)) {
              details.push(pattern.name);
            }
          }
        } catch {}
      } else {
        // Direct command checks
        if (cmd.includes('curl') || cmd.includes('wget') || cmd.includes('fetch')) {
          details.push('performs network request');
        }
        if (cmd.includes('node -e') || cmd.includes('eval(')) {
          details.push('evaluates dynamic code');
        }
      }

      if (details.length >= 3) {
        riskLevel = 'HIGH';
      } else if (details.length > 0) {
        riskLevel = 'MEDIUM';
      }

      findings.push({
        analyzer: 'scripts',
        type: 'execution-surface',
        severity: riskLevel === 'HIGH' ? 'error' : 'warn',
        id: `execution-surface-${hook}`,
        path: 'package.json',
        label: `Execution surface detected in lifecycle hook "${hook}": "${cmd}"`,
        riskLevel,
        details,
        localFile,
        fix: 'Avoid runtime hooks if possible, or verify the safety of this installer script.',
      });
    }
  }

  return findings;
}

module.exports = { analyze };
