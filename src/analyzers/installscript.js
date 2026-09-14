'use strict';

/**
 * Static behavioral analysis of install scripts.
 *
 * This does NOT execute the script — it reads the source text and classifies
 * what the script appears to do into specific behavioral categories with
 * per-category severity and matched evidence snippets.
 *
 * Categories:
 *   network-access     — HTTP/HTTPS requests, fetch, axios, curl, wget
 *   env-access         — process.env access (especially sensitive vars)
 *   child-process      — exec/spawn/fork, shell command execution
 *   dynamic-eval       — eval(), new Function(), vm.runIn*
 *   fs-home-write      — writes to home directory or system paths
 *   data-exfil-pattern — base64/encoding combined with network access
 *   obfuscated-code    — heavy hex/charCode encoding patterns, encoded eval
 *   dynamic-require    — require(variable) or require(process.env.*)
 */

const CATEGORIES = [
  {
    id: 'network-access',
    severity: 'error',
    label: 'Install script performs network access',
    fix: 'Review whether this package needs to make outbound network requests at install time. Legitimate packages rarely need to.',
    patterns: [
      { re: /require\s*\(\s*['"]https?['"]\s*\)/,             snippet: "require('https')" },
      { re: /\bfetch\s*\(/,                                    snippet: 'fetch(' },
      { re: /\baxios\b/,                                       snippet: 'axios' },
      { re: /\bnode-fetch\b/,                                  snippet: 'node-fetch' },
      { re: /\bgot\s*\(/,                                      snippet: 'got(' },
      { re: /https?:\/\/[^\s'"]{6,}/,                         snippet: 'URL literal (http://...)' },
      { re: /\bcurl\b/,                                        snippet: 'curl' },
      { re: /\bwget\b/,                                        snippet: 'wget' },
      { re: /\.request\s*\(/,                                  snippet: '.request(' },
    ],
  },
  {
    id: 'env-access',
    severity: 'warn',
    label: 'Install script reads environment variables',
    fix: 'Check which environment variables are read and whether they could be used to exfiltrate credentials (e.g. NPM_TOKEN, HOME, PATH).',
    patterns: [
      { re: /process\.env\.NPM_TOKEN/i,                        snippet: 'process.env.NPM_TOKEN' },
      { re: /process\.env\.NODE_AUTH_TOKEN/i,                  snippet: 'process.env.NODE_AUTH_TOKEN' },
      { re: /process\.env\.HOME\b/,                            snippet: 'process.env.HOME' },
      { re: /process\.env\.PATH\b/,                            snippet: 'process.env.PATH' },
      { re: /process\.env\.AWS_/,                              snippet: 'process.env.AWS_*' },
      { re: /process\.env\b/,                                  snippet: 'process.env (generic)' },
    ],
  },
  {
    id: 'child-process',
    severity: 'warn',
    label: 'Install script spawns child processes',
    fix: 'Verify the commands being run. Native module compilation (node-gyp) is legitimate; arbitrary shell commands are not.',
    patterns: [
      { re: /require\s*\(\s*['"]child_process['"]\s*\)/,      snippet: "require('child_process')" },
      { re: /\bexecSync\s*\(/,                                 snippet: 'execSync(' },
      { re: /\bspawnSync\s*\(/,                                snippet: 'spawnSync(' },
      { re: /\bexec\s*\(/,                                     snippet: 'exec(' },
      { re: /\bspawn\s*\(/,                                    snippet: 'spawn(' },
      { re: /\bfork\s*\(/,                                     snippet: 'fork(' },
      { re: /\bshell\s*:\s*true/,                              snippet: 'shell: true' },
    ],
  },
  {
    id: 'dynamic-eval',
    severity: 'error',
    label: 'Install script uses dynamic code evaluation',
    fix: 'eval() and new Function() are strong indicators of obfuscated malicious code. This script should be manually reviewed.',
    patterns: [
      { re: /\beval\s*\(/,                                     snippet: 'eval(' },
      { re: /new\s+Function\s*\(/,                             snippet: 'new Function(' },
      { re: /vm\.runInContext\s*\(/,                           snippet: 'vm.runInContext(' },
      { re: /vm\.runInNewContext\s*\(/,                        snippet: 'vm.runInNewContext(' },
      { re: /vm\.runInThisContext\s*\(/,                       snippet: 'vm.runInThisContext(' },
      { re: /vm\.Script\b/,                                    snippet: 'vm.Script' },
    ],
  },
  {
    id: 'fs-home-write',
    severity: 'warn',
    label: 'Install script writes to home directory or system paths',
    fix: 'Packages writing to ~/.config, /etc, or other system directories at install time deserve close inspection.',
    patterns: [
      { re: /os\.homedir\s*\(\)/,                              snippet: 'os.homedir()' },
      { re: /process\.env\.HOME\s*\+/,                        snippet: 'process.env.HOME +' },
      { re: /['"`]~\//,                                        snippet: '~/ (home path)' },
      { re: /\/etc\//,                                         snippet: '/etc/' },
      { re: /\/usr\/local\//,                                  snippet: '/usr/local/' },
      { re: /fs\.(writeFile|appendFile|mkdir|writeFileSync|appendFileSync|mkdirSync)\s*\([^)]*home/i, snippet: 'fs write to home path' },
    ],
  },
  {
    id: 'data-exfil-pattern',
    severity: 'error',
    label: 'Install script may be exfiltrating data (encoding + network pattern)',
    fix: 'The combination of data encoding and network access is a strong indicator of credential exfiltration. Manually review this script.',
    patterns: [
      { re: /Buffer\.from\([^)]+\)\.toString\s*\(\s*['"]base64['"]\s*\)/,  snippet: 'Buffer.from().toString(base64)' },
      { re: /\bbtoa\s*\(/,                                                   snippet: 'btoa(' },
      { re: /\.toString\s*\(\s*['"]hex['"]\s*\)/,                           snippet: '.toString(hex)' },
      { re: /JSON\.stringify\([^)]*process\.env/,                           snippet: 'JSON.stringify(process.env...)' },
    ],
  },
  {
    id: 'obfuscated-code',
    severity: 'error',
    label: 'Install script appears to contain obfuscated code',
    fix: 'Obfuscated install scripts are a strong indicator of malicious intent. Do not install this package without thorough manual review.',
    patterns: [
      { re: /String\.fromCharCode\s*\(/,                       snippet: 'String.fromCharCode(' },
      { re: /\\x[0-9a-f]{2}\\x[0-9a-f]{2}\\x[0-9a-f]{2}/i,  snippet: 'heavy \\x hex encoding' },
      { re: /atob\s*\(/,                                       snippet: 'atob(' },
      { re: /Buffer\.from\s*\(\s*['"][A-Za-z0-9+/]{40,}={0,2}['"]\s*,\s*['"]base64['"]\s*\)/, snippet: 'Buffer.from(base64string)' },
    ],
  },
  {
    id: 'dynamic-require',
    severity: 'warn',
    label: 'Install script uses dynamic require()',
    fix: 'require(variable) can load arbitrary modules determined at runtime. Verify this is not loading attacker-controlled paths.',
    patterns: [
      { re: /require\s*\(\s*[^'")\s][^)]*\)/,                 snippet: 'require(variable)' },
      { re: /require\s*\(\s*process\.env\./,                   snippet: 'require(process.env.*)' },
    ],
  },
];

/**
 * Analyzes the text content of an install script for suspicious behavioral patterns.
 *
 * @param {string} content    - Source text of the script file
 * @param {string} filePath   - Package-relative path to the script
 * @param {string} hook       - Lifecycle hook name (e.g. 'postinstall')
 * @returns {object[]} Array of behavioral findings
 */
function analyzeContent(content, filePath, hook) {
  const findings = [];
  const lines = content.split('\n');

  // For data-exfil: only fire if BOTH encoding AND network patterns are present
  const hasNetwork = CATEGORIES.find(c => c.id === 'network-access')
    .patterns.some(p => p.re.test(content));

  for (const category of CATEGORIES) {
    // Special case: data-exfil only meaningful if there's also network access
    if (category.id === 'data-exfil-pattern' && !hasNetwork) continue;

    const evidence = [];

    for (const pattern of category.patterns) {
      if (!pattern.re.test(content)) continue;

      // Find the first line number that matches
      let lineNum = null;
      for (let i = 0; i < lines.length; i++) {
        if (pattern.re.test(lines[i])) {
          lineNum = i + 1;
          break;
        }
      }

      evidence.push({
        snippet: pattern.snippet,
        line: lineNum,
      });
    }

    if (evidence.length === 0) continue;

    findings.push({
      analyzer: 'installscript',
      type: 'behavior',
      severity: category.severity,
      id: category.id,
      path: filePath,
      hook,
      label: category.label,
      evidence,
      fix: category.fix,
    });
  }

  return findings;
}

/**
 * Analyzes an inline shell command (when the hook runs a direct command, not a file).
 *
 * @param {string} cmd    - The shell command string from package.json scripts
 * @param {string} hook   - Lifecycle hook name
 * @returns {object[]} Array of behavioral findings
 */
function analyzeInlineCommand(cmd, hook) {
  const findings = [];

  const checks = [
    {
      id: 'network-access',
      severity: 'error',
      label: 'Install hook runs a network command',
      fix: 'Inline network commands in lifecycle hooks are a significant risk. Review this carefully.',
      patterns: [/\bcurl\b/, /\bwget\b/, /\bfetch\b/],
      snippet: 'network command (curl/wget/fetch)',
    },
    {
      id: 'dynamic-eval',
      severity: 'error',
      label: 'Install hook evaluates dynamic code inline',
      fix: 'node -e with inline code in a lifecycle hook is a common malware pattern. Review carefully.',
      patterns: [/node\s+-e\b/, /\beval\s*\(/],
      snippet: 'node -e / eval()',
    },
    {
      id: 'child-process',
      severity: 'warn',
      label: 'Install hook pipes to a shell interpreter',
      fix: 'Piping to bash/sh at install time is high-risk. Verify the source of the piped content.',
      patterns: [/\|\s*(bash|sh|zsh|cmd)\b/],
      snippet: '| bash (pipe to shell)',
    },
  ];

  for (const check of checks) {
    if (check.patterns.some(p => p.test(cmd))) {
      findings.push({
        analyzer: 'installscript',
        type: 'behavior',
        severity: check.severity,
        id: check.id,
        path: 'package.json',
        hook,
        label: check.label,
        evidence: [{ snippet: check.snippet, line: null }],
        fix: check.fix,
      });
    }
  }

  return findings;
}

module.exports = { analyzeContent, analyzeInlineCommand };
