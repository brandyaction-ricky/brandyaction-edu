import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { parse, type DefaultTreeAdapterMap } from 'parse5';

const excluded = new BlockList();
for (const [address, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]] as const) excluded.addSubnet(address, prefix);
for (const [address, prefix] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]] as const) excluded.addSubnet(address, prefix, 'ipv6');
const globalV6 = new BlockList(); globalV6.addSubnet('2000::', 3, 'ipv6');
export function publicPreviewAddress(address: string) {
  const family = isIP(address);
  return family === 4 ? !excluded.check(address) : family === 6 && globalV6.check(address, 'ipv6') && !excluded.check(address, 'ipv6');
}
export function previewUrl(raw: string) {
  const url = new URL(raw);
  if (raw.length > 4000 || url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
    isIP(url.hostname.replace(/^\[|\]$/g, '')) || !url.hostname.includes('.') || url.hostname.endsWith('.') ||
    /\.(localhost|local|internal|invalid|test)$/i.test(url.hostname)) throw Error('PREVIEW_URL');
  url.hash = ''; return url;
}
export function previewTitle(html: string) {
  const document = parse(html); let title = '', og = '';
  const pending: DefaultTreeAdapterMap['node'][] = [document];
  while (pending.length) {
    const node = pending.pop()!;
    if ('tagName' in node && node.tagName === 'meta') {
      const attributes = Object.fromEntries(node.attrs.map(a => [a.name, a.value]));
      if (!og && (attributes.property || attributes.name || '').toLowerCase() === 'og:title') og = attributes.content || '';
    }
    if ('tagName' in node && node.tagName === 'title' && !title) title = node.childNodes.filter(n => n.nodeName === '#text').map(n => (n as DefaultTreeAdapterMap['textNode']).value).join('');
    if ('childNodes' in node) pending.push(...[...node.childNodes].reverse());
  }
  return (og || title).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}
type Dependencies = { resolve: typeof lookup; send: typeof request };
function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const stop = () => reject(Error('PREVIEW_TIMEOUT'));
    if (signal.aborted) { stop(); return; }
    signal.addEventListener('abort', stop, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}
export async function readLinkPreview(raw: string, dependencies: Dependencies = { resolve: lookup, send: request }) {
  const original = previewUrl(raw), signal = AbortSignal.timeout(6000);
  let url = original;
  for (let redirects = 0; redirects <= 3; redirects++) {
    const addresses = await abortable(dependencies.resolve(url.hostname, { all: true }), signal);
    if (!addresses.length || addresses.some(row => !publicPreviewAddress(row.address))) throw Error('PREVIEW_ADDRESS');
    // Connect to the validated IP directly, with the original TLS identity and Host.
    // A second DNS lookup and pooled sockets cannot change the destination.
    const response = await new Promise<{ location?: string; html?: string }>((resolve, reject) => {
      const req = dependencies.send({ hostname: addresses[0].address, family: addresses[0].family, port: 443, servername: url.hostname,
        path: url.pathname + url.search, method: 'GET', agent: false, signal, maxHeaderSize: 16384,
        headers: { Host: url.host, Accept: 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity', 'User-Agent': 'BrandyEdu-LinkPreview/1.0' } }, res => {
        res.on('error', reject);
        if ([301,302,303,307,308].includes(res.statusCode || 0)) { const location = res.headers.location; resolve({ location }); res.destroy(); return; }
        if (res.statusCode !== 200 || !/^text\/html\b|^application\/xhtml\+xml\b/i.test(res.headers['content-type'] || '') ||
          (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') || Number(res.headers['content-length']) > 524288) { reject(Error('PREVIEW_RESPONSE')); res.destroy(); return; }
        const chunks: Buffer[] = []; let size = 0;
        res.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 524288) { reject(Error('PREVIEW_SIZE')); res.destroy(); } else chunks.push(chunk); });
        res.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject); req.end();
    });
    if (response.html !== undefined) return { title: previewTitle(response.html) || original.hostname, domain: original.hostname };
    if (!response.location) throw Error('PREVIEW_RESPONSE');
    url = previewUrl(new URL(response.location, url).href);
  }
  throw Error('PREVIEW_REDIRECTS');
}
