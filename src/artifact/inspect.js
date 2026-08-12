'use strict';

const fs = require('fs');
const path = require('path');

const secretsAnalyzer = require('../analyzers/secrets');
const filesAnalyzer = require('../analyzers/files');
const scriptsAnalyzer = require('../analyzers/scripts');
const binariesAnalyzer = require('../analyzers/binaries');
const dependenciesAnalyzer = require('../analyzers/dependencies');
const sizeAnalyzer = require('../analyzers/size');

function walkFiles(dir) {
  const out = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        out.push(full);
      }
    }
  }
  walk(dir);
  return out;
}

/**
 * Runs all modular security and packaging analyzers on the unpacked package.
 * 
 * @param {string} extractDir - The unpacked package directory
 * @param {object} context - { projectDir, manifest, allowSrc }
 * @returns {object[]} Combined findings from all analyzers
 */
function inspectPackage(extractDir, { projectDir, manifest, allowSrc = false } = {}) {
  const absoluteFiles = walkFiles(extractDir);
  const relativeFiles = absoluteFiles.map(abs => path.relative(extractDir, abs).replace(/\\/g, '/'));

  const context = {
    extractDir,
    projectDir: projectDir || extractDir,
    manifest,
    allowSrc,
  };

  const findings = [];
  findings.push(...secretsAnalyzer.analyze(relativeFiles, context));
  findings.push(...filesAnalyzer.analyze(relativeFiles, context));
  findings.push(...scriptsAnalyzer.analyze(relativeFiles, context));
  findings.push(...binariesAnalyzer.analyze(relativeFiles, context));
  findings.push(...dependenciesAnalyzer.analyze(relativeFiles, context));
  findings.push(...sizeAnalyzer.analyze(relativeFiles, context));

  return findings;
}

module.exports = { inspectPackage };
