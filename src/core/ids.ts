/**
 * Collision-resistant ids that work offline and sort roughly by creation time,
 * so exported files stay readable and merges stay predictable.
 */
export function newId(prefix = ''): string {
  const time = Date.now().toString(36);
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}${time}${rand}`;
}
