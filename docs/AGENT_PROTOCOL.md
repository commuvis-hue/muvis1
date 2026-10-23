# 로컬 에이전트 프로토콜 v0.1

키오스크 화면(브라우저)은 노래방 기기에 설치된 **로컬 에이전트**와 WebSocket으로 통신합니다. 에이전트는 반주기·카메라·녹화·LED·RF 리더처럼 브라우저가 직접 다루기 어려운 장비를 맡습니다. 기존 KYAgent(C++)의 역할을 이어받는 프로그램입니다.

화면 쪽 구현: `src/lib/agent/localAgent.ts` · 인터페이스: `src/lib/agent/types.ts`

## 연결

- 주소: `ws://127.0.0.1:7700` (환경변수 `NEXT_PUBLIC_AGENT_URL`)
- 같은 포트에서 HTTP로 카메라 미리보기 MJPEG 제공: `http://127.0.0.1:7700/preview/{cameraId}.mjpg`
- 끊기면 화면이 0.5초 → 최대 10초 간격으로 자동 재연결합니다.
- HTTPS(Vercel) 페이지에서 `ws://127.0.0.1` 접속은 Chrome이 허용합니다(localhost 예외). 다른 호스트를 쓰려면 `wss://`가 필요합니다.
- 보안: 에이전트는 `127.0.0.1`에만 바인딩하고, `Origin` 헤더가 키오스크 배포 도메인일 때만 연결을 받아야 합니다.

## 메시지 형식

```jsonc
// 화면 → 에이전트 (요청)
{ "id": 12, "method": "accompanist.play", "params": { "songNo": "48215" } }

// 에이전트 → 화면 (응답)
{ "id": 12, "result": null }
{ "id": 12, "error": { "message": "반주기 응답 없음" } }

// 에이전트 → 화면 (이벤트, id 없음)
{ "event": "song:progress", "data": { "songNo": "48215", "positionSec": 31.5, "durationSec": 201 } }
```

응답 제한 시간: 기본 8초, `recorder.start` 15초, `recorder.stop` 30초.

## 메서드

| method | params | result | 설명 |
| --- | --- | --- | --- |
| `accompanist.play` | `{ songNo }` | – | 반주 시작. 시작되면 `song:started` 이벤트 |
| `accompanist.pause` / `resume` | – | – | 일시정지 / 재개 |
| `accompanist.stop` | – | – | 정지. `song:ended { completed:false }` 이벤트를 반드시 보냄 |
| `accompanist.skipInterlude` | – | – | 간주 점프 |
| `camera.list` | – | `CameraInfo[]` | `{ id, label }` 목록 |
| `recorder.start` | `{ takeId, cameraIds[], maskId }` | – | 카메라별 원본 + 반주·마이크 오디오를 타임코드 동기화해 녹화. 원본은 가면 없이 저장하고 `maskId`는 메타데이터로 기록 |
| `recorder.stop` | – | `RecordingResult` | `{ takeId, tracks:[{cameraId, uri}], audioUri, durationSec }` |
| `led.setSource` | `{ source }` | – | 카메라 ID 또는 `"auto"` |
| `ar.setMask` | `{ maskId }` | – | LED 송출과 `/preview` 영상의 얼굴에 가면 실시간 합성. `null`이면 벗기. 기존 Unreal AR 모듈을 여기에 연결할 수 있습니다 |

## 이벤트

| event | data | 설명 |
| --- | --- | --- |
| `rf:tag` | `{ uid }` | RF 카드 태그 |
| `song:started` | `{ songNo, durationSec }` | 반주 시작 |
| `song:progress` | `{ songNo, positionSec, durationSec }` | 0.25~1초 간격 |
| `song:ended` | `{ songNo, completed }` | 끝까지 재생 시 `completed:true` |
| `error` | `{ message }` | 화면에 오류 알림으로 표시 |

## 녹화 원본 업로드

녹화 파일은 크기가 커서 브라우저를 거치지 않습니다. `recorder.stop` 이후 에이전트가 통합 서버에서 사전 서명 URL을 받아 스토리지(S3·R2 등)로 직접 업로드하고, 완료를 서버에 보고합니다. 화면은 `takes.register`로 메타데이터만 등록하며, AI 편집 서버는 업로드 완료 후 작업을 시작합니다.

## 권장 구현

Node.js(`ws`, `serialport`, `ffmpeg`) 또는 기존 C++ 코드 재사용. Windows 서비스(또는 systemd)로 등록해 부팅 시 자동 실행하고, 반주기 시리얼 포트·카메라 장치 번호는 설정 파일로 관리합니다.
