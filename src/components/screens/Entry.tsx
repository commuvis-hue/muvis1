'use client';

import { useEffect, useState } from 'react';
import { policy } from '@/lib/config';
import { pts } from '@/lib/format';
import { useKiosk } from '@/lib/kiosk/store';
import type { LoginQr } from '@/lib/api';
import type { AdSlide } from '@/lib/types';
import { Icon } from '../Icon';
import { QrImage } from '../QrImage';

// ── 대기화면 ─────────────────────────────────────────────
export function AttractScreen() {
  const { api, actions } = useKiosk();
  const [ads, setAds] = useState<AdSlide[]>([]);
  const [i, setI] = useState(0);

  useEffect(() => {
    api.content.ads().then(setAds).catch(() => undefined);
  }, [api]);

  useEffect(() => {
    if (ads.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % ads.length), 6000);
    return () => clearInterval(t);
  }, [ads.length]);

  const ad = ads[i];
  return (
    <button className="attract" onClick={() => actions.go('login')} aria-label="시작하기">
      <span className="attract-beam attract-beam-l" aria-hidden="true" />
      <span className="attract-beam attract-beam-r" aria-hidden="true" />
      <span className="attract-word" aria-hidden="true">
        MUVIS<em>XR</em>
      </span>
      <span className="attract-tag">노래하면, 뮤직비디오가 됩니다</span>
      {ad && (
        <span key={ad.id} className={`attract-ad tone-${ad.tone}`}>
          <strong>{ad.headline}</strong>
          <span>{ad.sub}</span>
        </span>
      )}
      <span className="attract-cta">
        <Icon name="mic" /> 화면을 터치해 시작하세요
      </span>
    </button>
  );
}

// ── QR · RF 로그인 ───────────────────────────────────────
export function LoginScreen() {
  const { api, state, actions, now } = useKiosk();
  const [qr, setQr] = useState<LoginQr | null>(null);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let alive = true;
    let poll: ReturnType<typeof setInterval> | null = null;
    setQr(null);
    api.auth
      .createLoginQr(state.boothId)
      .then((q) => {
        if (!alive) return;
        setQr(q);
        poll = setInterval(async () => {
          try {
            const r = await api.auth.pollLoginQr(q.token);
            if (!alive) return;
            if (r.status === 'approved') {
              alive = false;
              if (poll) clearInterval(poll);
              void actions.loginSuccess(r.member);
            } else if (r.status === 'expired') {
              if (poll) clearInterval(poll);
              setQr((cur) => (cur ? { ...cur, expiresAt: 0 } : cur));
            }
          } catch {
            /* 다음 주기에 재시도 */
          }
        }, 2000);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (poll) clearInterval(poll);
    };
    // actions는 매 렌더 새로 만들어지므로 의존성에서 제외 (최신 값은 내부에서 읽음)
  }, [api, state.boothId, round]);

  const leftSec = qr ? Math.max(0, Math.floor((qr.expiresAt - now) / 1000)) : 0;
  const expired = qr !== null && leftSec === 0;

  return (
    <section className="screen login">
      <header className="screen-head">
        <h1>로그인하고 시작하기</h1>
        <p>MUVIS 회원만 이용할 수 있어요. 둘 중 편한 방법을 고르세요.</p>
      </header>
      <div className="login-grid">
        <div className="login-card">
          <h2>
            <Icon name="qr" /> 앱으로 QR 찍기
          </h2>
          <div className={`login-qr${expired ? ' is-expired' : ''}`}>
            {qr ? <QrImage value={qr.url} size={288} label="로그인 QR 코드" /> : <div className="qr qr-placeholder" />}
            {expired && (
              <button className="btn btn-primary login-refresh" onClick={() => setRound((r) => r + 1)}>
                <Icon name="redo" /> 새 QR 받기
              </button>
            )}
          </div>
          <p className="login-hint">
            {expired ? 'QR 유효 시간이 지났습니다' : qr ? `MUVIS 앱 → QR 스캔 · ${leftSec}초 동안 유효` : 'QR 준비 중'}
          </p>
          <p className="login-sub">앱이 없다면 휴대폰 카메라로 찍어 가입부터 할 수 있어요</p>
        </div>
        <div className="login-or" aria-hidden="true">또는</div>
        <div className="login-card">
          <h2>
            <Icon name="card" /> RF 카드 태그
          </h2>
          <div className="rf-pad" aria-hidden="true">
            <span className="rf-ring" />
            <span className="rf-ring rf-ring-2" />
            <Icon name="card" size="4.5rem" />
          </div>
          <p className="login-hint">충전된 MUVIS 카드를 아래 리더기에 대 주세요</p>
          <p className="login-sub">카드 등록과 충전은 MUVIS 앱에서 할 수 있어요</p>
        </div>
      </div>
      <footer className="screen-foot">
        <button className="btn btn-ghost" onClick={() => actions.cancelLogin()}>
          <Icon name="back" /> 처음으로
        </button>
      </footer>
    </section>
  );
}

