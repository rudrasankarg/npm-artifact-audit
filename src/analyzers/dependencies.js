'use strict';

const fs = require('fs');
const path = require('path');

const INSTALL_HOOKS = ['preinstall', 'postinstall', 'install'];

/**
 * Checks if a locally installed dependency contains install hooks.
 */
function checkDependencyHooks(depName, projectDir) {
  const depPkgPath = path.join(projectDir, 'node_modules', depName, 'package.json');
  if (fs.existsSync(depPkgPath)) {
    try {
      const depPkg = JSON.parse(fs.readFileSync(depPkgPath, 'utf8'));
      const scripts = depPkg.scripts || {};
      const foundHooks = INSTALL_HOOKS.filter(hook => !!scripts[hook]);
      if (foundHooks.length > 0) {
        return foundHooks;
      }
    } catch {}
  }
  return null;
}

/**
 * Analyzes package dependencies for security surface.
 * 
 * @param {string[]} files - Package-relative file paths.
 * @param {object} context - { extractDir: string, manifest: object, projectDir: string }
 * @returns {object[]} Findings array.
 */
function analyze(files, { extractDir, manifest, projectDir }) {
  const findings = [];
  const deps = Object.keys(manifest.dependencies || {});
  
  if (deps.length > 0) {
    findings.push({
      analyzer: 'dependencies',
      type: 'dependency-count',
      severity: deps.length > 15 ? 'warn' : 'info',
      id: 'dependency-surface',
      path: 'package.json',
      label: `${deps.length} production dependenc${deps.length === 1 ? 'y' : 'ies'} listed`,
      count: deps.length,
      fix: 'Review dependencies regularly to keep your dependency surface minimal.',
    });

    const depsWithScripts = [];
    for (const dep of deps) {
      // Check projectDir's node_modules first, fallback to extractDir's parent node_modules
      const hooks = checkDependencyHooks(dep, projectDir || extractDir);
      if (hooks) {
        depsWithScripts.push({ name: dep, hooks });
      }
    }

    if (depsWithScripts.length > 0) {
      findings.push({
        analyzer: 'dependencies',
        type: 'dependency-install-scripts',
        severity: 'warn',
        id: 'dependencies-with-install-scripts',
        path: 'package.json',
        label: `${depsWithScripts.length} production package${depsWithScripts.length === 1 ? ' contains' : 's contain'} install scripts`,
        dependencies: depsWithScripts,
        fix: 'Audit these dependencies to ensure they do not run dangerous code during installation.',
      });
    }
  }

  return findings;
}

module.exports = { analyze };
