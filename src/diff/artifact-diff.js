'use strict';

const fs = require('fs');
const path = require('path');
const { packAndUnpack } = require('../artifact/pack');
const { readManifest } = require('../artifact/manifest');

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
 * Helper to get a file map of { relativePath: sizeBytes }
 */
function getFileMap(dir) {
  const files = walkFiles(dir);
  const map = {};
  for (const absPath of files) {
    const rel = path.relative(dir, absPath).replace(/\\/g, '/');
    let size = 0;
    try {
      size = fs.statSync(absPath).size;
    } catch {}
    map[rel] = size;
  }
  return map;
}

/**
 * Diffs the local package against a registry version.
 * 
 * @param {string} localDir - Path to local package directory
 * @param {object} localManifest - Parsed package.json of the local package
 * @param {string} localExtractDir - Extracted directory of the local package pack
 * @param {string} [targetVersion="latest"] - Target registry version to diff against
 * @returns {object} The comparison results.
 */
function diffArtifact(localDir, localManifest, localExtractDir, targetVersion = 'latest') {
  const pkgName = localManifest.name;
  if (!pkgName) {
    throw new Error('Local package.json does not have a "name" field.');
  }

  const spec = `${pkgName}@${targetVersion}`;
  let registryResult;
  let isNewPackage = false;

  try {
    registryResult = packAndUnpack(spec, true);
  } catch (err) {
    // If the package is not published, or name is not registered, pack will fail.
    // We treat this gracefully.
    isNewPackage = true;
  }

  const localFiles = getFileMap(localExtractDir);

  if (isNewPackage) {
    return {
      isNewPackage: true,
      prevVersion: null,
      currentVersion: localManifest.version,
      addedFiles: Object.keys(localFiles).map(name => ({ name, size: localFiles[name] })),
      removedFiles: [],
      changedFiles: [],
      addedDependencies: Object.keys(localManifest.dependencies || []),
      removedDependencies: [],
      addedExecutionSurface: Object.keys(localManifest.scripts || {}).filter(k => ['preinstall', 'postinstall', 'install', 'prepare'].includes(k)),
      sizeDiff: {
        prevTotal: 0,
        currentTotal: Object.values(localFiles).reduce((a, b) => a + b, 0),
      }
    };
  }

  const { tmpDir: regTmpDir, extractDir: regExtractDir, meta: regMeta } = registryResult;
  
  try {
    const regManifest = readManifest(regExtractDir);
    const regFiles = getFileMap(regExtractDir);

    const addedFiles = [];
    const removedFiles = [];
    const changedFiles = [];

    // Diff files
    for (const file of Object.keys(localFiles)) {
      if (regFiles[file] === undefined) {
        addedFiles.push({ name: file, size: localFiles[file] });
      } else if (regFiles[file] !== localFiles[file]) {
        changedFiles.push({
          name: file,
          oldSize: regFiles[file],
          newSize: localFiles[file],
          diffSize: localFiles[file] - regFiles[file],
        });
      }
    }

    for (const file of Object.keys(regFiles)) {
      if (localFiles[file] === undefined) {
        removedFiles.push({ name: file, size: regFiles[file] });
      }
    }

    // Diff dependencies
    const localDeps = Object.keys(localManifest.dependencies || {});
    const regDeps = Object.keys(regManifest.dependencies || {});

    const addedDependencies = localDeps.filter(d => !regDeps.includes(d));
    const removedDependencies = regDeps.filter(d => !localDeps.includes(d));

    // Diff execution surface
    const HOOKS = ['preinstall', 'postinstall', 'install', 'prepare'];
    const localScripts = localManifest.scripts || {};
    const regScripts = regManifest.scripts || {};

    const addedExecutionSurface = [];
    for (const hook of HOOKS) {
      if (localScripts[hook] && !regScripts[hook]) {
        addedExecutionSurface.push({ hook, command: localScripts[hook] });
      } else if (localScripts[hook] && regScripts[hook] && localScripts[hook] !== regScripts[hook]) {
        addedExecutionSurface.push({ hook, command: localScripts[hook], oldCommand: regScripts[hook], modified: true });
      }
    }

    const prevTotal = Object.values(regFiles).reduce((a, b) => a + b, 0);
    const currentTotal = Object.values(localFiles).reduce((a, b) => a + b, 0);

    return {
      isNewPackage: false,
      prevVersion: regManifest.version,
      currentVersion: localManifest.version,
      addedFiles,
      removedFiles,
      changedFiles,
      addedDependencies,
      removedDependencies,
      addedExecutionSurface,
      sizeDiff: {
        prevTotal,
        currentTotal,
        diff: currentTotal - prevTotal,
      }
    };
  } finally {
    // Cleanup registry temporary directory
    fs.rmSync(regTmpDir, { recursive: true, force: true });
  }
}

module.exports = { diffArtifact };
