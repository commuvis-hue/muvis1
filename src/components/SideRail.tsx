'use client';

import { useKiosk } from '@/lib/kiosk/store';
import type { CatalogTab } from '@/lib/types';
import { Icon, type IconName } from './Icon';

type Item =
  | { kind: 'tab'; tab: CatalogTab; label: string; icon: IconName }
  | { kind: 'screen'; screen: 'mask' | 'audition' | 'myVideos' | 'ads' | 'news'; label: string; icon: IconName };

const ITEMS: Item[] = [
  { kind: 'tab', tab: 'popular', label: '인기곡', icon: 'fire' },
  { kind: 'tab', tab: 'new', label: '신곡', icon: 'spark' },
  { kind: 'tab', tab: 'genre', label: '장르별', icon: 'grid' },
  { kind: 'tab', tab: 'ai', label: 'AI 음원', icon: 'wave' },
  { kind: 'screen', screen: 'mask', label: '가면 선택', icon: 'mask' },
  { kind: 'screen', screen: 'audition', label: '오디션 참가', icon: 'trophy' },
  { kind: 'screen', screen: 'myVideos', label: '내 뮤직영상', icon: 'film' },
  { kind: 'screen', screen: 'news', label: 'MUVIS 뉴스', icon: 'news' },
  { kind: 'screen', screen: 'ads', label: '광고', icon: 'megaphone' },
];

export function SideRail() {
  const { state, actions } = useKiosk();
  const activeJobs = state.jobs.filter((j) => j.status === 'queued' || j.status === 'processing').length;

  const isActive = (it: Item) =>
    it.kind === 'tab' ? state.screen === 'browse' && state.catalogTab === it.tab : state.screen === it.screen;

  return (
    <nav className="rail" aria-label="메뉴">
      <div className="rail-items">
        {ITEMS.map((it) => (
          <button
            key={it.label}
            className={`rail-item${isActive(it) ? ' is-active' : ''}`}
            onClick={() => (it.kind === 'tab' ? actions.setTab(it.tab) : actions.go(it.screen))}
          >
            <Icon name={it.icon} />
            <span>{it.label}</span>
            {it.kind === 'screen' && it.screen === 'myVideos' && activeJobs > 0 && (
              <em className="rail-badge" aria-label={`제작 중 ${activeJobs}개`}>{activeJobs}</em>
            )}
          </button>
        ))}
      </div>
      <div className="rail-nav">
        <button className="rail-item" onClick={() => actions.back()}>
          <Icon name="back" />
          <span>BACK</span>
        </button>
        <button className="rail-item" onClick={() => actions.home()}>
          <Icon name="home" />
          <span>HOME</span>
        </button>
      </div>
    </nav>
  );
}
