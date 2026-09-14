'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  ignoreRules: [],
  allowSrc: false,
  failOnWarnings: false,
  quiet: false,
};

/**
 * Loads audit config from:
 *   1. package.json#auditConfig  (preferred)
 *   2. .npmauditrc.json          (fallback)
 *
 * Returns a merged config object. Missing keys fall back to DEFAULTS.
 * CLI flags passed via `cliOverrides` always win over file-based config.
 *
 * @param {string} projectDir
 * @param {object} [cliOverrides] - Values explicitly set via CLI flags
 * @returns {object} Resolved config
 */
function loadConfig(projectDir, cliOverrides = {}) {
  let fileConfig = {};

  // 1. Try package.json#auditConfig
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
    if (pkg.auditConfig && typeof pkg.auditConfig === 'object') {
      fileConfig = pkg.auditConfig;
    }
  } catch {}

  // 2. If nothing in package.json, try .npmauditrc.json
  if (Object.keys(fileConfig).length === 0) {
    try {
      const rcPath = path.join(projectDir, '.npmauditrc.json');
      fileConfig = JSON.parse(fs.readFileSync(rcPath, 'utf8'));
    } catch {}
  }

  // Validate ignoreRules is an array of strings
  if (!Array.isArray(fileConfig.ignoreRules)) {
    fileConfig.ignoreRules = [];
  }

  // Merge: DEFAULTS < fileConfig < cliOverrides (cli always wins)
  const resolved = {
    ignoreRules:     fileConfig.ignoreRules     ?? DEFAULTS.ignoreRules,
    allowSrc:        cliOverrides.allowSrc        ?? fileConfig.allowSrc        ?? DEFAULTS.allowSrc,
    failOnWarnings:  cliOverrides.failOnWarnings  ?? fileConfig.failOnWarnings  ?? DEFAULTS.failOnWarnings,
    quiet:           cliOverrides.quiet           ?? fileConfig.quiet           ?? DEFAULTS.quiet,
  };

  return resolved;
}

module.exports = { loadConfig };
