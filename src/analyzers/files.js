'use strict';

const fs = require('fs');
const path = require('path');

const FILENAME_RULES = [
  { id: 'env-file', severity: 'error', label: '.env file — may contain API keys or secrets', fix: "Add '.env*' to .npmignore or use the 'files' field in package.json.", re: /(^|\/)\.env(\.[a-z0-9._-]+)?$/i },
  { id: 'npm-auth', severity: 'error', label: '.npmrc — may contain auth tokens for private registries', fix: "Add '.npmrc' to .npmignore.", re: /(^|\/)\.npmrc$/i },
  { id: 'aws-credentials', severity: 'error', label: '.aws/credentials — AWS credentials file', fix: "Add '.aws/' to .npmignore.", re: /(^|\/)\.aws\/credentials$/i },
  { id: 'ssh-key', severity: 'error', label: 'SSH private key', fix: 'Remove this file from your project directory or add it to .npmignore.', re: /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i },
  { id: 'private-key-file', severity: 'error', label: 'Private key / certificate file (.pem, .key, .pfx, .p12)', fix: 'Remove this file from your project directory or add it to .npmignore.', re: /\.(pem|key|pfx|p12|crt|cer)$/i },
  { id: 'source-map', severity: 'error', label: 'Source map — exposes your full unminified source code', fix: "Add '*.map' to .npmignore, or set sourceMap: false in your bundler config.", re: /\.map$/i },
  { id: 'git-dir', severity: 'error', label: '.git or .svn directory — version control internals', fix: "Add '.git/' to .npmignore.", re: /(^|\/)\.git\//i },
  { id: 'claude-settings', severity: 'error', label: '.claude/settings.local.json — Claude Code config, may contain tokens', fix: "Add '.claude/' to .npmignore.", re: /(^|\/)\.claude\/settings\.local\.json$/i },
  { id: 'cursor-settings', severity: 'error', label: '.cursor/settings.json — Cursor AI editor config, may contain tokens or paths', fix: "Add '.cursor/' to .npmignore.", re: /(^|\/)\.cursor\/settings\.json$/i },
  { id: 'google-credentials', severity: 'error', label: 'Google OAuth credentials file', fix: 'Remove this file or add it to .npmignore.', re: /(^|\/)credentials\.json$/i },
  { id: 'google-service-account', severity: 'error', label: 'Google Cloud service account key', fix: 'Remove this file or add it to .npmignore.', re: /service.?account.*\.json$/i },
  { id: 'local-db', severity: 'error', label: 'Local database file (.sqlite, .db)', fix: 'Add this file to .npmignore.', re: /\.(sqlite|sqlite3|db)$/i },
  { id: 'shell-history', severity: 'error', label: 'Shell history file', fix: 'Add this file to .npmignore.', re: /(^|\/)\.(bash|zsh|fish)_history$/i },
  { id: 'netrc', severity: 'error', label: '.netrc — credential store for curl, wget, etc.', fix: "Add '.netrc' to .npmignore.", re: /(^|\/)\.netrc$/i },
  { id: 'docker-config', severity: 'error', label: '.docker/config.json — Docker registry credentials', fix: "Add '.docker/' to .npmignore.", re: /(^|\/)\.docker\/config\.json$/i },

  // Warnings
  { id: 'test-files', severity: 'warn', label: 'Test files — usually not needed by package consumers', fix: "Use the 'files' field in package.json or .npmignore to exclude tests.", re: /(\.test\.|\.spec\.|(^|\/)__tests__\/|(^|\/)test\/)/i },
  { id: 'ide-files', severity: 'warn', label: 'IDE / editor config directory (.vscode, .idea, .cursor)', fix: "Add '.vscode/', '.idea/', '.cursor/' to .npmignore.", re: /(^|\/)\.(vscode|idea|cursor)\//i },
  { id: 'tooling-config', severity: 'warn', label: 'Internal tooling config — usually not needed by consumers', fix: "Use the 'files' field in package.json to only include what consumers need.", re: /(^|\/)(\.eslintrc.*|\.prettierrc.*|jest\.config\.[jt]s|\.babelrc.*|tsconfig\..*\.json|\.stylelintrc.*)$/i },
  { id: 'log-file', severity: 'warn', label: 'Log file — may contain sensitive output or stack traces', fix: "Add '*.log' to .npmignore.", re: /\.log$/i },
  { id: 'src-directory', severity: 'warn', label: 'Raw src/ directory — consumers typically only need the built output', fix: "Use the 'files' field in package.json to ship only your dist/ or build/ folder.", re: /(^|\/)src\//i },
];

const DEFAULT_NPM_INCLUDES = [
  /^package\.json$/i,
  /^README(\..*)?$/i,
  /^(LICENSE|LICENCE)(\..*)?$/i,
  /^CHANGELOG(\..*)?$/i,
];

function matchPattern(pattern, filePath) {
  const clean = pattern.replace(/^\.\//, '');
  const escaped = clean
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*');
  const regex = new RegExp(`^${escaped}(/|$)`);
  return regex.test(filePath) || filePath.startsWith(clean + '/');
}

/**
 * Explains why a file is included in the package.
 * 
 * @param {string} relPath - Package-relative path (e.g. "dist/index.js")
 * @param {string} projectDir - Path to package root directory
 * @param {object} manifest - Parsed package.json
 * @returns {{ reason: string, suggestion: string }}
 */
function explainInclusion(relPath, projectDir, manifest = {}) {
  // 1. Check if it's a default npm include
  for (const re of DEFAULT_NPM_INCLUDES) {
    if (re.test(relPath)) {
      return {
        reason: 'Default npm inclusion (always shipped by npm regardless of config)',
        suggestion: 'No fix needed; these files are required for npm packages.',
      };
    }
  }

  // 2. Check if it's the main entry point
  if (manifest.main && path.normalize(manifest.main) === path.normalize(relPath)) {
    return {
      reason: `package.json → main ("${manifest.main}")`,
      suggestion: 'Always shipped by npm as the package entry point.',
    };
  }

  // 3. Check if files field is defined in package.json
  if (manifest.files && Array.isArray(manifest.files)) {
    for (const pattern of manifest.files) {
      if (matchPattern(pattern, relPath)) {
        return {
          reason: `package.json → files → ["${pattern}"]`,
          suggestion: `.npmignore cannot exclude this file because it is explicitly whitelisted in package.json's "files" array. Remove this file or directory from the "files" array in package.json.`,
        };
      }
    }
    return {
      reason: 'Included automatically as a dependency or side-effect of package.json files array',
      suggestion: 'Remove it from the workspace before running pack, or adjust your build pipeline.',
    };
  }

  // 4. No files field: check .npmignore or .gitignore
  const npmignorePath = path.join(projectDir, '.npmignore');
  const gitignorePath = path.join(projectDir, '.gitignore');

  if (fs.existsSync(npmignorePath)) {
    return {
      reason: 'No "files" whitelist in package.json, and the file was not matched by .npmignore',
      suggestion: `Add "${relPath}" or matching pattern to .npmignore.`,
    };
  }

  if (fs.existsSync(gitignorePath)) {
    return {
      reason: 'No "files" whitelist in package.json or .npmignore, and the file was not matched by .gitignore',
      suggestion: `Add "${relPath}" to .gitignore, or create a .npmignore file and add it there.`,
    };
  }

  return {
    reason: 'No "files" whitelist, .npmignore, or .gitignore exists; all workspace files are included by default',
    suggestion: 'Create a .npmignore file or use the "files" field in package.json to restrict published files.',
  };
}

/**
 * Analyzes the unpacked files for filename issues.
 * 
 * @param {string[]} files - Package-relative file paths.
 * @param {object} context - { extractDir: string, manifest: object, allowSrc: boolean }
 * @returns {object[]} Findings array.
 */
function analyze(files, { extractDir, manifest, allowSrc }) {
  const findings = [];

  for (const file of files) {
    const absPath = path.join(extractDir, file);
    let sizeBytes = 0;
    try {
      sizeBytes = fs.statSync(absPath).size;
    } catch {}

    for (const rule of FILENAME_RULES) {
      if (rule.id === 'src-directory' && allowSrc) continue;
      if (rule.re.test(file)) {
        const explanation = explainInclusion(file, extractDir, manifest);
        findings.push({
          analyzer: 'files',
          type: 'filename',
          severity: rule.severity,
          id: rule.id,
          path: file,
          sizeBytes,
          label: rule.label,
          fix: rule.fix,
          explanation: explanation.reason,
          suggestion: explanation.suggestion,
        });
      }
    }
  }

  return findings;
}

module.exports = { analyze, explainInclusion };
