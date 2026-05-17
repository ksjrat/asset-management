import { writeFileSync } from 'node:fs';

const out = 'js/sync-config.js';
const raw = process.env.FIREBASE_CONFIG?.trim();

if (!raw) {
  console.log('FIREBASE_CONFIG 없음 — sync-config.js 생성 생략');
  process.exit(0);
}

function parseConfig(input) {
  let s = input.trim();
  s = s.replace(/^const\s+firebaseConfig\s*=\s*/i, '').replace(/;+\s*$/, '');
  try {
    return JSON.parse(s);
  } catch {
    const block = s.match(/\{[\s\S]*\}/);
    if (block) {
      try {
        return JSON.parse(block[0]);
      } catch {
        /* loose JS object below */
      }
    }
  }
  try {
    const loose = s.match(/\{[\s\S]*\}/)?.[0] ?? s;
    return new Function(`return (${loose})`)();
  } catch {
    return null;
  }
}

const cfg = parseConfig(raw);
if (!cfg?.projectId || !cfg?.apiKey) {
  console.warn('FIREBASE_CONFIG 를 읽지 못했습니다. 배포는 계속하고 클라우드는 꺼둡니다.');
  console.warn('시크릿에는 { "apiKey": "...", "projectId": "...", ... } JSON만 넣으세요.');
  process.exit(0);
}

const body = `/** GitHub Actions 배포 시 자동 생성 */
export const SYNC_ENABLED = true;

export const firebaseConfig = ${JSON.stringify(cfg, null, 2)};
`;

writeFileSync(out, body, 'utf8');
console.log('js/sync-config.js 생성 완료');
