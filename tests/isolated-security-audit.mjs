import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { extname } from 'node:path';

const base = process.env.AUDIT_BASE || '633e55c949e8ca9e950c08be7f7165cbb7ea81ad';
const head = 'HEAD';
const files = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', '-z', base, head], { encoding: 'utf8' }).split('\0').filter(Boolean);
const patterns = [
  ['private key block', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['GitHub token', /gh[pousr]_[A-Za-z0-9_]{25,}/],
  ['Supabase service role JWT', /(?:SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\s*[:=]\s*['"`]?eyJ[A-Za-z0-9_-]{35,}/i],
  ['credential assignment', /(?:password|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*['"`][A-Za-z0-9_+\/=.-]{24,}['"`]/i],
  ['production deploy command', /(?:wrangler\s+deploy|supabase\s+db\s+push|supabase\s+link\s+--project-ref)/i],
];
const skip = new Set(['.png','.jpg','.jpeg','.gif','.webp','.ico','.pdf','.zip','.woff','.woff2','.lock']);
let inspected = 0;
let findings = 0;
for (const file of files) {
  if (!existsSync(file) || skip.has(extname(file).toLowerCase())) continue;
  const bytes = readFileSync(file);
  if (bytes.includes(0) || bytes.length > 2_000_000) continue;
  inspected++;
  const lines = bytes.toString('utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const [label, regex] of patterns) {
      if (!regex.test(lines[i])) continue;
      findings++;
      // Never print matching text, values, or the line itself.
      console.log(`::warning file=${file},line=${i + 1},title=Security review::${label}; inspect locally before approval`);
    }
  }
}
console.log(`Audited ${inspected} changed text files relative to ${base.slice(0, 8)}; findings: ${findings}. No matched values printed.`);
if (findings) process.exitCode = 1;
