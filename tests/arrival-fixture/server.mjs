import {createServer} from 'node:http';
import {build, context} from 'esbuild';
import {resolve, relative, extname, sep} from 'node:path';
import {readFile, stat} from 'node:fs/promises';

const port = Number(process.env.ARRIVAL_QA_PORT || 4497);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('ARRIVAL_QA_PORT must be a valid local development port.');
const root = process.cwd(), outdir = resolve(root, '.arrival-fixture-memory');
const assets = new Map();
const browserBuild = await context({
  entryPoints: ['tests/arrival-fixture/app.tsx'], bundle: true, write: false, outdir,
  format: 'esm', platform: 'browser', jsx: 'automatic', assetNames: 'assets/[name]-[hash]',
  loader: {'.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.png': 'file', '.svg': 'file'},
  alias: {
    'next/link': resolve(root, 'tests/browser/fixture/link.tsx'),
    'react': resolve(root, 'node_modules/react'),
    'react-dom': resolve(root, 'node_modules/react-dom'),
  },
  define: {'process.env.NODE_ENV': '"development"'},
  plugins: [{name: 'memory-assets', setup(builder) {builder.onEnd(result => {
    if (result.errors.length || !result.outputFiles) return;
    assets.clear();
    for (const file of result.outputFiles) assets.set('/' + relative(outdir, file.path).split(sep).join('/'), file.contents);
  });}}],
});
await browserBuild.rebuild();
await browserBuild.watch();

