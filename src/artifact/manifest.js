'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Reads and parses the package.json manifest from the extracted package directory.
 * 
 * @param {string} extractDir - The directory where the package tarball was extracted.
 * @returns {object} The parsed package.json object.
 */
function readManifest(extractDir) {
  const pkgJsonPath = path.join(extractDir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    throw new Error(`package.json not found in unpacked directory: ${extractDir}`);
  }
  try {
    return JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse package.json: ${err.message}`);
  }
}

module.exports = { readManifest };
