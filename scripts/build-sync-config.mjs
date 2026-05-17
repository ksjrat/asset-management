import { writeFileSync } from 'node:fs';

const out = 'js/sync-config.js';
const raw = process.env.FIREBASE_CONFIG?.trim();

if (!raw) {
  console.log('FIREBASE_CONFIG 없음 — sync-config.js 생성 생략 (로컬 전용)');
  process.exit(0);
}

let cfg;
try {
  cfg = JSON.parse(raw);
} catch {
  console.error('FIREBASE_CONFIG 는 firebaseConfig JSON 객체여야 합니다.');
  process.exit(1);
}

if (!cfg.projectId || !cfg.apiKey) {
  console.error('FIREBASE_CONFIG 에 projectId, apiKey 가 필요합니다.');
  process.exit(1);
}

const body = `/** GitHub Actions 배포 시 자동 생성 — 직접 수정하지 마세요 */
export const SYNC_ENABLED = true;

export const firebaseConfig = ${JSON.stringify(cfg, null, 2)};
`;

writeFileSync(out, body, 'utf8');
console.log('js/sync-config.js 생성 완료 (SYNC_ENABLED=true)');
