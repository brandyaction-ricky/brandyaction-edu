import type { ImgHTMLAttributes } from 'react';

export default function FixtureImage(props: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) {
  const { priority, alt = '', ...imageProps } = props;
  void priority;
  // The browser fixture mirrors next/image without loading the Next.js image runtime.
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={alt} {...imageProps} />;
}
