'use strict';

const fs = require('fs');
const { packAndUnpack } = require('./artifact/pack');
const { readManifest } = require('./artifact/manifest');
const { inspectPackage } = require('./artifact/inspect');

/**
 * Programmatic API to audit an npm package directory.
 * 
 * @param {object} opts
 * @param {string} [opts.directory=process.cwd()] - Directory to scan
 * @param {boolean} [opts.allowSrc=false] - Suppress raw src/ warnings
 * @returns {Promise<{ findings: object[], meta: object, compressedSize: number, unpackedSize: number }>}
 */
async function audit(opts = {}) {
  const directory = opts.directory || process.cwd();
  const allowSrc = opts.allowSrc || false;

  const localResult = packAndUnpack(directory, false);
  try {
    const manifest = readManifest(localResult.extractDir);
    const findings = inspectPackage(localResult.extractDir, {
      projectDir: directory,
      manifest,
      allowSrc,
    });
    return {
      findings,
      meta: manifest,
      compressedSize: localResult.meta.size,
      unpackedSize: localResult.meta.unpackedSize || localResult.meta.size,
    };
  } finally {
    fs.rmSync(localResult.tmpDir, { recursive: true, force: true });
  }
}

module.exports = { audit };
