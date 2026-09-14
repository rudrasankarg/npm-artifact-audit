'use strict';

/**
 * Node.js Interceptor Sandbox
 * 
 * This script is injected into the install script process via `node --require ./interceptor.js`.
 * It monkey-patches core Node.js modules to track network, child_process, and fs access,
 * as well as environment variable reads.
 * 
 * Findings are serialized to the file specified in process.env.AUDIT_LOG_PATH.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const child_process = require('child_process');

const logPath = process.env.AUDIT_LOG_PATH;
if (!logPath) {
  console.error('[npm-runtime-audit] Interceptor loaded but AUDIT_LOG_PATH is not set.');
  process.exit(1);
}

// Ensure log file starts empty
fs.writeFileSync(logPath, JSON.stringify([]));

function logEvent(type, severity, id, label, detail) {
  try {
    const current = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    current.push({ type, severity, id, label, detail });
    fs.writeFileSync(logPath, JSON.stringify(current, null, 2));
  } catch (e) {
    console.error('[npm-runtime-audit] Error writing to log:', e);
  }
}

// -----------------------------------------------------------------------------
// 1. Intercept Network Access
// -----------------------------------------------------------------------------

function patchHttpRequest(module, protocol) {
  const originalRequest = module.request;
  module.request = function(...args) {
    let urlInfo = 'unknown';
    if (typeof args[0] === 'string') {
      urlInfo = args[0];
    } else if (args[0] && typeof args[0] === 'object') {
      const opts = args[0];
      const host = opts.hostname || opts.host || '';
      const path = opts.path || '/';
      urlInfo = `${protocol}://${host}${path}`;
    } else if (args[0] instanceof URL) {
      urlInfo = args[0].href;
    }
    
    logEvent('behavior', 'error', 'network-access', 'Network access', `→ ${urlInfo}`);
    return originalRequest.apply(this, args);
  };

  const originalGet = module.get;
  module.get = function(...args) {
    let urlInfo = 'unknown';
    if (typeof args[0] === 'string') {
      urlInfo = args[0];
    } else if (args[0] && typeof args[0] === 'object') {
      const opts = args[0];
      const host = opts.hostname || opts.host || '';
      const path = opts.path || '/';
      urlInfo = `${protocol}://${host}${path}`;
    } else if (args[0] instanceof URL) {
      urlInfo = args[0].href;
    }

    logEvent('behavior', 'error', 'network-access', 'Network access', `→ ${urlInfo}`);
    return originalGet.apply(this, args);
  };
}

patchHttpRequest(http, 'http');
patchHttpRequest(https, 'https');

// Also intercept global fetch if available (Node 18+)
if (typeof global.fetch === 'function') {
  const originalFetch = global.fetch;
  global.fetch = function(...args) {
    const urlInfo = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : 'unknown');
    logEvent('behavior', 'error', 'network-access', 'Network access', `→ fetch(${urlInfo})`);
    return originalFetch.apply(this, args);
  };
}

// -----------------------------------------------------------------------------
// 2. Intercept Child Processes
// -----------------------------------------------------------------------------

const patchChildProcess = (methodName) => {
  const original = child_process[methodName];
  child_process[methodName] = function(...args) {
    const cmd = args[0] || '';
    const argList = Array.isArray(args[1]) ? ` ${args[1].join(' ')}` : '';
    const fullCmd = `${cmd}${argList}`.trim();
    
    // Ignore harmless commands or standard build tools (node-gyp can be noisy but acceptable for now)
    if (fullCmd.includes('node-gyp')) {
      logEvent('behavior', 'info', 'native-module', 'Native module compilation', `→ ${fullCmd}`);
    } else {
      logEvent('behavior', 'warn', 'child-process', 'Child process execution', `→ ${fullCmd}`);
    }
    return original.apply(this, args);
  };
};

['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync'].forEach(patchChildProcess);

// -----------------------------------------------------------------------------
// 3. Intercept Filesystem Writes
// -----------------------------------------------------------------------------

const suspiciousPaths = [
  '.npmrc',
  '.ssh',
  '.aws',
  '.config',
  'etc/',
  'usr/'
];

const patchFsWrite = (methodName) => {
  const original = fs[methodName];
  fs[methodName] = function(...args) {
    const filePath = typeof args[0] === 'number' ? 'file descriptor' : String(args[0]);
    
    // Check if the write targets a sensitive location
    const isSuspicious = suspiciousPaths.some(p => filePath.includes(p)) || 
                         (process.env.HOME && filePath.startsWith(process.env.HOME));

    if (isSuspicious) {
      logEvent('behavior', 'warn', 'filesystem', 'Filesystem write to sensitive path', `→ ${filePath}`);
    }
    
    return original.apply(this, args);
  };
};

['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync'].forEach(patchFsWrite);

// -----------------------------------------------------------------------------
// 4. Intercept Environment Variable Access
// -----------------------------------------------------------------------------

// We proxy process.env to track access to sensitive variables
const originalEnv = process.env;
const sensitiveEnvVars = [
  'NPM_TOKEN', 'NODE_AUTH_TOKEN', 'GITHUB_TOKEN', 'AWS_ACCESS_KEY_ID', 
  'AWS_SECRET_ACCESS_KEY', 'HOME', 'PATH'
];

process.env = new Proxy(originalEnv, {
  get: function(target, prop) {
    if (typeof prop === 'string' && sensitiveEnvVars.includes(prop)) {
      logEvent('behavior', 'warn', 'env-access', 'Environment access', `→ process.env.${prop}`);
    }
    return target[prop];
  }
});
