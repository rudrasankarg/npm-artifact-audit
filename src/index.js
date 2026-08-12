'use strict';

/**
 * npm-publish-guard programmatic API
 *
 * @example
 * const { scan } = require('npm-publish-guard');
 * const result = scan({ directory: '.', allowSrc: false });
 * if (!result.passed) process.exit(1);
 */

const { scanPackage, formatBytes } = require('./scan');

/**
 * Scan an npm package directory for publish safety issues.
 *
 * @param {object}  [opts]
 * @param {string}  [opts.directory=process.cwd()]  Directory to scan
 * @param {boolean} [opts.allowSrc=false]            Suppress src/ warning
 * @param {boolean} [opts.failOnWarnings=false]       Treat warnings as errors
 * @returns {{ passed: boolean, errors: object[], warnings: object[], fileCount: number, totalBytes: number, meta: object }}
 */
function scan(opts = {}) {
  const {
    directory     = process.cwd(),
    allowSrc      = false,
    failOnWarnings = false,
  } = opts;

  const result = scanPackage(directory, { allowSrc });
  const passed = result.errors.length === 0 &&
    (!failOnWarnings || result.warnings.length === 0);

  return { ...result, passed };
}

module.exports = { scan, formatBytes };
