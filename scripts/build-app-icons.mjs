// Reproducible raster assets from the repository-owned vector artwork.
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url), source = await readFile(new URL('public/icons/edu-app.svg', root));
for (const [file,size] of [['public/icons/edu-192.png',192],['public/icons/edu-512.png',512],['public/icons/edu-maskable-512.png',512],['app/apple-icon.png',180]]) {
  await sharp(source).resize(size,size).png().toFile(new URL(file,root).pathname);
}
const badge = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><g fill="#fff"><path d="M47 10h17L53 60H40z"/><circle cx="44" cy="77" r="8"/></g></svg>';
await sharp(Buffer.from(badge)).png().toFile(new URL('public/icons/edu-badge-96.png',root).pathname);
