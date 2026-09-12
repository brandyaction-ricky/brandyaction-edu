import { createAdminClient } from '@/lib/supabase/admin';
import { permissionsFor } from '@/lib/operator-permissions';
import { getAuthenticatedUser } from '@/lib/server-auth';

const MB = 1024 * 1024;
const fileKinds = {
    image: {
        bucket: 'course-assets',
        maxBytes: 10 * MB,
        allowed: {
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            webp: 'image/webp',
        } as Record<string, string>,
    },
    resource: {
        bucket: 'course-resources',
        maxBytes: 20 * MB,
        allowed: {
            pdf: 'application/pdf',
            zip: 'application/zip',
            txt: 'text/plain',
            csv: 'text/csv',
            doc: 'application/msword',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            xls: 'application/vnd.ms-excel',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ppt: 'application/vnd.ms-powerpoint',
            pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            hwp: 'application/x-hwp',
        } as Record<string, string>,
    },
} as const;

export async function POST(request: Request) {
    if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: '허용되지 않은 요청입니다.' }, { status: 403 });
    const user = await getAuthenticatedUser();
    const permissions = user ? await permissionsFor(user) : null;
    if (!permissions?.products && !permissions?.content) return Response.json({ error: '콘텐츠 업로드 권한이 필요합니다.' }, { status: 403 });
    try {
        const body = (await request.json()) as {
            name?: unknown;
            size?: unknown;
            kind?: unknown;
        };
        const kind = body.kind === 'image' ? 'image' : body.kind === 'resource' ? 'resource' : null;
        if (!kind) return Response.json({ error: '업로드 종류를 확인해 주세요.' }, { status: 400 });
        const config = fileKinds[kind];
        const name = String(body.name || '').normalize('NFC');
        const size = Number(body.size);
        const extension = name.split('.').pop()?.toLowerCase() || '';
        if (!name || name.length > 240 || /[\\/\u0000-\u001f]/.test(name) || !config.allowed[extension])
            return Response.json(
                {
                    error: kind === 'image' ? 'PNG, JPG, WEBP 이미지를 선택해 주세요.' : 'PDF, ZIP, TXT, CSV, 문서 파일을 선택해 주세요.',
                },
                { status: 400 },
            );
        if (!Number.isSafeInteger(size) || size < 1 || size > config.maxBytes)
            return Response.json(
                {
                    error: `${kind === 'image' ? 10 : 20}MB 이하의 파일을 선택해 주세요.`,
                },
                { status: 400 },
            );
        const db = createAdminClient();
        const path = `edu/${crypto.randomUUID()}.${extension}`;
        const { data, error } = await db.storage.from(config.bucket).createSignedUploadUrl(path, { upsert: false });
        if (error) {
            console.error('platform upload', error.message);
            return Response.json(
                {
                    error: '파일을 올리지 못했습니다. 파일 형식과 용량을 확인해 주세요.',
                },
                { status: 409 },
            );
        }
        return Response.json({
            bucket: config.bucket,
            path,
            token: data.token,
            contentType: config.allowed[extension],
            value: path,
            name,
        });
    } catch {
        return Response.json({ error: '파일을 올리지 못했습니다. 다시 시도해 주세요.' }, { status: 500 });
    }
}
