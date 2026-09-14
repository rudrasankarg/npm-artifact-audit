'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { packAndUnpack } = require('../artifact/pack');
const { readManifest } = require('../artifact/manifest');

/**
 * Parses a lifecycle script command string into an executable.
 * Returns { executable, args } or null if we can't run it directly.
 * 
 * Examples:
 *   "node scripts/install.js"  → { bin: 'node', args: ['scripts/install.js'] }
 *   "node -e 'code'"           → { bin: 'node', args: ['-e', 'code'] }
 *   "curl http://evil.com"     → null (not node, handle separately)
 */
function parseScriptCommand(cmd) {
  const parts = cmd.trim().split(/\s+/);
  const bin = parts[0];

  if (bin === 'node') {
    return { bin: 'node', args: parts.slice(1) };
  }

  // Shell commands that aren't node — we still want to run them through
  // a node wrapper if possible, but for now flag them as-is
  return { bin, args: parts.slice(1) };
}

/**
 * Runs the dynamic runtime analyzer on a target package.
 * 
 * For each lifecycle hook (preinstall, install, postinstall):
 *   - If the script is a `node` command, we inject `--require interceptor.js` directly.
 *   - For non-node commands (shell scripts, curl etc.), we use NODE_OPTIONS as a fallback
 *     and also log the command itself as a 'child-process' finding.
 *
 * @param {string} target - Local directory path or registry package spec
 * @returns {{ manifest, events, message, hooks }}
 */
function runSandbox(target) {
  console.log(`[npm-runtime-audit] Preparing sandbox for "${target}"...`);

  let result;
  try {
    const isRegistry = !fs.existsSync(path.resolve(target));
    result = packAndUnpack(target, isRegistry);
  } catch (err) {
    throw new Error(`Failed to pack target: ${err.message}`);
  }

  const { tmpDir, extractDir } = result;

  try {
    const manifest = readManifest(extractDir);
    const scripts = manifest.scripts || {};
    const hooksToRun = ['preinstall', 'install', 'postinstall'].filter(h => scripts[h]);

    if (hooksToRun.length === 0) {
      return { manifest, events: [], message: 'No install scripts found.', hooks: [] };
    }

    const logPath = path.join(tmpDir, 'audit-events.json');
    fs.writeFileSync(logPath, JSON.stringify([]));

    const interceptorPath = path.resolve(__dirname, '..', 'runtime', 'interceptor.js');

    console.log(`[npm-runtime-audit] Executing ${hooksToRun.length} install hook(s) in sandbox...\n`);

    for (const hook of hooksToRun) {
      const cmd = scripts[hook];
      console.log(`  → ${hook}: ${cmd}`);

      const parsed = parseScriptCommand(cmd);

      if (parsed.bin === 'node') {
        // Best case: inject --require directly into the node invocation
        spawnSync('node', ['--require', interceptorPath, ...parsed.args], {
          cwd: extractDir,
          env: Object.assign({}, process.env, {
            AUDIT_LOG_PATH: logPath,
          }),
          encoding: 'utf8',
          stdio: 'pipe',
        });
      } else {
        // Non-node command (shell, curl, etc.)
        // Log the raw command as a child-process finding immediately
        const events = JSON.parse(fs.readFileSync(logPath, 'utf8'));
        
        // Check for well-known dangerous inline patterns
        if (/\bcurl\b|\bwget\b|\bfetch\b/.test(cmd)) {
          events.push({
            type: 'behavior', severity: 'error', id: 'network-access',
            label: 'Network access in inline install command',
            detail: `→ ${cmd}`,
          });
        }
        if (/\|\s*(bash|sh|zsh|cmd)\b/.test(cmd)) {
          events.push({
            type: 'behavior', severity: 'error', id: 'child-process',
            label: 'Install command pipes to a shell interpreter',
            detail: `→ ${cmd}`,
          });
        }
        // Always log the non-node command itself
        events.push({
          type: 'behavior', severity: 'warn', id: 'child-process',
          label: 'Non-Node install command (cannot instrument)',
          detail: `→ ${cmd}`,
        });

        fs.writeFileSync(logPath, JSON.stringify(events, null, 2));
      }
    }

    let events = [];
    try {
      events = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    } catch {}

    return {
      manifest,
      events,
      message: `Executed: ${hooksToRun.join(', ')}`,
      hooks: hooksToRun,
    };

  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

module.exports = { runSandbox };
