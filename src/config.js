'use strict';

/**
 * Load and merge configuration from .publish-guardrc.json or package.json#publishGuard.
 *
 * Priority (highest wins):
 *   1. CLI flags
 *   2. .publish-guardrc.json
 *   3. package.json "publishGuard" key
 *   4. Built-in defaults
 */

const fs   = require('fs');
const path = require('path');

const DEFAULTS = {
  allowSrc:       false,
  failOnWarnings:  false,
  quiet:           false,
  ignoreRules:     [],   // array of rule IDs to suppress
};

/**
 * @param {string} dir  Project root directory
 * @returns {object}    Merged config
 */
function loadConfig(dir) {
  // Try .publish-guardrc.json first
  const rcPath = path.join(dir, '.publish-guardrc.json');
  if (fs.existsSync(rcPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(rcPath, 'utf8'));
      return { ...DEFAULTS, ...raw };
    } catch (e) {
      process.stderr.write(`npm-publish-guard: Could not parse .publish-guardrc.json: ${e.message}\n`);
    }
  }

  // Fall back to package.json#publishGuard
  const pkgPath = path.join(dir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.publishGuard && typeof pkg.publishGuard === 'object') {
        return { ...DEFAULTS, ...pkg.publishGuard };
      }
    } catch {
      // ignore parse errors — package.json is already broken
    }
  }

  return { ...DEFAULTS };
}

module.exports = { loadConfig, DEFAULTS };
