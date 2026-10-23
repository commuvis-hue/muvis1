'use client';

import { useEffect, useState } from 'react';
import { mmss } from '@/lib/format';
import { CHOSUNG_KEYS } from '@/lib/hangul';
import { useKiosk } from '@/lib/kiosk/store';
import { GENRES, type CatalogTab, type Song } from '@/lib/types';
import { Icon } from '../Icon';

const TAB_TITLE: Record<CatalogTab, string> = {
  popular: '인기곡',
  new: '신곡',
  genre: '장르별',
  ai: 'AI 음원',
};

const KEYSETS = {
  초성: CHOSUNG_KEYS,
  숫자: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ABC: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
};
type KeySet = keyof typeof KEYSETS;

export function BrowseScreen() {
  const { state, api, actions } = useKiosk();
  const { catalogTab, genre, queue } = state;
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [keyset, setKeyset] = useState<KeySet>('초성');

  useEffect(() => {
    let alive = true;
    setSongs(null);
    const req = searching && query ? api.catalog.search(query) : api.catalog.list(catalogTab, genre);
    req.then((r) => alive && setSongs(r)).catch(() => alive && setSongs([]));
    return () => {
      alive = false;
    };
  }, [api, catalogTab, genre, searching, query]);

  const title = searching ? '노래 검색' : TAB_TITLE[catalogTab];
  const showRank = !searching && catalogTab === 'popular';

  return (
    <section className="screen browse">
      <div className="browse-main">
        <header className="browse-head">
          <h1>{title}</h1>
          {!searching && catalogTab === 'genre' && (
            <div className="chips" role="tablist" aria-label="장르">
              <button className={`chip${genre === null ? ' is-on' : ''}`} onClick={() => actions.setTab('genre', null)}>
                전체
              </button>
              {GENRES.map((g) => (
                <button key={g} className={`chip${genre === g ? ' is-on' : ''}`} onClick={() => actions.setTab('genre', g)}>
                  {g}
                </button>
              ))}
            </div>
          )}
          {!searching && catalogTab === 'ai' && (
            <p className="browse-note">MUVIS AI가 만든 곡이라 완성된 뮤직비디오를 어디든 자유롭게 공유할 수 있어요.</p>
          )}
          <button
            className={`btn ${searching ? 'btn-ghost' : 'btn-outline'} browse-search-toggle`}
            onClick={() => {
              setSearching((v) => !v);
              setQuery('');
            }}
          >
            <Icon name={searching ? 'close' : 'search'} /> {searching ? '검색 닫기' : '검색'}
          </button>
        </header>

        <div className="songlist" role="list">
          {songs === null && <p className="empty">불러오는 중</p>}
          {songs?.length === 0 && (
            <p className="empty">
              {searching ? `‘${query}’에 맞는 곡이 없어요. 초성이나 곡 번호로도 찾아보세요.` : '곡이 없습니다'}
            </p>
          )}
          {songs?.map((s) => (
            <div className="song" role="listitem" key={s.no}>
              {showRank && s.rank ? (
                <span className={`song-no is-rank r${s.rank}`}>{s.rank}</span>
              ) : (
                <span className="song-no is-code">{s.no}</span>
              )}
              <span className="song-text">
                <strong>
                  {s.title}
                  {s.isNew && <em className="tag tag-new">NEW</em>}
                  {s.source === 'ai' && <em className="tag tag-ai">AI</em>}
                </strong>
                <span>
                  {s.artist}
                  {showRank && s.rank ? ` · ${s.no}` : ''}
                </span>
              </span>
              <span className="song-genre">{s.genre}</span>
              <span className="song-dur">{mmss(s.durationSec)}</span>
              <span className="song-actions">
                <button className="btn btn-outline btn-sm" onClick={() => actions.requestSong(s, 'reserve')}>
                  예약
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => actions.requestSong(s, 'start')}>
                  <Icon name="play" size="1em" /> 시작
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>

      <aside className="browse-side">
        {searching ? (
          <div className="keypad">
            <div className="keypad-display" aria-live="polite">
              {query || <span className="keypad-placeholder">곡 제목·가수 초성, 곡 번호</span>}
            </div>
            <div className="keypad-sets" role="tablist">
              {(Object.keys(KEYSETS) as KeySet[]).map((k) => (
                <button key={k} className={`chip${keyset === k ? ' is-on' : ''}`} onClick={() => setKeyset(k)}>
                  {k}
                </button>
              ))}
            </div>
            <div className={`keys keys-${keyset === 'ABC' ? 'abc' : 'ko'}`}>
              {KEYSETS[keyset].map((k) => (
                <button key={k} className="key" onClick={() => setQuery((q) => (q + k).slice(0, 20))}>
                  {k}
                </button>
              ))}
              <button className="key key-wide" onClick={() => setQuery((q) => q + ' ')}>
                띄어쓰기
              </button>
              <button className="key" onClick={() => setQuery((q) => q.slice(0, -1))} aria-label="한 글자 지우기">
                <Icon name="back" />
              </button>
              <button className="key" onClick={() => setQuery('')}>
                지움
              </button>
            </div>
          </div>
        ) : (
          <QueuePanel queue={queue} onRemove={actions.removeFromQueue} />
        )}
      </aside>
    </section>
  );
}

export function QueuePanel({ queue, onRemove, compact }: { queue: Song[]; onRemove?: (i: number) => void; compact?: boolean }) {
  return (
    <div className={`queue${compact ? ' queue-compact' : ''}`}>
      <h2>
        <Icon name="queue" /> 예약 {queue.length}곡
      </h2>
      {queue.length === 0 ? (
        <p className="queue-empty">예약한 곡이 없어요. 곡 옆의 예약을 누르거나 휴대폰 리모컨으로 담아 보세요.</p>
      ) : (
        <ol>
          {queue.slice(0, compact ? 3 : 12).map((s, i) => (
            <li key={`${s.no}-${i}`}>
              <span className="queue-i">{i + 1}</span>
              <span className="queue-text">
                <strong>{s.title}</strong>
                <span>{s.artist}</span>
              </span>
              {onRemove && (
                <button className="queue-x" onClick={() => onRemove(i)} aria-label={`${s.title} 예약 취소`}>
                  <Icon name="close" size="1.1em" />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
