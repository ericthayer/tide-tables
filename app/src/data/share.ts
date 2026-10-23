// Loaded on first use from the station sheet; keeps share and calendar code out of the first load.
import { icsFilename, weekIcs, type IcsInput } from '../domain/ics';

/** What happened, worded for the sheet's status line. `cancelled` says nothing. */
export type ActionResult = { readonly kind: 'done'; readonly message: string } | { readonly kind: 'cancelled' } | { readonly kind: 'failed'; readonly message: string };

/** The phone's share sheet where there is one, otherwise copy the link. */
export async function shareLink(title: string, url: string): Promise<ActionResult> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url });
      return { kind: 'done', message: 'Shared.' };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return { kind: 'cancelled' };
      // NotAllowedError and friends: fall through to copying.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return { kind: 'done', message: 'Link copied.' };
  } catch {
    return { kind: 'failed', message: 'Couldn’t share or copy. The link is in the address bar.' };
  }
}

/** Build the week's calendar file on the device and hand it to the browser as a download. */
export function downloadCalendar(input: IcsInput, firstDay: string): Extract<ActionResult, { kind: 'done' }> {
  const blob = new Blob([weekIcs(input)], { type: 'text/calendar;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = icsFilename(input.station, firstDay);
  a.hidden = true;
  // Outside an open modal dialog the page is inert, so keep the link inside it.
  (document.querySelector('dialog[open]') ?? document.body).append(a);
  a.click();
  a.remove();
  // Revoke later: some browsers read the blob after click() returns.
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
  const n = input.events.length;
  return { kind: 'done', message: `Calendar file saved. Open it to add ${n} ${n === 1 ? 'tide' : 'tides'}.` };
}
