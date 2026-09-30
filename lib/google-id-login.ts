import { safeNext } from "./platform";

export function googleIdDestination(
  metadata: Record<string, unknown>,
  requestedNext: string,
) {
  const next = safeNext(requestedNext);
  return metadata.terms_version && metadata.privacy_version
    ? next
    : `/auth/consent?next=${encodeURIComponent(next)}`;
}
