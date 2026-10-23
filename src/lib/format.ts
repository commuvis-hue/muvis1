export const won = (n: number) => n.toLocaleString('ko-KR');
export const pts = (n: number) => `${won(n)}P`;

export function mmss(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function uid(prefix: string): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${rnd}`;
}

/** 결제·차감 요청마다 새로 발급해 서버가 중복 처리를 막도록 합니다. */
export const idempotencyKey = () => uid('idem');

export function dateLabel(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}
