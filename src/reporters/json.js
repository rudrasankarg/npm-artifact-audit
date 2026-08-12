'use strict';

function reportAuditJson({ findings, meta, compressedSize, fileCount, unpackedSize }) {
  const errors = findings.filter(f => f.severity === 'error');
  const warnings = findings.filter(f => f.severity === 'warn');

  console.log(JSON.stringify({
    package: {
      name: meta.name,
      version: meta.version,
      files: fileCount,
      compressedSize,
      unpackedSize
    },
    findings: findings.map(f => ({
      analyzer: f.analyzer,
      type: f.type,
      id: f.id,
      severity: f.severity,
      file: f.path,
      line: f.line,
      label: f.label,
      fix: f.fix,
      explanation: f.explanation,
      suggestion: f.suggestion,
      details: f.details
    })),
    passed: errors.length === 0,
    result: errors.length > 0 ? 'FAIL' : warnings.length > 0 ? 'PASS_WITH_WARNINGS' : 'PASS'
  }, null, 2));
}

function reportDiffJson(diff) {
  console.log(JSON.stringify(diff, null, 2));
}

module.exports = { reportAuditJson, reportDiffJson };
