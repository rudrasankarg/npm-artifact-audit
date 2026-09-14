'use strict';

const { runSandbox } = require('../runtime/sandbox');

const IS_TTY = process.stdout.isTTY;
const c = IS_TTY ? {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', white: '\x1b[37m',
} : { reset: '', bold: '', dim: '', red: '', green: '', yellow: '', cyan: '', white: '' };

const bold = s => `${c.bold}${s}${c.reset}`;
const dim = s => `${c.dim}${s}${c.reset}`;
const red = s => `${c.red}${s}${c.reset}`;
const green = s => `${c.green}${s}${c.reset}`;
const yellow = s => `${c.yellow}${s}${c.reset}`;
const cyan = s => `${c.cyan}${s}${c.reset}`;

const HR = dim('─'.repeat(45));

function reportRuntime(target, result) {
  const { manifest, events, message } = result;
  
  console.log('\n' + bold('npm-runtime-audit'));
  console.log('');
  console.log(`Package:  ${bold(manifest.name || target)}@${manifest.version || 'unknown'}`);
  console.log(`Status:   ${message}`);
  console.log('');

  console.log(bold('BEHAVIOR'));
  console.log(HR);

  if (events.length === 0) {
    if (message === 'No install scripts found.') {
      console.log(`${green('✓')} No lifecycle scripts to execute.`);
    } else {
      console.log(`${green('✓')} Scripts executed cleanly with no tracked system behavior.`);
    }
    console.log('');
    console.log(`Result: ${green('PASS')}\n`);
    process.exit(0);
  }

  // Group events by ID
  const grouped = {};
  for (const ev of events) {
    if (!grouped[ev.id]) {
      grouped[ev.id] = {
        severity: ev.severity,
        label: ev.label,
        details: new Set()
      };
    }
    grouped[ev.id].details.add(ev.detail);
  }

  // Sort by severity (error -> warn -> info)
  const sortedIds = Object.keys(grouped).sort((a, b) => {
    const sevA = grouped[a].severity;
    const sevB = grouped[b].severity;
    if (sevA === sevB) return 0;
    if (sevA === 'error') return -1;
    if (sevB === 'error') return 1;
    if (sevA === 'warn') return -1;
    return 1;
  });

  for (const id of sortedIds) {
    const group = grouped[id];
    let sevLabel = '';
    if (group.severity === 'error') sevLabel = red('HIGH  ');
    else if (group.severity === 'warn') sevLabel = yellow('MEDIUM');
    else sevLabel = cyan('INFO  ');

    console.log(`${sevLabel} ${bold(group.label)}`);
    for (const detail of group.details) {
      console.log(`       ${dim(detail)}`);
    }
    console.log('');
  }

  const hasErrors = events.some(e => e.severity === 'error');
  const hasWarnings = events.some(e => e.severity === 'warn');

  if (hasErrors || hasWarnings) {
    console.log(`Result: ${red('REVIEW REQUIRED')}\n`);
    process.exit(1);
  } else {
    console.log(`Result: ${green('PASS')}\n`);
    process.exit(0);
  }
}

function executeRuntimeCommand(args) {
  const target = args[0];
  if (!target) {
    console.error('Error: Please specify a package to audit. E.g. "npx npm-artifact-audit runtime some-package"');
    process.exit(2);
  }

  let result;
  try {
    result = runSandbox(target);
  } catch (err) {
    console.error(`\nError: ${err.message}\n`);
    process.exit(2);
  }

  reportRuntime(target, result);
}

module.exports = { executeRuntimeCommand };
