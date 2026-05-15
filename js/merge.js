export function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (Array.isArray(sv)) {
      target[key] = sv.slice();
    } else if (sv && typeof sv === 'object' && !Array.isArray(sv) && tv && typeof tv === 'object') {
      deepMerge(tv, sv);
    } else {
      target[key] = sv;
    }
  }
  return target;
}
