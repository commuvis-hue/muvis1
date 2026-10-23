'use client';

import { useEffect, useState } from 'react';
import { config } from '@/lib/config';
import { KioskProvider, LOCKED_SCREENS, useKiosk, type ScreenName } from '@/lib/kiosk/store';
import { AgentBanner, BusyOverlay, ConfirmDialog, DevPanel, RemoteModal, Toasts } from './Overlays';
import { SideRail } from './SideRail';
import { StatusBar } from './StatusBar';
import { AttractScreen, LoginScreen, ModeScreen, PaymentScreen, SessionEndScreen } from './screens/Entry';
import { BrowseScreen } from './screens/Browse';
import { AfterSongScreen, CountdownScreen, PerformingScreen } from './screens/Stage';
import { AiPreviewScreen, AiStatusScreen, MyVideosScreen } from './screens/Results';
import { AdsScreen, AuditionScreen, NewsScreen } from './screens/Info';
import { MaskScreen } from './screens/Masks';

const SCREENS: Record<ScreenName, () => React.ReactNode> = {
  attract: AttractScreen,
  login: LoginScreen,
  payment: PaymentScreen,
  mode: ModeScreen,
  mask: MaskScreen,
  browse: BrowseScreen,
  countdown: CountdownScreen,
  performing: PerformingScreen,
  afterSong: AfterSongScreen,
  aiStatus: AiStatusScreen,
  aiPreview: AiPreviewScreen,
  myVideos: MyVideosScreen,
  audition: AuditionScreen,
  ads: AdsScreen,
  news: NewsScreen,
  sessionEnd: SessionEndScreen,
};

function Shell() {
  const { state } = useKiosk();
  const Screen = SCREENS[state.screen];
  const fullBleed = state.screen === 'attract';
  const showRail = !!state.session && !!state.mode && !LOCKED_SCREENS.includes(state.screen) && state.screen !== 'mode' && state.screen !== 'aiStatus';

  return (
    <div className={`kiosk${fullBleed ? ' is-attract' : ''}${showRail ? ' has-rail' : ''}`} data-screen={state.screen}>
      {!fullBleed && <StatusBar />}
      {showRail && <SideRail />}
      <main className="stage">
        <Screen />
      </main>
      <AgentBanner />
      <Toasts />
      <BusyOverlay />
      <ConfirmDialog />
      <RemoteModal />
      <DevPanel />
    </div>
  );
}

/**
 * 키오스크 루트. 부스 ID는 URL의 ?booth= 값 → 환경변수 순으로 정합니다.
 * 장비·시계에 의존하므로 브라우저에서만 렌더링합니다.
 */
export default function KioskApp() {
  const [boothId, setBoothId] = useState<string | null>(null);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('booth');
    setBoothId(fromUrl || config.defaultBoothId);

    // 키오스크: 길게 눌러 메뉴 띄우기·핀치 확대 방지
    const block = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', block);
    document.addEventListener('gesturestart', block);
    return () => {
      document.removeEventListener('contextmenu', block);
      document.removeEventListener('gesturestart', block);
    };
  }, []);

  if (!boothId) return <div className="kiosk kiosk-boot" />;
  return (
    <KioskProvider boothId={boothId}>
      <Shell />
    </KioskProvider>
  );
}
