'use strict';

const fs = require('fs');
const path = require('path');

const SIZE_RULES = {
  warnBytes: 5 * 1024 * 1024,      // 5 MB
  errorBytes: 20 * 1024 * 1024,    // 20 MB
  totalErrorBytes: 20 * 1024 * 1024, // 20 MB total unpacked
};

/**
 * Analyzes file sizes and package size.
 * 
 * @param {string[]} files - Package-relative file paths.
 * @param {object} context - { extractDir: string }
 * @returns {object[]} Findings array.
 */
function analyze(files, { extractDir }) {
  const findings = [];
  let totalBytes = 0;

  for (const file of files) {
    const absPath = path.join(extractDir, file);
    let sizeBytes = 0;
    try {
      sizeBytes = fs.statSync(absPath).size;
    } catch {
      continue;
    }

    totalBytes += sizeBytes;

    if (sizeBytes >= SIZE_RULES.errorBytes) {
      findings.push({
        analyzer: 'size',
        type: 'file-size',
        severity: 'error',
        id: 'large-file-extreme',
        path: file,
        sizeBytes,
        label: `File size is very large (${(sizeBytes / 1024 / 1024).toFixed(2)} MB)`,
        fix: 'Exclude this file from publication if it is not necessary.',
      });
    } else if (sizeBytes >= SIZE_RULES.warnBytes) {
      findings.push({
        analyzer: 'size',
        type: 'file-size',
        severity: 'warn',
        id: 'large-file',
        path: file,
        sizeBytes,
        label: `File size is large (${(sizeBytes / 1024 / 1024).toFixed(2)} MB)`,
        fix: 'Double-check if this file is required by consumers.',
      });
    }
  }

  if (totalBytes >= SIZE_RULES.totalErrorBytes) {
    findings.push({
      analyzer: 'size',
      type: 'package-size',
      severity: 'error',
      id: 'package-too-large',
      path: '(whole package)',
      sizeBytes: totalBytes,
      label: `Total package unpacked size is very large (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`,
      fix: 'Use the "files" field in package.json to exclude non-essential files.',
    });
  } else {
    findings.push({
      analyzer: 'size',
      type: 'package-size',
      severity: 'info',
      id: 'package-size-summary',
      path: '(whole package)',
      sizeBytes: totalBytes,
      label: `Total package unpacked size is ${(totalBytes / 1024 / 1024).toFixed(2)} MB`,
    });
  }

  return findings;
}

module.exports = { analyze, SIZE_RULES };
