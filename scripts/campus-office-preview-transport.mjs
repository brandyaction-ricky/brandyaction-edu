import { execFile } from 'node:child_process';
// Operator-only DEV transport. Production/student reporters use HTTPS directly.
// Vercel CLI reuses the operator's existing login; no platform key is exported.
export function protectedPreviewFetch(url, init) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    if (target.protocol !== 'https:' || !target.hostname.endsWith('.vercel.app') || target.pathname !== '/api/campus/office/webhook') { reject(new Error('Invalid Preview endpoint')); return; }
    const args = ['curl', target.pathname, '--deployment', target.origin, '--scope', 'brandyaction', '--', '--silent', '--show-error', '--max-time', '15', '--request', 'POST', '--data-binary', '@-', '--output', '/dev/null', '--write-out', '%{http_code}'];
    for (const [key, value] of Object.entries(init.headers)) args.push('--header', `${key}: ${value}`);
    const child = execFile('vercel', args, { timeout: 20000, maxBuffer: 65536 }, (error, stdout) => {
      if (error || !/^\d{3}$/.test(stdout.trim())) { reject(new Error('Protected Preview delivery unconfirmed')); return; }
      resolve(new Response(null, { status: Number(stdout.trim()) }));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(init.body);
  });
}
