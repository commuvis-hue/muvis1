'use client';

import { useEffect, useState } from 'react';
import { useKiosk } from '@/lib/kiosk/store';
import type { AdSlide, Audition, NewsItem } from '@/lib/types';
import { Icon } from '../Icon';

const dday = (ts: number) => {
  const d = Math.ceil((ts - Date.now()) / 86_400_000);
  return d <= 0 ? '오늘 마감' : `D-${d}`;
};

// ── 오디션 참가 ──────────────────────────────────────────
export function AuditionScreen() {
  const { state, api, actions } = useKiosk();
  const [list, setList] = useState<Audition[] | null>(null);
  const [picked, setPicked] = useState<Audition | null>(null);
  const uploaded = state.jobs.filter((j) => j.published);

  const load = () => api.auditions.list().then(setList).catch(() => setList([]));
  useEffect(() => {
    void load();
  }, [api]);

  if (picked) {
    return (
      <section className="screen audition">
        <header className="screen-head">
          <h1>{picked.title}</h1>
          <p>{picked.description}</p>
        </header>
        <h2 className="sub-head">참가할 영상을 고르세요</h2>
        {uploaded.length === 0 ? (
          <div className="empty-block">
            <p>앱에 업로드한 영상만 오디션에 참가할 수 있어요. XR 스튜디오에서 노래하고 뮤직비디오를 업로드해 주세요.</p>
          </div>
        ) : (
          <ul className="videolist">
            {uploaded.map((j) => (
              <li key={j.id}>
                <button
                  className="video-row"
                  onClick={async () => {
                    const ok = await actions.enterAudition(picked.id, picked.title, j.id);
                    if (ok) {
                      setPicked(null);
                      void load();
                    }
                  }}
                >
                  <span className="video-thumb status-done" aria-hidden="true">
                    <Icon name="play" />
                  </span>
                  <span className="video-text">
                    <strong>{j.song.title}</strong>
                    <span>{j.song.artist}</span>
                  </span>
                  <span className="status status-published">이 영상으로 참가</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <footer className="screen-foot">
          <button className="btn btn-ghost" onClick={() => setPicked(null)}>
            <Icon name="back" /> 오디션 목록
          </button>
        </footer>
      </section>
    );
  }

  return (
    <section className="screen audition">
      <header className="screen-head">
        <h1>오디션 참가</h1>
        <p>부스에서 만든 영상으로 바로 참가할 수 있어요. 심사와 투표 결과는 MUVIS 앱으로 알려드립니다.</p>
      </header>
      {list === null && <p className="empty">불러오는 중</p>}
      <ul className="auditions">
        {list?.map((a) => (
          <li key={a.id}>
            <button className="audition-row" disabled={!!a.enteredVideoJobId} onClick={() => setPicked(a)}>
              <span className="audition-dday">{dday(a.endsAt)}</span>
              <span className="audition-text">
                <strong>{a.title}</strong>
                <span>{a.description}</span>
                <em>{a.host}</em>
              </span>
              <span className="status status-published">{a.enteredVideoJobId ? '참가 완료' : '참가하기'}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── 광고 ─────────────────────────────────────────────────
export function AdsScreen() {
  const { api } = useKiosk();
  const [ads, setAds] = useState<AdSlide[]>([]);
  useEffect(() => {
    api.content.ads().then(setAds).catch(() => undefined);
  }, [api]);
  return (
    <section className="screen ads">
      {ads.map((a) => (
        <article key={a.id} className={`ad tone-${a.tone}`}>
          <h2>{a.headline}</h2>
          <p>{a.sub}</p>
        </article>
      ))}
    </section>
  );
}

// ── MUVIS 뉴스 ───────────────────────────────────────────
export function NewsScreen() {
  const { api } = useKiosk();
  const [news, setNews] = useState<NewsItem[]>([]);
  useEffect(() => {
    api.content.news().then(setNews).catch(() => undefined);
  }, [api]);
  return (
    <section className="screen news">
      <header className="screen-head">
        <h1>MUVIS 뉴스</h1>
      </header>
      <ul className="newslist">
        {news.map((n) => (
          <li key={n.id}>
            <time>{n.date}</time>
            <div>
              <h2>{n.title}</h2>
              <p>{n.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
