export function lessonDownloadLocation(signedUrl: string, download: string | boolean): string {
  if (!download) return signedUrl;

  // Set the original filename after signing. The Storage SDK can encode its download option twice.
  const url = new URL(signedUrl);
  url.searchParams.set('download', download === true ? '' : download);
  return url.href;
}
