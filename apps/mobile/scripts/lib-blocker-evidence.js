/* blocker evidence parser for readiness lane */
function parseTimestamp(s) {
  const m = String(s || '').match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/);
  return m ? m[1] : undefined;
}

function classifyLine(line, source = 'log_line') {
  const t = String(line || '');
  const low = t.toLowerCase();
  const timestamp = parseTimestamp(t);

  if (/(401|403|unauthorized|forbidden|auth[_\s-]?failed)/i.test(t)) {
    return { blocker: 'AUTH_BLOCKER', evidence: { source, code_token: (t.match(/\b(401|403|UNAUTHORIZED|FORBIDDEN|AUTH[_-]?FAILED)\b/i) || [])[1] || 'AUTH', timestamp, raw: t } };
  }
  if (/(402|credit|quota exceeded|insufficient funds|payment required)/i.test(t)) {
    return { blocker: 'CREDITS_BLOCKER', evidence: { source, code_token: (t.match(/\b(402|CREDIT|QUOTA|INSUFFICIENT[_\s-]?FUNDS|PAYMENT[_\s-]?REQUIRED)\b/i) || [])[1] || 'CREDITS', timestamp, raw: t } };
  }
  if (/(429|rate limit|too many requests|throttl)/i.test(t)) {
    return { blocker: 'RATE_LIMIT_BLOCKER', evidence: { source, code_token: (t.match(/\b(429|RATE[_\s-]?LIMIT|TOO[_\s-]?MANY[_\s-]?REQUESTS|THROTTL\w*)\b/i) || [])[1] || 'RATE_LIMIT', timestamp, raw: t } };
  }
  if (/(quality|no_rep_signal|low_confidence|insufficient_rom|occlusion)/i.test(low)) {
    return { blocker: 'QUALITY_BLOCKER', evidence: { source, code_token: (t.match(/\b(NO_REP_SIGNAL|LOW_CONFIDENCE|INSUFFICIENT_ROM|OCCLUSION|QUALITY)\b/i) || [])[1] || 'QUALITY', timestamp, raw: t } };
  }
  return null;
}

function parseEvidenceInput(input, source = 'evidence_input') {
  const out = [];
  if (!input) return out;
  if (Array.isArray(input)) {
    for (const row of input) {
      const line = typeof row === 'string' ? row : JSON.stringify(row);
      const hit = classifyLine(line, source);
      if (hit) out.push(hit);
    }
    return out;
  }
  if (typeof input === 'object') {
    if (Array.isArray(input.lines)) return parseEvidenceInput(input.lines, source);
    if (Array.isArray(input.events)) return parseEvidenceInput(input.events, source);
    return parseEvidenceInput([JSON.stringify(input)], source);
  }
  const lines = String(input).split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const hit = classifyLine(line, source);
    if (hit) out.push(hit);
  }
  return out;
}

module.exports = { classifyLine, parseEvidenceInput };
