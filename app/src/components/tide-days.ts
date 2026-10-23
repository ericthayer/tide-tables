import { dayLongLabel, dayShortLabel } from '../domain/format';
import type { DayKey } from '../domain/types';
import { DataElement, h } from './dom';

export interface DaysData {
  readonly days: readonly DayKey[];
  readonly today: DayKey;
  readonly selected: DayKey;
}

export type DayChangeEvent = CustomEvent<DayKey>;

/**
 * Day picker as a native radio group: arrow keys, single tab stop and
 * "1 of 7" announcements come for free.
 */
export class TideDays extends DataElement<DaysData> {
  #key = '';

  connectedCallback(): void {
    this.addEventListener('change', (ev) => {
      const input = ev.target;
      if (input instanceof HTMLInputElement && input.name === 'day') {
        this.dispatchEvent(new CustomEvent<DayKey>('day-change', { detail: input.value, bubbles: true }));
      }
    });
  }

  protected render({ days, today, selected }: DaysData): void {
    const key = `${today}|${days.join(',')}`;
    if (key !== this.#key) {
      this.#key = key;
      const opts = days.map((d) =>
        h(
          'label',
          { class: 'sw-chip day-opt' },
          h('input', { type: 'radio', name: 'day', value: d, class: 'sr-input' }),
          h('span', { 'aria-hidden': 'true' }, d === today ? 'Today' : dayShortLabel(d)),
          h('span', { class: 'sw-sr' }, d === today ? `Today, ${dayLongLabel(d)}` : dayLongLabel(d)),
        ),
      );
      this.replaceChildren(h('fieldset', { class: 'days' }, h('legend', { class: 'sw-sr' }, 'Choose a day'), ...opts));
    }
    for (const input of this.querySelectorAll<HTMLInputElement>('input[name="day"]')) {
      input.checked = input.value === selected;
    }
  }
}
customElements.define('tide-days', TideDays);
