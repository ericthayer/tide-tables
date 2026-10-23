import iconsUrl from '../../../design/icons.svg?url';
import { DataElement, h, s, sr } from '../components/dom';
import { clockTime, dayLongLabel, dayShortLabel, height, heightSpoken, isoLocal, turnWord } from '../domain/format';
import type { MonthRow } from '../domain/month';
import type { DayKey, TideEvent, Units } from '../domain/types';

export interface MonthData {
  readonly rows: readonly MonthRow[];
  readonly today: DayKey;
  /** `at` of the next turn, the one cell drawn in signal colour. */
  readonly nextAt: number | undefined;
  readonly now: number;
  readonly units: Units;
  readonly caption: string;
}

export const designIcon = (id: string): SVGSVGElement =>
  s('svg', { class: 'sw-icon', 'aria-hidden': 'true', focusable: 'false' }, s('use', { href: `${iconsUrl}#${id}` }));
const turnIcon = (e: TideEvent): SVGSVGElement => designIcon(e.type === 'H' ? 'i-rising' : 'i-falling');

/** "1.6" with the unit dropped; the subtitle names the unit once. */
const bare = (m: number, units: Units): string => height(m, units).replace(/ (m|ft)$/, '');

/** A month of high and low waters: one row per station-local day, one cell per turn. */
export class TideMonth extends DataElement<MonthData> {
  protected render({ rows, today, nextAt, now, units, caption }: MonthData): void {
    const cols = Math.max(1, ...rows.map((r) => r.events.length));
    const body = rows.map(({ day, events }) => {
      const cells = events.map((e) => {
        const next = e.at === nextAt;
        return h(
          'td',
          { class: next ? 'is-next' : e.at < now ? 'is-past' : undefined },
          h('span', { class: 'month-turn' }, turnIcon(e), sr(`${turnWord(e.type)} water `), h('time', { datetime: isoLocal(e) }, clockTime(e))),
          h('span', { class: 'month-height', 'aria-hidden': 'true' }, bare(e.height, units)),
          sr(`, ${heightSpoken(e.height, units)}${next ? ' (next turn)' : ''}`),
        );
      });
      while (cells.length < cols) cells.push(h('td'));
      return h(
        'tr',
        { class: day === today ? 'is-today' : undefined },
        h('th', { scope: 'row' }, h('span', { 'aria-hidden': 'true' }, dayShortLabel(day)), sr(day === today ? `Today, ${dayLongLabel(day)}` : dayLongLabel(day))),
        ...cells,
      );
    });
    this.replaceChildren(
      h(
        'table',
        { class: 'sw-table month' },
        h('caption', { class: 'sw-sr' }, caption),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Day'), h('th', { scope: 'col', colspan: cols }, 'High and low water'))),
        h('tbody', {}, ...body),
      ),
    );
  }
}
customElements.define('tide-month', TideMonth);