const modules = await build({
  stdin: {contents: `export {config as baseEvent} from './tests/webinar-fixture/data'; export {DEFAULT_WELCOME} from './features/campus/welcome/content'; export {DEFAULT_ARRIVAL,validateArrivalConfig} from './features/campus/arrival/config'; export {validateWebinar} from './features/campus/webinar/domain';`, resolveDir: root, loader: 'ts'},
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const {baseEvent, DEFAULT_WELCOME, DEFAULT_ARRIVAL, validateArrivalConfig, validateWebinar} = await import('data:text/javascript;base64,' + Buffer.from(modules.outputFiles[0].contents).toString('base64'));
const seed = validateWebinar({
  ...baseEvent, slug: 'arrival-synthetic-qa', title: '[합성 QA] 모집 무료 체험', status: 'draft',
  startsAt: '2026-12-07T12:00:00.000Z', endsAt: '2026-12-07T14:00:00.000Z',
  welcome: structuredClone(DEFAULT_WELCOME), arrival: structuredClone(DEFAULT_ARRIVAL),
});
const events = new Map([[seed.slug, seed]]);
const cohorts = [{id: seed.cohortId, name: '합성 QA 전용 기수', course_id: '00000000-0000-4000-8000-000000000003', courses: {title: '로컬 검수 과정', slug: 'moonshot'}}];
const mime = {'.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.mp4': 'video/mp4'};
function reply(res, status, value) {res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'}).end(JSON.stringify(value));}
async function body(req) {
  const parts = []; let size = 0;
  for await (const chunk of req) {size += chunk.length; if (size > 600_000) throw Object.assign(Error('합성 QA 요청은 600KB 이내로 보내주세요.'), {status: 413}); parts.push(chunk);}
  try {return JSON.parse(Buffer.concat(parts).toString('utf8'));} catch {throw Object.assign(Error('JSON 입력을 확인해 주세요.'), {status: 400});}
}

const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    if (!['127.0.0.1:' + port, 'localhost:' + port].includes(req.headers.host || '')) return reply(res, 403, {error: '로컬 검수 주소로 열어주세요.'});
    if (req.headers.origin && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(req.headers.origin)) return reply(res, 403, {error: '로컬 검수 화면에서만 저장할 수 있습니다.'});
    if (url.pathname === '/api/admin/campus/webinars') {
      if (req.method === 'GET') return reply(res, 200, url.searchParams.has('slug') ? {trackingEnabled: false, counts: {entry: 0, experience: 0, gate: 0, detail: 0, consult: 0, checkout: 0}} : {events: [...events.values()], cohorts});
      if (req.method === 'POST') {
        const input = await body(req), event = validateWebinar(input.event), previous = events.get(event.slug);
        if (input.expectedRevision !== (previous?.revision ?? null)) return reply(res, 409, {error: '합성 QA 설정이 변경됐습니다. 목록을 다시 불러와 주세요.'});
        events.set(event.slug, event); return reply(res, 200, {event});
      }
      if (req.method === 'DELETE') {
        const input = await body(req), previous = events.get(input.slug);
        if (!previous || input.expectedRevision !== previous.revision) return reply(res, 409, {error: '합성 QA 설정이 변경됐습니다.'});
        events.delete(input.slug); return reply(res, 200, {ok: true});
      }
      return reply(res, 405, {error: '지원하지 않는 검수 요청입니다.'});
    }
    if (url.pathname === '/api/arrival-fixture/saved' && req.method === 'GET') {
      const event = events.get(url.searchParams.get('event') || seed.slug);
      if (!event?.arrival) return reply(res, 404, {error: '메모리에 저장된 체험이 없습니다.'});
      return reply(res, 200, {arrival: validateArrivalConfig(event.arrival)});
    }
    if (url.pathname.startsWith('/api/')) return reply(res, 503, {error: '이 로컬 검수에는 실제 서버 연결이 없습니다.'});
    if (req.method !== 'GET' && req.method !== 'HEAD') return reply(res, 405, {error: '읽기 전용 검수 파일입니다.'});
    if (assets.has(url.pathname)) {res.setHeader('Content-Type', mime[extname(url.pathname)] || 'application/octet-stream'); res.end(req.method === 'HEAD' ? undefined : assets.get(url.pathname)); return;}
    if (url.pathname.startsWith('/campus/') || url.pathname === '/brandy-action-logo.png') {
      const publicRoot = resolve(root, 'public'), path = resolve(publicRoot, '.' + decodeURIComponent(url.pathname));
      if (!path.startsWith(publicRoot + sep)) return reply(res, 404, {error: '검수 파일을 찾지 못했습니다.'});
      try {
        if (!(await stat(path)).isFile()) throw Error('not a file');
        const type = mime[extname(path)] || 'application/octet-stream';
        res.setHeader('Content-Type', type);
        if (type === 'video/mp4') {
          const bytes = await readFile(path);
          const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
          res.setHeader('Accept-Ranges', 'bytes');
          if (range) {
            const start = Number(range[1]), end = range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
            if (start > end) {
              res.writeHead(416, {'Content-Range': `bytes */${bytes.length}`}); res.end(); return;
            }
            res.writeHead(206, {'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1});
            res.end(req.method === 'HEAD' ? undefined : bytes.subarray(start, end + 1)); return;
          }
          res.setHeader('Content-Length', bytes.length);
          res.end(req.method === 'HEAD' ? undefined : bytes); return;
        }
        res.end(req.method === 'HEAD' ? undefined : await readFile(path)); return;
      } catch {return reply(res, 404, {error: '검수 파일을 찾지 못했습니다.'});}
    }
    const allowed = ['/', '/arrival', '/saved-preview', '/frame', '/webinar-admin', '/admin/campus/webinars', '/experience/moonshot'];
    if (!allowed.includes(url.pathname)) return reply(res, 404, {error: '실제 사이트가 아닌 로컬 합성 검수 경로입니다.'});
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(req.method === 'HEAD' ? undefined : '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>문샷 모집 체험 · 로컬 합성 QA</title><link rel="stylesheet" href="/app.css"><style>html,body,#root{margin:0;min-height:100%;}body{background:#f7f8f9;font-family:var(--font-sans,sans-serif)}button,select{font:inherit}#arrival-fixture-toolbar button,#arrival-fixture-toolbar select{min-height:40px;padding:7px 12px}</style></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
  } catch (error) {reply(res, error.status || 500, {error: error.message || '로컬 합성 검수 오류'});}
});
server.listen(port, '127.0.0.1', () => console.log(`Arrival synthetic QA ready: http://127.0.0.1:${port}/frame (browser bundle watches source changes; memory settings reset when stopped)`));
async function stop() {server.close(); await browserBuild.dispose(); process.exit(0);}
process.once('SIGINT', stop); process.once('SIGTERM', stop);
