import { startInboxSync } from './inbox-sync';

type View = {
  refresh: () => Promise<void>;
  connected: (value: boolean) => void;
  slow: () => boolean;
};
type Join = (signal: AbortSignal, ready: () => void, failed: () => void, changed: () => void) => Promise<void>;
type Session = { views: Set<View>; connected: boolean; sync: ReturnType<typeof startInboxSync> };
const sessions = new Map<string, Session>();

// One transport per enrollment in this tab. Each view owns its cancellable read.
export function observeOffice(enrollment: string, view: View, join?: Join, readVersion?: (signal: AbortSignal) => Promise<number>) {
  let session = sessions.get(enrollment);
  if (session) {
    session.views.add(view);
    view.connected(session.connected);
    session.sync.invalidate();
  } else {
    const views = new Set([view]);
    const sync = startInboxSync({
      refresh: async () => { await Promise.all(Array.from(views, item => item.refresh())); },
      slow: () => Array.from(views).every(item => item.slow()),
      onConnected: value => {
        if (session) session.connected = value;
        for (const item of views) item.connected(value);
      },
      readVersion,
      join: join && ((signal, ready, failed) => join(signal, ready, failed, sync.invalidate)),
    });
    session = { views, connected: false, sync };
    sessions.set(enrollment, session);
  }

  const owned = session;
  return {
    invalidate: owned.sync.invalidate,
    close() {
      owned.views.delete(view);
      if (!owned.views.size) {
        owned.sync.close();
        sessions.delete(enrollment);
      }
    },
  };
}
