#!/usr/bin/env bash
# ── MUVIS XR 키오스크 실행 (Linux) ──────────────────────────
# 매장에 맞게 아래 두 값을 바꾸세요.
URL="https://muvis-kiosk.vercel.app"
BOOTH="GANGNAM-01"

CHROME="$(command -v google-chrome || command -v chromium || command -v chromium-browser)"
sleep 5  # 로컬 에이전트가 먼저 뜨도록 대기

exec "$CHROME" \
  --kiosk "$URL/?booth=$BOOTH" \
  --user-data-dir="$HOME/.muvis-kiosk" \
  --noerrdialogs --disable-infobars --no-first-run \
  --disable-translate --disable-features=TranslateUI,Translate \
  --disable-pinch --overscroll-history-navigation=0 \
  --autoplay-policy=no-user-gesture-required \
  --use-fake-ui-for-media-stream \
  --check-for-update-interval=31536000
