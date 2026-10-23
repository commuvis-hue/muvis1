const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const CHO_SET = new Set(CHO);

/** "좋은 날" → "ㅈㅇ ㄴ" */
export function toChosung(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) out += CHO[Math.floor((code - 0xac00) / 588)];
    else out += ch;
  }
  return out;
}

export function isChosungQuery(q: string): boolean {
  const s = q.replace(/\s/g, '');
  return s.length > 0 && [...s].every((c) => CHO_SET.has(c));
}

const norm = (s: string) => s.toLowerCase().replace(/\s/g, '');

/** 곡번호·제목·가수 검색. 초성만 입력하면 초성으로 비교합니다. */
export function matchSong(q: string, s: { no: string; title: string; artist: string }): boolean {
  const query = norm(q);
  if (!query) return true;
  if (/^\d+$/.test(query)) return s.no.startsWith(query);
  if (isChosungQuery(query)) {
    return norm(toChosung(s.title)).includes(query) || norm(toChosung(s.artist)).includes(query);
  }
  return norm(s.title).includes(query) || norm(s.artist).includes(query);
}

export const CHOSUNG_KEYS = ['ㄱ','ㄴ','ㄷ','ㄹ','ㅁ','ㅂ','ㅅ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
