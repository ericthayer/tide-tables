import iconsUrl from '../../../design/icons.svg?url';
import { clockTime, height, heightSpoken, isoLocal, turnWord } from '../domain/format';
import type { TideEvent, Units } from '../domain/types';
import { DataElement, h, s, sr } from './dom';

export interface ListData {
  readonly events: readonly TideEvent[];
  /** `at` of the next turn, highlighted when it falls on this day. */
  readonly nextAt: number | undefined;
  /** Turns before this instant are shown muted. */
  readonly now: number;
  readonly caption: string;
  readonly units: Units;
  /** Sunrise and sunset for the caption row; omitted until the station's position is known. */
  readonly daylight: { readonly short: string; readonly spoken: string } | undefined;
}

const designIcon = (id: string): SVGSVGElement =>
  s('svg', { class: 'sw-icon', 'aria-hidden': 'true', focusable: 'false' }, s('use', { href: `${iconsUrl}#${id}` }));

/** The day's high and low waters: the chart's text equivalent, as the design system's sw-table. */
export class TideList extends DataElement<ListData> {
  protected render({ events, nextAt, now, caption, units, daylight }: ListData): void {
    if (events.length === 0) {
      this.replaceChildren(h('p', { class: 'body empty' }, 'No high or low water in the saved data for this day.'));
      return;
    }
    const rows = events.map((e) => {
      const next = e.at === nextAt;
      const cls = next ? 'is-next' : e.at < now ? 'is-past' : undefined;
      return h(
        'tr',
        { class: cls },
        h('th', { scope: 'row' }, h('span', { class: 'turn-type' }, designIcon(e.type === 'H' ? 'i-rising' : 'i-falling'), turnWord(e.type)), next ? sr(' (next turn)') : null),
        h('td', {}, h('time', { datetime: isoLocal(e) }, clockTime(e))),
        h('td', {}, h('span', { 'aria-hidden': 'true' }, height(e.height, units)), sr(heightSpoken(e.height, units))),
      );
    });
    this.replaceChildren(
      h(
        'table',
        { class: 'sw-table' },
        h(
          'caption',
          { class: 'table-caption' },
          h(
            'span',
            { class: 'cap-row' },
            h('span', { class: 'label' }, caption, daylight ? sr('.') : null),
            daylight
              ? h(
                  'span',
                  { class: 'caption sun' },
                  s('svg', { class: 'sw-icon', 'aria-hidden': 'true', focusable: 'false' }, s('use', { href: '#i-sun' })),
                  h('span', { 'aria-hidden': 'true' }, daylight.short),
                  sr(daylight.spoken),
                )
              : null,
          ),
        ),
        h('thead', { class: 'sw-sr' }, h('tr', {}, h('th', { scope: 'col' }, 'Tide'), h('th', { scope: 'col' }, 'Time'), h('th', { scope: 'col' }, 'Height'))),
        h('tbody', {}, ...rows),
      ),
    );
  }
}
customElements.define('tide-list', TideList);
