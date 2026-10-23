import { clockTime, countdownText, isoLocal, metres, metresSpoken, turnWord } from '../domain/format';
import type { TideEvent } from '../domain/types';
import { DataElement, h, sr } from './dom';

export type NextData =
  | { readonly kind: 'loading' }
  | { readonly kind: 'none' }
  | { readonly kind: 'ready'; readonly event: TideEvent; readonly now: number };

/** Hero: the next turn of the tide, its height and a countdown. */
export class TideNext extends DataElement<NextData> {
  protected render(d: NextData): void {
    this.setAttribute('aria-busy', String(d.kind === 'loading'));
    if (d.kind !== 'ready') {
      this.replaceChildren(
        h('p', { class: 'lbl' }, 'Next slack'),
        h('p', { class: 'next-time num' }, '--:--'),
        h('p', { class: 'next-line num' }, d.kind === 'loading' ? 'Loading tides…' : 'No upcoming turn in saved data.'),
      );
      return;
    }
    const { event: e, now } = d;
    const cd = countdownText(e.at - now);
    this.replaceChildren(
      h('p', { class: 'lbl' }, 'Next slack'),
      h('p', { class: 'next-time num' }, h('time', { datetime: isoLocal(e) }, clockTime(e))),
      h(
        'p',
        { class: 'next-line num' },
        h('span', { 'aria-hidden': 'true' }, `${turnWord(e.type)} · ${metres(e.height)} · `, h('b', {}, cd.short)),
        sr(`${turnWord(e.type)} water, ${metresSpoken(e.height)}, ${cd.spoken}.`),
      ),
    );
  }
}
customElements.define('tide-next', TideNext);
