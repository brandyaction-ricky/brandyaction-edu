import { ImageResponse } from 'next/og';

export const runtime = 'edge';

// Public, environment-independent fallback. No customer data or remote image fetches.
export function GET() {
  return new ImageResponse(
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', height: '100%', padding: 80, background: '#f8f8f6', color: '#17191b' }}>
      <div style={{ display: 'flex', color: '#cf1724', fontSize: 30, letterSpacing: 5 }}>BRANDYACTION EDU</div>
      <div style={{ display: 'flex', flexDirection: 'column', fontSize: 88, fontWeight: 700, lineHeight: 1.1 }}>
        <div style={{ display: 'flex' }}>Learn. Apply.</div>
        <div style={{ display: 'flex', color: '#cf1724' }}>Make it work.</div>
      </div>
      <div style={{ display: 'flex', fontSize: 24, color: '#626872' }}>AI &amp; MARKETING</div>
    </div>,
    { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
}
