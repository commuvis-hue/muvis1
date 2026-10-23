'use client';

import { useEffect, useState } from 'react';
import { mockControls } from '@/lib/agent';
import { mockApiControls } from '@/lib/api';
import { useKiosk } from '@/lib/kiosk/store';
import { Icon } from './Icon';
import { QrImage } from './QrImage';

export function Toasts() {
  const { toasts } = useKiosk();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function ConfirmDialog() {
  const { dialog, resolveDialog } = useKiosk();
  const [agreed, setAgreed] = useState(false);
  useEffect(() => setAgreed(false), [dialog]);
  if (!dialog) return null;
  const blocked = !!dialog.consent && !agreed;
  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
      <div className={`dialog dialog-${dialog.tone ?? 'default'}`}>
        <h2 id="dlg-title">{dialog.title}</h2>
        {dialog.body && <p className="dialog-body">{dialog.body}</p>}
        {dialog.consent && (
          <button className={`consent${agreed ? ' is-on' : ''}`} onClick={() => setAgreed((v) => !v)} aria-pressed={agreed}>
            <span className="consent-box">{agreed && <Icon name="check" size="1.1em" />}</span>
            {dialog.consent}
          </button>
        )}
        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={() => resolveDialog(false)}>
            {dialog.cancelLabel ?? '취소'}
          </button>
          <button className={`btn ${dialog.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} disabled={blocked} onClick={() => resolveDialog(true)}>
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function BusyOverlay() {
  const { state } = useKiosk();
  if (!state.busy) return null;
  return (
    <div className="scrim scrim-busy" aria-busy="true">
      <div className="busy">
        <span className="spinner" />
        {state.busy}
      </div>
    </div>
  );
}

export function AgentBanner() {
  const { state } = useKiosk();
  if (state.agentStatus !== 'offline') return null;
  return (
    <div className="agent-banner" role="alert">
      <Icon name="wifiOff" /> 노래방 장비와 연결이 끊겼습니다. 자동으로 다시 연결하는 중입니다. 계속되면 직원을 불러 주세요.
    </div>
  );
}

export function RemoteModal() {
  const { overlay, setOverlay, state, api, toast } = useKiosk();
  const [url, setUrl] = useState<string | null>(null);
  const open = overlay === 'remote';

  useEffect(() => {
    if (!open || !state.session) return;
    let alive = true;
    setUrl(null);
    api.remote
      .createPairing(state.session.id)
      .then((r) => alive && setUrl(r.url))
      .catch((e: Error) => {
        toast(e.message, 'error');
        setOverlay(null);
      });
    return () => {
      alive = false;
    };
  }, [open, state.session, api, toast, setOverlay]);

  if (!open) return null;
  return (
    <div className="scrim" role="dialog" aria-modal="true" onClick={() => setOverlay(null)}>
      <div className="dialog dialog-remote" onClick={(e) => e.stopPropagation()}>
        <h2>휴대폰을 리모컨으로 쓰기</h2>
        <div className="remote-body">
          {url ? <QrImage value={url} size={240} label="리모컨 연결 QR 코드" /> : <div className="qr qr-placeholder" />}
          <ol className="steps">
            <li>MUVIS 앱이나 휴대폰 카메라로 QR을 찍으세요</li>
            <li>휴대폰에서 노래를 검색하고 예약할 수 있어요</li>
            <li>음정·템포 설정은 회원 계정에 곡별로 저장됩니다</li>
          </ol>
        </div>
        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={() => setOverlay(null)}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

/** 시연용: 모의 장비·서버를 직접 조작 (NEXT_PUBLIC_DEV_PANEL=true, 로고 2초 누르기) */
export function DevPanel() {
  const { overlay, setOverlay, state, api, agent, actions, toast } = useKiosk();
  if (overlay !== 'dev') return null;
  const ma = mockApiControls(api);
  const mg = mockControls(agent);
  const sample = ['48215', '47512', 'AI-0101'];

  const run = (label: string, fn: () => void) => () => {
    fn();
    toast(`[DEV] ${label}`, 'info');
  };

  return (
    <div className="scrim" onClick={() => setOverlay(null)}>
      <aside className="devpanel" onClick={(e) => e.stopPropagation()}>
        <h2>시연용 개발 패널</h2>
        <p className="devpanel-note">
          장비 {agent.kind === 'mock' ? '모의' : '로컬 에이전트'} · 서버 {ma ? '모의' : 'HTTP'} · 상태 {state.screen}
        </p>
        {ma && (
          <section>
            <h3>서버</h3>
            <button onClick={run('QR 로그인 승인', () => ma.approvePendingQr())}>앱에서 QR 승인한 것처럼</button>
            <button
              disabled={!state.member}
              onClick={run('+10,000P 충전', async () => {
                if (state.member) ma.addPoints(state.member.id, 10000);
                await actions.refreshBalance();
              })}
            >
              M포인트 +10,000
            </button>
            <button onClick={run('다음 AI 작업 실패 예약', () => ma.failNextJob())}>다음 AI 편집 실패시키기</button>
            <button
              disabled={!state.session}
              onClick={run('리모컨 예약', () => ma.pushRemote({ type: 'reserve', songNo: sample[Math.floor(Math.random() * sample.length)] }))}
            >
              휴대폰 리모컨으로 예약
            </button>
          </section>
        )}
        {mg && (
          <section>
            <h3>장비</h3>
            <button onClick={run('RF 카드 태그', () => mg.simulateRfTag(ma?.demoCardUid ?? 'RF-DEMO'))}>RF 카드 태그</button>
            <button onClick={run('미등록 RF 카드', () => mg.simulateRfTag('RF-UNKNOWN'))}>미등록 RF 카드 태그</button>
            <button onClick={run('장비 연결 끊김', () => mg.setOffline(state.agentStatus !== 'offline'))}>
              {state.agentStatus === 'offline' ? '장비 다시 연결' : '장비 연결 끊기'}
            </button>
          </section>
        )}
        <section>
          <h3>시간</h3>
          <button disabled={!state.session} onClick={run('남은 시간 5분', () => actions.devSetRemaining(5 * 60_000 + 1000))}>
            남은 시간 5분으로
          </button>
          <button disabled={!state.session} onClick={run('남은 시간 10초', () => actions.devSetRemaining(10_000))}>
            남은 시간 10초로
          </button>
        </section>
        <button className="btn btn-ghost" onClick={() => setOverlay(null)}>
          닫기
        </button>
      </aside>
    </div>
  );
}
