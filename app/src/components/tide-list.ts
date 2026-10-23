import { clockTime, isoLocal, metres, metresSpoken, turnWord } from '../domain/format';
import type { TideEvent } from '../domain/types';
import { DataElement, h, icon, sr } from './dom';

export interface ListData {
  readonly events: readonly TideEvent[];
  /** `at` of the next turn, highlighted when it falls on this day. */
  readonly nextAt: number | undefined;
}

/** The day's high and low waters as an ordered list; the chart's text equivalent. */
export class TideList extends DataElement<ListData> {
  protected render({ events, nextAt }: ListData): void {
    if (events.length === 0) {
      this.replaceChildren(h('p', { class: 'empty' }, 'No high or low water in the saved data for this day.'));
      return;
    }
    const items = events.map((e) => {
      const next = e.at === nextAt;
      return h(
        'li',
        { class: next ? 'turn is-next' : 'turn' },
        icon(e.type === 'H' ? 'i-up' : 'i-down'),
        h('span', { class: 'turn-type' }, turnWord(e.type)),
        h('time', { class: 'num', datetime: isoLocal(e) }, clockTime(e)),
        h('span', { class: 'num', 'aria-hidden': 'true' }, metres(e.height)),
        sr(`, ${metresSpoken(e.height)}${next ? ', next turn' : ''}`),
      );
    });
    this.replaceChildren(
      h('h3', { class: 'lbl', id: 'turns-h' }, 'High and low water'),
      h('ol', { class: 'turns', 'aria-labelledby': 'turns-h' }, ...items),
    );
  }
}
customElements.define('tide-list', TideList);
