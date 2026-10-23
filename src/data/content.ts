import type { AdSlide, Audition, NewsItem } from '@/lib/types';

const DAY = 86_400_000;

/** 시연용 콘텐츠. 운영에서는 관리자 웹에서 등록한 내용을 서버가 내려줍니다. */
export const sampleAuditions = (): Audition[] => [
  {
    id: 'aud-2611',
    title: '2026 겨울 보컬 챌린지',
    host: 'MUVIS',
    endsAt: Date.now() + 12 * DAY,
    description: '발라드·R&B 장르 자유곡. 투표 상위 10명은 정식 녹음 기회를 드립니다.',
  },
  {
    id: 'aud-2612',
    title: '숏폼 스타 오디션',
    host: 'MUVIS × 파트너 레이블',
    endsAt: Date.now() + 26 * DAY,
    description: 'AI가 만든 숏폼 뮤직비디오로 참가하세요. 좋아요·투표를 합산해 심사합니다.',
  },
  {
    id: 'aud-2610',
    title: '트로트 신인 발굴전',
    host: 'MUVIS',
    endsAt: Date.now() + 4 * DAY,
    description: '트로트 장르 한정. 매장 예선 통과자는 스테이지 본선에 초대됩니다.',
  },
];

export const sampleNews: NewsItem[] = [
  { id: 'n1', date: '10.20', title: 'XR 스테이지 2호점 오픈 준비', body: '대형 LED와 5대 카메라로 촬영하는 XR 스테이지가 곧 문을 엽니다.' },
  { id: 'n2', date: '10.14', title: 'AI 음원 6곡 추가', body: 'MUVIS AI가 만든 신곡을 노래방에서 바로 불러보세요. 저작권 걱정 없이 공유할 수 있습니다.' },
  { id: 'n3', date: '10.02', title: '숏폼 스타 오디션 접수 시작', body: '부스에서 만든 숏폼 영상으로 바로 참가할 수 있습니다.' },
  { id: 'n4', date: '09.25', title: 'M포인트 충전 이벤트', body: '앱에서 3만 포인트 이상 충전하면 10% 추가 적립됩니다.' },
];

export const sampleAds: AdSlide[] = [
  { id: 'a1', headline: '카메라 3대, 편집은 AI가', sub: '노래를 끝까지 부르면 숏폼과 롱폼 뮤직비디오를 자동으로 만들어 드립니다', tone: 'red' },
  { id: 'a2', headline: '숏폼 스타 오디션 진행 중', sub: '부스에서 만든 영상으로 바로 참가하세요', tone: 'amber' },
  { id: 'a3', headline: 'MUVIS 앱으로 3초 로그인', sub: '화면의 QR을 앱으로 찍으면 바로 시작됩니다', tone: 'cyan' },
];
