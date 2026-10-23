/** 매장 모니터링용 헬스체크: GET /api/health */
export function GET() {
  return Response.json({
    ok: true,
    service: 'muvis-kiosk',
    agentMode: process.env.NEXT_PUBLIC_AGENT_MODE || 'mock',
    apiMode: process.env.NEXT_PUBLIC_API_MODE || 'mock',
    time: new Date().toISOString(),
  });
}
