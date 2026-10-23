import { clockTime, countdownText, height, heightSpoken, isoLocal, turnWord } from '../domain/format';
import type { TideEvent, Units } from '../domain/types';
import { DataElement, h, sr } from './dom';

export type NextData =
  | { readonly kind: 'loading' }
  | { readonly kind: 'none' }
  | { readonly kind: 'ready'; readonly event: TideEvent; readonly now: number; readonly units: Units };

/** Hero: the next turn of the tide, its height and a countdown (design system sw-readout). */
export class TideNext extends DataElement<NextData> {
  protected render(d: NextData): void {
    this.setAttribute('aria-busy', String(d.kind === 'loading'));
    const label = h('p', { class: 'sw-readout__label label' }, 'Next slack');
    if (d.kind !== 'ready') {
      this.replaceChildren(
        label,
        h('p', { class: 'sw-readout__time readout-xl' }, '--:--'),
        h('p', { class: 'sw-readout__detail data' }, d.kind === 'loading' ? 'Loading tides…' : 'No upcoming turn in saved data.'),
      );
      return;
    }
    const { event: e, now, units } = d;
    const cd = countdownText(e.at - now);
    this.replaceChildren(
      label,
      h('p', { class: 'sw-readout__time readout-xl' }, h('time', { datetime: isoLocal(e) }, clockTime(e))),
      h(
        'p',
        { class: 'sw-readout__detail data' },
        h('span', { 'aria-hidden': 'true' }, `${turnWord(e.type)} · ${height(e.height, units)} · `, h('span', { class: 'sw-readout__eta' }, cd.short)),
        sr(`${turnWord(e.type)} water, ${heightSpoken(e.height, units)}, ${cd.spoken}.`),
      ),
    );
  }
}
customElements.define('tide-next', TideNext);
