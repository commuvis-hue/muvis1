import type { Genre, Song } from '@/lib/types';

/**
 * 시연용 샘플 곡 목록 (가상의 곡·가수·번호).
 * 운영에서는 반주기 제휴사가 제공하는 노래책 DB를 서버에서 내려받아 사용합니다.
 */
type Row = [no: string, title: string, artist: string, genre: Genre, sec: number, rank?: number, isNew?: boolean];

const ROWS: Row[] = [
  ['48201', '겨울이 머문 자리', '한서윤', '발라드', 244, 1],
  ['48215', '네온 러시', '블루문', '댄스', 201, 2, true],
  ['47990', '마지막 정류장', '이도현', '발라드', 236, 3],
  ['48302', '하이라이트', '퍼플릭스', '댄스', 189, 4, true],
  ['47512', '인생은 고고', '나미향', '트로트', 212, 5],
  ['48120', '불꽃처럼', '레드시그널', '록', 228, 6],
  ['48311', '서울 나이트', '로우키', '힙합', 198, 7, true],
  ['47788', '너의 계절', '윤채아', '발라드', 251, 8],
  ['48044', '슬로우 모션', '리안', 'R&B', 219, 9],
  ['47603', '사랑의 정거장', '조영호', '트로트', 205, 10],
  ['48288', 'Spin It Up', '오로라걸즈', '댄스', 194, 11, true],
  ['47855', '달리는 밤', '하이웨이스타', '록', 232, 12],
  ['48077', '옥탑방 일기', '낮잠밴드', '인디', 226, 13],
  ['47920', '편지를 접으며', '강민재', '발라드', 258, 14],
  ['48166', '언더그라운드 킹', '제이크로우', '힙합', 207, 15],
  ['47701', '앗싸 내 인생', '금보라', '트로트', 199, 16],
  ['48233', '미드나잇 블루', '소울하이', 'R&B', 223, 17, true],
  ['47977', '반짝반짝 시티', '스텔라7', '댄스', 187, 18],
  ['48099', '고백 없는 고백', '모노톤즈', '록', 241, 19],
  ['47844', '그 밤의 온도', '서하린', '발라드', 247, 20],
  ['48320', '텔레파시', '루미나', '댄스', 192, undefined, true],
  ['48325', '우리가 남긴 노래', '정우진', '발라드', 262, undefined, true],
  ['48330', '첫 번째 벌스', '엠씨태양', '힙합', 184, undefined, true],
  ['48334', '라이브 하우스', '노이즈캔들', '록', 216, undefined, true],
  ['48338', '너라는 향기', '지오', 'R&B', 208, undefined, true],
  ['48342', '자전거 탄 오후', '소란비', '인디', 214, undefined, true],
  ['47655', '부산 갈매기 연가', '최강산', '트로트', 230],
  ['47890', 'Go Higher', '스카이웨이', '댄스', 196],
  ['48010', '맨발의 랩', '칠리비트', '힙합', 202],
  ['47733', '작은 창문', '여름잠', '인디', 238],
];

export const CATALOG: Song[] = ROWS.map(([no, title, artist, genre, durationSec, rank, isNew]) => ({
  no, title, artist, genre, durationSec, rank, isNew, source: 'accompanist',
}));

export const AI_SONGS: Song[] = [
  { no: 'AI-0101', title: 'Neon Heartbeat', artist: 'MUVIS AI', genre: '댄스', durationSec: 176, source: 'ai', isNew: true },
  { no: 'AI-0102', title: '첫눈의 알고리즘', artist: 'MUVIS AI', genre: '발라드', durationSec: 214, source: 'ai' },
  { no: 'AI-0103', title: '시티팝 드라이브', artist: 'MUVIS AI', genre: 'R&B', durationSec: 198, source: 'ai', isNew: true },
  { no: 'AI-0104', title: '별을 그리는 밤', artist: 'MUVIS AI', genre: '인디', durationSec: 205, source: 'ai' },
  { no: 'AI-0105', title: 'Bass Drop 404', artist: 'MUVIS AI', genre: '힙합', durationSec: 168, source: 'ai' },
  { no: 'AI-0106', title: '바람의 멜로디', artist: 'MUVIS AI', genre: '트로트', durationSec: 190, source: 'ai' },
];

export const ALL_SONGS: Song[] = [...CATALOG, ...AI_SONGS];
