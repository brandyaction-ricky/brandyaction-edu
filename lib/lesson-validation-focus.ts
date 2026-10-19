/** Reveal just the enclosing settings and keep the invalid control clear of sticky bars. */
export function revealLessonIssue(target: HTMLElement | null) {
  if (!target) return;
  if (target instanceof HTMLDetailsElement) target.open = true;
  for (let parent = target.parentElement; parent; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  const control = target.matches('input,select,textarea,[contenteditable="true"]') ? target
    : target.querySelector<HTMLElement>('input:invalid,select:invalid,textarea:invalid')
      || target.querySelector<HTMLElement>('input:not([type="hidden"]):not(:disabled),textarea:not(:disabled),select:not(:disabled),[contenteditable="true"]');
  const focus = control || target;
  for (let parent = focus.parentElement; parent; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  if (!control && !target.hasAttribute('tabindex')) target.tabIndex = -1;
  focus.focus({ preventScroll: true });
  focus.scrollIntoView({ block: 'center', inline: 'nearest' });
  if (focus instanceof HTMLInputElement || focus instanceof HTMLTextAreaElement || focus instanceof HTMLSelectElement) {
    if (!focus.validity.valid) focus.reportValidity();
  }
}
