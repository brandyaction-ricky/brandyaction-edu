import { portfolioFileLimit } from './files';
/** Longest preview kept, and the size the browser aims for: 480 px wide at about 0.6 Mbps stays under the 10 MB limit. */
export const previewSeconds = 90;
const maxWidth = 480, videoBits = 600_000, audioBits = 64_000;
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const once = (target: EventTarget, name: string) => new Promise<void>((resolve, reject) => {
  target.addEventListener(name, () => resolve(), { once: true });
  target.addEventListener('error', () => reject(Error('이 영상은 이 브라우저에서 읽을 수 없어요. MP4로 저장해 다시 올리거나 다른 브라우저에서 올려 주세요.')), { once: true });
});
/** A small MP4/WebM can go up as it is; anything else is re-recorded smaller in the browser. */
export const needsShrink = (file: File) => !(['video/mp4', 'video/webm'].includes(file.type) && /\.(mp4|webm)$/i.test(file.name) && file.size <= portfolioFileLimit);
/**
 * Plays the original into a small canvas and records that, so the original never leaves the device.
 * It takes as long as the video is (up to 90 seconds) and the tab has to stay in front while it runs.
 */
export async function shrinkVideo(file: File, onProgress: (done: number, total: number) => void = () => {}): Promise<File> {
  if (typeof MediaRecorder === 'undefined') throw Error('이 브라우저는 영상 줄이기를 지원하지 않아요. 10MB 이하 MP4를 올리거나 PC 크롬에서 올려 주세요.');
  const mime = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
  if (!mime) throw Error('이 브라우저는 영상 줄이기를 지원하지 않아요. 10MB 이하 MP4를 올리거나 PC 크롬에서 올려 주세요.');
  const video = document.createElement('video'), source = URL.createObjectURL(file);
  video.src = source; video.playsInline = true; video.preload = 'auto';
  let audioContext: AudioContext | null = null;
  try {
    await once(video, 'loadedmetadata');
    if (!video.videoWidth) throw Error('이 영상은 이 브라우저에서 읽을 수 없어요. MP4로 저장해 다시 올리거나 다른 브라우저에서 올려 주세요.');
    const scale = Math.min(1, maxWidth / video.videoWidth), canvas = document.createElement('canvas');
    canvas.width = even(video.videoWidth * scale); canvas.height = even(video.videoHeight * scale);
    const context = canvas.getContext('2d')!, stream = canvas.captureStream(30);
    // Sound goes into the recording, not the speakers.
    try { audioContext = new AudioContext(); const out = audioContext.createMediaStreamDestination(); audioContext.createMediaElementSource(video).connect(out); const track = out.stream.getAudioTracks()[0]; if (track) stream.addTrack(track); } catch { video.muted = true; }
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: videoBits, audioBitsPerSecond: audioBits }), chunks: Blob[] = [];
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const total = Math.min(previewSeconds, video.duration || previewSeconds);
    const draw = () => { context.drawImage(video, 0, 0, canvas.width, canvas.height); if (!video.paused && !video.ended) { if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(draw); else requestAnimationFrame(draw); } };
    recorder.start(1000); await video.play(); draw();
    await new Promise<void>((resolve, reject) => {
      video.addEventListener('ended', () => resolve(), { once: true });
      video.addEventListener('error', () => reject(Error('영상을 줄이다가 멈췄어요. 다시 시도해 주세요.')), { once: true });
      video.addEventListener('timeupdate', () => { onProgress(Math.min(video.currentTime, total), total); if (video.currentTime >= previewSeconds) { video.pause(); resolve(); } });
    });
    const stopped = once(recorder, 'stop'); recorder.stop(); await stopped; stream.getTracks().forEach(t => t.stop());
    const type = mime.split(';')[0], blob = new Blob(chunks, { type });
    if (!blob.size) throw Error('영상을 줄이지 못했어요. 다시 시도해 주세요.');
    if (blob.size > portfolioFileLimit) throw Error('줄인 뒤에도 10MB를 넘어요. 영상을 더 짧게 잘라 올려 주세요.');
    return new File([blob], file.name.replace(/\.[^.]*$/, '').slice(0, 150) + '-미리보기.' + (type === 'video/mp4' ? 'mp4' : 'webm'), { type });
  } finally { URL.revokeObjectURL(source); void audioContext?.close(); }
}
