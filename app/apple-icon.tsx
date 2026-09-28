import { ImageResponse } from 'next/og';
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';
export default function Icon() {
  return new ImageResponse(<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: '#c91c2d', color: 'white', fontSize: 130, fontWeight: 700 }}>EDU</div>, size);
}
