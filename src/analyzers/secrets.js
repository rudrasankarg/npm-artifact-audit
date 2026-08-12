'use strict';

const fs = require('fs');
const path = require('path');

const MAX_CONTENT_SCAN_BYTES = 1 * 1024 * 1024;

const SKIP_CONTENT_SCAN_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.zip', '.gz', '.tgz', '.tar', '.rar', '.7z',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.mp4', '.mp3', '.mov', '.avi', '.webm',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.lock',   // Lockfiles are large
  '.md',     // Markdown docs can contain dummy keys/examples
  '.txt',    // Licenses, docs
  '.log',    // Logs caught by filename rule
]);

const CONTENT_RULES = [
  // AWS
  { id: 'aws-key-id', severity: 'error', label: 'AWS access key ID', re: /AKIA[0-9A-Z]{16}/ },
  { id: 'aws-secret', severity: 'error', label: 'AWS secret access key assignment', re: /aws_secret_access_key\s*=\s*[A-Za-z0-9/+=]{20,}/i },

  // Private keys
  { id: 'pem-block', severity: 'error', label: 'Private key block (PEM)', re: /-----BEGIN (RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----/ },

  // GitHub
  { id: 'github-pat-new', severity: 'error', label: 'GitHub fine-grained token', re: /github_pat_[A-Za-z0-9_]{82}/ },
  { id: 'github-ghp', severity: 'error', label: 'GitHub personal access token (ghp_)', re: /ghp_[A-Za-z0-9]{36}/ },
  { id: 'github-gho', severity: 'error', label: 'GitHub OAuth token (gho_)', re: /gho_[A-Za-z0-9]{36}/ },
  { id: 'github-ghs', severity: 'error', label: 'GitHub Actions token (ghs_)', re: /ghs_[A-Za-z0-9]{36}/ },
  { id: 'github-legacy', severity: 'error', label: 'GitHub token (legacy format)', re: /gh[pousr]_[A-Za-z0-9]{20,}/ },

  // Stripe
  { id: 'stripe-secret', severity: 'error', label: 'Stripe secret key (sk_live_)', re: /sk_live_[A-Za-z0-9]{24,}/ },
  { id: 'stripe-restricted', severity: 'error', label: 'Stripe restricted key (rk_live_)', re: /rk_live_[A-Za-z0-9]{24,}/ },

  // OpenAI
  { id: 'openai-key', severity: 'error', label: 'OpenAI API key', re: /sk-(proj-[A-Za-z0-9_-]{50,}|[A-Za-z0-9]{20,}T3BlbkFJ[A-Za-z0-9]{20,})/ },

  // Anthropic
  { id: 'anthropic-key', severity: 'error', label: 'Anthropic API key (sk-ant-)', re: /sk-ant-api\d{2}-[A-Za-z0-9_-]{86}/ },

  // Hugging Face
  { id: 'huggingface-token', severity: 'error', label: 'Hugging Face API token (hf_)', re: /hf_[A-Za-z0-9]{34,}/ },

  // Slack
  { id: 'slack-token', severity: 'error', label: 'Slack bot/app token (xox*)', re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },

  // npm
  { id: 'npm-token', severity: 'error', label: 'npm publish token (npm_)', re: /npm_[A-Za-z0-9]{36}/ },

  // JWT
  { id: 'jwt', severity: 'error', label: 'JWT-shaped string', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },

  // Google Cloud
  { id: 'gcp-key-id', severity: 'error', label: 'Google Cloud service account key marker', re: /"private_key_id"\s*:\s*"[a-f0-9]{40}"/ },

  // Azure SAS token
  { id: 'azure-sas', severity: 'error', label: 'Azure Storage SAS token', re: /SharedAccessSignature[^\s"']{20,}sv=/ },

  // HashiCorp Vault / Terraform Cloud token
  { id: 'vault-token', severity: 'error', label: 'HashiCorp Vault / Terraform Cloud token', re: /hvs\.[A-Za-z0-9]{24,}/ },

  // Doppler
  { id: 'doppler-token', severity: 'error', label: 'Doppler service token (dp.st.)', re: /dp\.st\.[a-zA-Z0-9]{40,}/ },

  // Twilio
  { id: 'twilio-token', severity: 'error', label: 'Twilio API key (SK...)', re: /SK[a-f0-9]{32}/ },

  // SendGrid
  { id: 'sendgrid-key', severity: 'error', label: 'SendGrid API key (SG.)', re: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/ },

  // Cloudflare
  { id: 'cloudflare-token', severity: 'error', label: 'Cloudflare API token', re: /[A-Za-z0-9_-]{40}(?=[^A-Za-z0-9_-]|$)/ },

  // Generic assignments (warn only)
  { id: 'generic-secret', severity: 'warn', label: 'Generic API key / secret assignment', re: /(api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']?[A-Za-z0-9_\-]{20,}["']?/i },
];

/**
 * Analyzes the unpacked files for secrets/credentials in their contents.
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
    if (SKIP_CONTENT_SCAN_EXT.has(ext)) continue;

    let stat;
    try {
      stat = fs.statSync(absPath);
    } catch {
      continue;
    }

    if (stat.size > MAX_CONTENT_SCAN_BYTES) continue;

    let content;
    try {
      content = fs.readFileSync(absPath, 'utf8');
    } catch {
      continue;
    }

    for (const rule of CONTENT_RULES) {
      const match = content.match(rule.re);
      if (match) {
        const line = content.slice(0, match.index).split('\n').length;
        findings.push({
          analyzer: 'secrets',
          type: 'content',
          severity: rule.severity,
          id: rule.id,
          path: file,
          line,
          sizeBytes: stat.size,
          label: rule.label,
          fix: 'Remove the secret from this file, or add the file to .npmignore.',
        });
      }
    }
  }

  return findings;
}

module.exports = { analyze };
