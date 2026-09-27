"use client";

import { useCallback, useState } from "react";

/** A retained page must not reopen an old dialog when its route is revisited. */
export function useRouteDialog<T>(route: string) {
  const [state, setState] = useState<{ route: string; value: T | null }>({ route, value: null });
  if (state.route !== route) setState({ route, value: null });
  const setDialog = useCallback((value: T | null) => setState({ route, value }), [route]);
  return [state.route === route ? state.value : null, setDialog] as const;
}
