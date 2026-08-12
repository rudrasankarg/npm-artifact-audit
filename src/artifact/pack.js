'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const tar = require('tar');

/**
 * Packs a target (directory or registry package identifier) and extracts it.
 * 
 * @param {string} target - Path to local directory or package spec (e.g. "@scope/pkg@1.0.0")
 * @param {boolean} isRegistry - True if target is a registry spec, false if local dir
 * @returns {{ tmpDir: string, extractDir: string, meta: object }}
 */
function packAndUnpack(target, isRegistry = false) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-artifact-audit-'));

  const args = ['pack', '--json', '--pack-destination', tmpDir];
  if (isRegistry) {
    args.push(target);
  }

  const runCwd = isRegistry ? os.tmpdir() : path.resolve(target);
  const result = spawnSync('npm', args, {
    cwd: runCwd,
    encoding: 'utf8',
    shell: true,
  });

  if (result.status !== 0 || result.error) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const detail = result.error ? result.error.message : (result.stderr || '').trim();
    throw new Error(
      `\`npm pack\` failed ${isRegistry ? `for registry package "${target}"` : `in folder "${target}"`}.\n` +
      (detail ? `Detail:\n${detail}` : '')
    );
  }

  let meta;
  try {
    const parsed = JSON.parse(result.stdout);
    meta = Array.isArray(parsed) ? parsed[0] : parsed;
  } catch {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw new Error('Could not parse `npm pack --json` output. Please ensure npm is installed and working.');
  }

  const tarballPath = path.join(tmpDir, meta.filename);
  const extractDir = path.join(tmpDir, 'extracted');
  fs.mkdirSync(extractDir);

  tar.extract({ file: tarballPath, cwd: extractDir, sync: true });

  // npm pack extracts files into a subfolder named 'package/'
  const packageDir = path.join(extractDir, 'package');
  if (!fs.existsSync(packageDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw new Error('Tarball did not contain expected "package/" directory.');
  }

  return {
    tmpDir,
    extractDir: packageDir,
    meta,
  };
}

module.exports = { packAndUnpack };
