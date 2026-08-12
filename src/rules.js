'use strict';

// ─── FILENAME RULES ─────────────────────────────────────────────────────────
// Each rule: { id, label, severity: 'error'|'warn', re, fix }

const FILENAME_RULES = [

  // ── Errors: files that should NEVER ship ────────────────────────────────

  { id: 'env-file',
    severity: 'error',
    label: '.env file — may contain API keys or secrets',
    fix: "Add '.env*' to .npmignore or use the 'files' field in package.json.",
    re: /(^|\/)\.env(\.[a-z0-9._-]+)?$/i },

  { id: 'npm-auth',
    severity: 'error',
    label: '.npmrc — may contain auth tokens for private registries',
    fix: "Add '.npmrc' to .npmignore.",
    re: /(^|\/)\.npmrc$/i },

  { id: 'aws-credentials',
    severity: 'error',
    label: '.aws/credentials — AWS credentials file',
    fix: "Add '.aws/' to .npmignore.",
    re: /(^|\/)\.aws\/credentials$/i },

  { id: 'ssh-key',
    severity: 'error',
    label: 'SSH private key',
    fix: 'Remove this file from your project directory or add it to .npmignore.',
    re: /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i },

  { id: 'private-key-file',
    severity: 'error',
    label: 'Private key / certificate file (.pem, .key, .pfx, .p12)',
    fix: 'Remove this file from your project directory or add it to .npmignore.',
    re: /\.(pem|key|pfx|p12|crt|cer)$/i },

  { id: 'source-map',
    severity: 'error',
    label: 'Source map — exposes your full unminified source code',
    fix: "Add '*.map' to .npmignore, or set sourceMap: false in your bundler config.",
    re: /\.map$/i },

  { id: 'git-dir',
    severity: 'error',
    label: '.git or .svn directory — version control internals',
    fix: "Add '.git/' to .npmignore (or this should never be included).",
    re: /(^|\/)\.git\//i },

  { id: 'claude-settings',
    severity: 'error',
    label: '.claude/settings.local.json — Claude Code config, may contain tokens',
    fix: "Add '.claude/' to .npmignore.",
    re: /(^|\/)\.claude\/settings\.local\.json$/i },

  { id: 'cursor-settings',
    severity: 'error',
    label: '.cursor/settings.json — Cursor AI editor config, may contain tokens or paths',
    fix: "Add '.cursor/' to .npmignore.",
    re: /(^|\/)\.cursor\/settings\.json$/i },

  { id: 'google-credentials',
    severity: 'error',
    label: 'Google OAuth credentials file',
    fix: 'Remove this file or add it to .npmignore.',
    re: /(^|\/)credentials\.json$/i },

  { id: 'google-service-account',
    severity: 'error',
    label: 'Google Cloud service account key',
    fix: 'Remove this file or add it to .npmignore.',
    re: /service.?account.*\.json$/i },

  { id: 'local-db',
    severity: 'error',
    label: 'Local database file (.sqlite, .db)',
    fix: 'Add this file to .npmignore.',
    re: /\.(sqlite|sqlite3|db)$/i },

  { id: 'shell-history',
    severity: 'error',
    label: 'Shell history file',
    fix: 'Add this file to .npmignore.',
    re: /(^|\/)\.(bash|zsh|fish)_history$/i },

  { id: 'netrc',
    severity: 'error',
    label: '.netrc — credential store for curl, wget, etc.',
    fix: "Add '.netrc' to .npmignore.",
    re: /(^|\/)\.netrc$/i },

  { id: 'docker-config',
    severity: 'error',
    label: '.docker/config.json — Docker registry credentials',
    fix: "Add '.docker/' to .npmignore.",
    re: /(^|\/)\.docker\/config\.json$/i },

  // ── Warnings: files that probably shouldn't ship ─────────────────────────

  { id: 'test-files',
    severity: 'warn',
    label: 'Test files — usually not needed by package consumers',
    fix: "Use the 'files' field in package.json or .npmignore to exclude tests.",
    re: /(\.test\.|\.spec\.|(^|\/)__tests__\/|(^|\/)test\/)/i },

  { id: 'ide-files',
    severity: 'warn',
    label: 'IDE / editor config directory (.vscode, .idea, .cursor)',
    fix: "Add '.vscode/', '.idea/', '.cursor/' to .npmignore.",
    re: /(^|\/)\.(vscode|idea|cursor)\//i },

  { id: 'tooling-config',
    severity: 'warn',
    label: 'Internal tooling config — usually not needed by consumers',
    fix: "Use the 'files' field in package.json to only include what consumers need.",
    re: /(^|\/)(\\.eslintrc.*|\.prettierrc.*|jest\.config\.[jt]s|\.babelrc.*|tsconfig\..*\.json|\.stylelintrc.*)$/i },

  { id: 'log-file',
    severity: 'warn',
    label: 'Log file — may contain sensitive output or stack traces',
    fix: "Add '*.log' to .npmignore.",
    re: /\.log$/i },

  { id: 'src-directory',
    severity: 'warn',
    label: 'Raw src/ directory — consumers typically only need the built output',
    fix: "Use the 'files' field in package.json to ship only your dist/ or build/ folder.",
    re: /(^|\/)src\//i },
];

// ─── CONTENT RULES ──────────────────────────────────────────────────────────
// Regex patterns for secret-shaped content in text files.

const CONTENT_RULES = [
  // AWS
  { id: 'aws-key-id',         severity: 'error', label: 'AWS access key ID',
    re: /AKIA[0-9A-Z]{16}/ },
  { id: 'aws-secret',         severity: 'error', label: 'AWS secret access key assignment',
    re: /aws_secret_access_key\s*=\s*[A-Za-z0-9/+=]{20,}/i },

  // Private keys
  { id: 'pem-block',          severity: 'error', label: 'Private key block (PEM)',
    re: /-----BEGIN (RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----/ },

  // GitHub
  { id: 'github-pat-new',     severity: 'error', label: 'GitHub fine-grained token',
    re: /github_pat_[A-Za-z0-9_]{82}/ },
  { id: 'github-ghp',         severity: 'error', label: 'GitHub personal access token (ghp_)',
    re: /ghp_[A-Za-z0-9]{36}/ },
  { id: 'github-gho',         severity: 'error', label: 'GitHub OAuth token (gho_)',
    re: /gho_[A-Za-z0-9]{36}/ },
  { id: 'github-ghs',         severity: 'error', label: 'GitHub Actions token (ghs_)',
    re: /ghs_[A-Za-z0-9]{36}/ },
  { id: 'github-legacy',      severity: 'error', label: 'GitHub token (legacy format)',
    re: /gh[pousr]_[A-Za-z0-9]{20,}/ },

  // Stripe
  { id: 'stripe-secret',      severity: 'error', label: 'Stripe secret key (sk_live_)',
    re: /sk_live_[A-Za-z0-9]{24,}/ },
  { id: 'stripe-restricted',  severity: 'error', label: 'Stripe restricted key (rk_live_)',
    re: /rk_live_[A-Za-z0-9]{24,}/ },

  // OpenAI — covers both legacy sk-...T3BlbkFJ... and new sk-proj-... format
  { id: 'openai-key',         severity: 'error', label: 'OpenAI API key',
    re: /sk-(proj-[A-Za-z0-9_-]{50,}|[A-Za-z0-9]{20,}T3BlbkFJ[A-Za-z0-9]{20,})/ },

  // Anthropic
  { id: 'anthropic-key',      severity: 'error', label: 'Anthropic API key (sk-ant-)',
    re: /sk-ant-api\d{2}-[A-Za-z0-9_-]{86}/ },

  // Hugging Face
  { id: 'huggingface-token',  severity: 'error', label: 'Hugging Face API token (hf_)',
    re: /hf_[A-Za-z0-9]{34,}/ },

  // Slack
  { id: 'slack-token',        severity: 'error', label: 'Slack bot/app token (xox*)',
    re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },

  // npm
  { id: 'npm-token',          severity: 'error', label: 'npm publish token (npm_)',
    re: /npm_[A-Za-z0-9]{36}/ },

  // JWT
  { id: 'jwt',                severity: 'error', label: 'JWT-shaped string',
    re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },

  // Google Cloud
  { id: 'gcp-key-id',         severity: 'error', label: 'Google Cloud service account key marker',
    re: /"private_key_id"\s*:\s*"[a-f0-9]{40}"/ },

  // Azure SAS token
  { id: 'azure-sas',          severity: 'error', label: 'Azure Storage SAS token',
    re: /SharedAccessSignature[^\s"']{20,}sv=/ },

  // HashiCorp Vault / Terraform Cloud token
  { id: 'vault-token',        severity: 'error', label: 'HashiCorp Vault / Terraform Cloud token',
    re: /hvs\.[A-Za-z0-9]{24,}/ },

  // Generic patterns (warn, not error — too broad for error)
  { id: 'generic-secret',     severity: 'warn',  label: 'Generic API key / secret assignment',
    re: /(api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']?[A-Za-z0-9_\-]{20,}["']?/i },
];

// ─── FILE SIZE RULES ─────────────────────────────────────────────────────────

const SIZE_RULES = {
  warnBytes:       5  * 1024 * 1024,   //  5 MB → warning
  errorBytes:      20 * 1024 * 1024,   // 20 MB → error
  totalErrorBytes: 20 * 1024 * 1024,   // 20 MB total package → error
};

// ─── CONTENT SCAN SKIP LIST ──────────────────────────────────────────────────
// Extensions skipped for content scanning (binary, huge, or doc files)

const SKIP_CONTENT_SCAN_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.zip', '.gz', '.tgz', '.tar', '.rar', '.7z',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.mp4', '.mp3', '.mov', '.avi', '.webm',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.lock',   // lockfiles are huge and never a secret source
  '.md',     // markdown docs often contain example patterns
  '.txt',    // changelogs, licenses — not secret sources
  '.log',    // logs can be huge; filename rule catches them already
]);

module.exports = {
  FILENAME_RULES,
  CONTENT_RULES,
  SIZE_RULES,
  SKIP_CONTENT_SCAN_EXT,
};
