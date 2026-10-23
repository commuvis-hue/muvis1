@echo off
REM ── MUVIS XR 키오스크 실행 (Windows) ─────────────────────
REM 매장에 맞게 아래 두 값을 바꾸세요.
set URL=https://muvis-kiosk.vercel.app
set BOOTH=GANGNAM-01

set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

REM 로컬 에이전트가 먼저 떠 있도록 잠시 대기
timeout /t 5 /nobreak >nul

%CHROME% ^
  --kiosk "%URL%/?booth=%BOOTH%" ^
  --user-data-dir="%LOCALAPPDATA%\MuvisKiosk" ^
  --noerrdialogs --disable-infobars --no-first-run ^
  --disable-translate --disable-features=TranslateUI,Translate ^
  --disable-pinch --overscroll-history-navigation=0 ^
  --autoplay-policy=no-user-gesture-required ^
  --use-fake-ui-for-media-stream ^
  --check-for-update-interval=31536000
