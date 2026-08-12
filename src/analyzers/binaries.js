'use strict';

const fs = require('fs');
const path = require('path');

const BINARY_EXTS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.bin', '.node',
  '.sh', '.bat', '.cmd', '.elf', '.wasm'
]);

/**
 * Checks if a file contains executable magic bytes (ELF, PE, Mach-O).
 */
function hasBinaryMagicBytes(absPath) {
  try {
    const fd = fs.openSync(absPath, 'r');
    const buffer = Buffer.alloc(4);
    const bytesRead = fs.readSync(fd, buffer, 0, 4, 0);
    fs.closeSync(fd);

    if (bytesRead < 2) return false;

    // Windows PE: MZ
    if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
      return 'Windows Executable/DLL (PE)';
    }

    // ELF: \x7fELF
    if (bytesRead >= 4 &&
        buffer[0] === 0x7f &&
        buffer[1] === 0x45 && // E
        buffer[2] === 0x4c && // L
        buffer[3] === 0x46) { // F
      return 'Linux Executable/Library (ELF)';
    }

    // Mach-O macOS: FEEDFACE or FEEDFACF or reverse
    if (bytesRead >= 4) {
      const magic = buffer.readUInt32BE(0);
      const magicLE = buffer.readUInt32LE(0);
      if (magic === 0xfeedface || magic === 0xfeedfacf ||
          magicLE === 0xfeedface || magicLE === 0xfeedfacf) {
        return 'macOS Executable/Library (Mach-O)';
      }
    }
  } catch {}
  return null;
}

/**
 * Analyzes the package files to look for binaries or shell scripts.
 * 
 * @param {string[]} files - Package-relative file paths.
 * @param {object} context - { extractDir: string }
 * @returns {object[]} Findings array.
 */
function analyze(files, { extractDir }) {
  const findings = [];

  for (const file of files) {
    const absPath = path.join(extractDir, file);
    const ext = path.extname(file).toLowerCase();

    // 1. Magic bytes check (highest confidence)
    const magicType = hasBinaryMagicBytes(absPath);
    if (magicType) {
      findings.push({
        analyzer: 'binaries',
        type: 'binary-file',
        severity: 'error',
        id: 'embedded-binary-magic',
        path: file,
        label: `Embedded native binary detected (${magicType})`,
        fix: 'Remove compilation artifacts and native executables from published package.',
      });
      continue;
    }

    // 2. Extension check
    if (BINARY_EXTS.has(ext)) {
      const isShell = ['.sh', '.bat', '.cmd'].includes(ext);
      findings.push({
        analyzer: 'binaries',
        type: isShell ? 'shell-script' : 'binary-file',
        severity: isShell ? 'warn' : 'error',
        id: isShell ? 'shell-script-file' : 'embedded-binary-ext',
        path: file,
        label: `${isShell ? 'Shell script' : 'Binary artifact'} found: "${file}"`,
        fix: isShell 
          ? 'Ensure this script does not execute malicious/untrusted logic.'
          : 'Remove pre-compiled binaries from the package.',
      });
    }
  }

  return findings;
}

module.exports = { analyze };