// ── 30분 이용권 결제 ─────────────────────────────────────
export function PaymentScreen() {
  const { state, actions } = useKiosk();
  const { member, points, pricing } = state;
  if (!member || !pricing) return null;
  const after = points - pricing.sessionBase;
  const enough = after >= 0;

  return (
    <section className="screen payment">
      <header className="screen-head">
        <h1>{member.nickname}님, 반가워요</h1>
        <p>M포인트로 이용권을 결제하면 바로 시작합니다.</p>
      </header>
      <div className="receipt">
        <div className="receipt-ticket">
          <span className="receipt-min">{policy.sessionMinutes}</span>
          <span className="receipt-unit">분 이용권</span>
          <span className="receipt-note">이후 {policy.extendMinutes}분 단위 연장 · {pts(pricing.extension)}</span>
        </div>
        <dl className="receipt-lines">
          <div>
            <dt>보유 M포인트</dt>
            <dd>{pts(points)}</dd>
          </div>
          <div>
            <dt>이용권</dt>
            <dd>−{pts(pricing.sessionBase)}</dd>
          </div>
          <div className="receipt-total">
            <dt>결제 후 잔액</dt>
            <dd className={enough ? '' : 'is-short'}>{enough ? pts(after) : `${pts(-after)} 부족`}</dd>
          </div>
        </dl>
        {!enough && (
          <p className="receipt-warn">
            MUVIS 앱에서 M포인트를 충전한 뒤 잔액 새로고침을 눌러 주세요.
          </p>
        )}
      </div>
      <footer className="screen-foot">
        <button className="btn btn-ghost" onClick={() => actions.cancelLogin()}>
          취소
        </button>
        {enough ? (
          <button className="btn btn-primary btn-xl" onClick={() => actions.pay()}>
            {pts(pricing.sessionBase)} 결제하고 시작
          </button>
        ) : (
          <button className="btn btn-primary btn-xl" onClick={() => actions.refreshBalance()}>
            <Icon name="redo" /> 잔액 새로고침
          </button>
        )}
      </footer>
    </section>
  );
}

// ── 모드 선택 ────────────────────────────────────────────
export function ModeScreen() {
  const { state, actions } = useKiosk();
  return (
    <section className="screen mode">
      <header className="screen-head">
        <h1>어떻게 부를까요?</h1>
        <p>이용 중에도 상단의 모드 버튼으로 언제든 바꿀 수 있어요.</p>
      </header>
      <div className="mode-grid">
        <button className={`mode-card mode-xr${state.mode === 'xr' ? ' is-current' : ''}`} onClick={() => actions.chooseMode('xr')}>
          <span className="mode-title">XR 스튜디오</span>
          <span className="mode-desc">카메라 {Math.max(3, state.cameras.length)}대가 동시에 녹화하고, 끝까지 부른 곡은 AI가 숏폼·롱폼 뮤직비디오로 만들어 드립니다.</span>
          <span className="mode-meta">
            <Icon name="camera" /> 녹화 · <Icon name="spark" /> AI 편집 · <Icon name="upload" /> 앱 업로드
          </span>
        </button>
        <button className={`mode-card mode-just${state.mode === 'just' ? ' is-current' : ''}`} onClick={() => actions.chooseMode('just')}>
          <span className="mode-title">JUST 노래방</span>
          <span className="mode-desc">촬영 없이 노래만 마음껏. 일반 노래방처럼 이용합니다.</span>
          <span className="mode-meta">
            <Icon name="mic" /> 노래만
          </span>
        </button>
      </div>
    </section>
  );
}

// ── 이용 종료 ────────────────────────────────────────────
export function SessionEndScreen() {
  const { state, actions } = useKiosk();
  const [left, setLeft] = useState(policy.sessionEndReturnSeconds);
  const making = state.jobs.filter((j) => j.status === 'queued' || j.status === 'processing').length;
  const uploaded = state.jobs.filter((j) => j.published).length;

  useEffect(() => {
    const t = setInterval(() => setLeft((x) => x - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left <= 0) actions.resetToAttract();
  }, [left, actions]);

  return (
    <section className="screen session-end">
      <h1 className="end-title">오늘 무대는 여기까지</h1>
      <dl className="end-stats">
        <div>
          <dt>부른 곡</dt>
          <dd>{state.songsSung}</dd>
        </div>
        <div>
          <dt>앱에 올린 영상</dt>
          <dd>{uploaded}</dd>
        </div>
        <div>
          <dt>제작 중인 영상</dt>
          <dd>{making}</dd>
        </div>
      </dl>
      <p className="end-note">
        {making > 0
          ? '제작 중인 뮤직비디오는 완성되면 MUVIS 앱으로 알려드립니다.'
          : '만든 영상은 MUVIS 앱 내 뮤직영상에서 언제든 다시 볼 수 있어요.'}
      </p>
      <button className="btn btn-primary btn-xl" onClick={() => actions.resetToAttract()}>
        처음 화면으로 ({left})
      </button>
    </section>
  );
}
