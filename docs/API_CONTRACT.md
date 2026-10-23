# MUVIS 통합 서버 API 계약 (키오스크 사용분) v0.1

키오스크가 호출하는 엔드포인트입니다. 화면 쪽 구현: `src/lib/api/httpApi.ts` · 타입: `src/lib/api/types.ts`, `src/lib/types.ts`

## 공통

- Base URL: `NEXT_PUBLIC_API_BASE` (예: `https://api.muvis.example.com/v1`)
- 인증: `Authorization: Bearer <부스 기기 토큰>`
- 포인트가 움직이는 요청은 `Idempotency-Key` 헤더를 보냅니다. 같은 키의 재요청에는 **처음 결과를 그대로** 돌려줘야 합니다(중복 차감 금지). 서버는 포인트 원장에 키를 함께 기록합니다.
- 오류 응답: `{ "error": { "code": "INSUFFICIENT_POINTS", "message": "사용자에게 보여줄 문장" } }`
  - code: `INSUFFICIENT_POINTS` `QR_EXPIRED` `UNKNOWN_CARD` `SESSION_EXPIRED` `NOT_FOUND` `CONFLICT`

## 인증

| 요청 | 응답 |
| --- | --- |
| `POST /booth/login-qr` `{ boothId }` | `{ token, url, expiresAt }` — url은 모바일 웹 승인 페이지 |
| `GET /booth/login-qr/{token}` | `{ status:"pending" }` · `{ status:"expired" }` · `{ status:"approved", member:{ id, nickname } }` |
| `POST /booth/rf-login` `{ uid, boothId }` | `{ id, nickname }` |

## 포인트 · 이용권

| 요청 | 응답 |
| --- | --- |
| `GET /members/{id}/balance` | `{ balance }` |
| `GET /booths/{boothId}/pricing` | `{ sessionBase, extension, regenerate, extraUpload }` |
| `POST /sessions` `{ memberId, boothId }` 🔑 | `{ session, balance, charged }` |
| `POST /sessions/{id}/extend` 🔑 | `{ session, balance, charged }` |
| `POST /sessions/{id}/end` | `{}` |

`session = { id, memberId, boothId, startedAt, endsAt, extensions }` (epoch ms). 남은 시간의 기준은 서버의 `endsAt`입니다.

## 노래책

| 요청 | 응답 |
| --- | --- |
| `GET /catalog?tab=popular|new|genre|ai&genre=발라드` | `Song[]` |
| `GET /catalog/search?q=` | `Song[]` — 곡번호 앞자리, 제목·가수, 한글 초성 검색 |
| `GET /catalog/{no}` | `Song` |

## 녹화 · AI 편집 · 업로드

| 요청 | 응답 |
| --- | --- |
| `POST /takes` `{ sessionId, songNo, recording, cameraCount, maskId }` | `Take` — AI 편집 시 `maskId` 가면을 모든 앵글에 합성 |
| `POST /ai-jobs` `{ takeId, formats:["short","long"] }` 🔑 | `AiJob` |
| `GET /ai-jobs/{id}` | `AiJob` — 키오스크가 1.5초마다 조회 |
| `POST /ai-jobs/{id}/regenerate` 🔑 | `{ job, balance, charged }` — 실패 건은 `charged:0` |
| `GET /members/{id}/upload-quota` | `{ freeLeft, freeTotal }` |
| `POST /ai-jobs/{id}/publish` 🔑 | `{ job, quota, balance, charged }` — 무료 횟수 내면 `charged:0` |
| `GET /members/{id}/videos` | `AiJob[]` |

`AiJob = { id, takeId, song:{title, artist}, status:"queued"|"processing"|"done"|"failed", progress, attempt, createdAt, outputs?:{ short?:{url, posterUrl, durationSec}, long?:{…} }, error?, published }`

## AR 가면

| 요청 | 응답 |
| --- | --- |
| `GET /members/{id}/masks` | `MaskOffer[]` — `{ id, tier:"free"|"premium", price, owned }` |
| `POST /members/{id}/masks/{maskId}/purchase` 🔑 | `{ offers, balance, charged }` — 계정에 영구 보관 |

가면 모양은 키오스크 카탈로그(`src/lib/ar/masks.ts`)의 `id`와 일치해야 합니다.

## 오디션 · 콘텐츠

| 요청 | 응답 |
| --- | --- |
| `GET /auditions?open=true` | `Audition[]` |
| `POST /auditions/{id}/entries` `{ jobId }` | `Audition` — 업로드된 영상만 가능, 참가 후 삭제 불가 |
| `GET /content/news` | `NewsItem[]` |
| `GET /content/ads?placement=kiosk` | `AdSlide[]` |

## 스마트 리모컨

| 요청 | 응답 |
| --- | --- |
| `POST /sessions/{id}/remote-pairing` | `{ token, url }` |
| `GET /sessions/{id}/remote-events` (SSE) | `RemoteCommand` 스트림 |

`RemoteCommand = { type:"reserve", songNo, priority? } | { type:"start", songNo } | { type:"pause"|"resume"|"stop"|"skipInterlude" }`

Vercel 서버리스 함수는 연결을 오래 유지하지 못하므로, 운영에서는 SSE 대신 Supabase Realtime·Ably 같은 실시간 채널(`session:{id}`)을 권장합니다.
