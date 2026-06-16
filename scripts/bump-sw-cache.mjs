/** 배포 시 sw.js 캐시 이름을 바꿔 이전 버전 캐시를 무효화 */
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'sw.js';
const src = readFileSync(path, 'utf8');
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const hash = process.env.GITHUB_SHA?.slice(0, 7) || Date.now().toString(36);
const next = `couple-asset-${stamp}-${hash}`;

const updated = src.replace(/const CACHE = '[^']+'/, `const CACHE = '${next}'`);
if (updated === src) {
  console.warn('sw.js CACHE 패턴을 찾지 못했습니다');
  process.exit(1);
}

writeFileSync(path, updated, 'utf8');
console.log(`sw.js CACHE → ${next}`);
