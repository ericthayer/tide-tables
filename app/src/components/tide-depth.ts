import { depthSpans, wallTime } from '../domain/depth';
import { height, heightSpoken, inUnits, toMetres } from '../domain/format';
import { dayBounds } from '../domain/tide-math';
import type { DayKey, Depth, TideEvent, Units } from '../domain/types';
import { DataElement, h, sr } from './dom';

export interface DepthData {
  readonly events: readonly TideEvent[];
  readonly day: DayKey;
  readonly depth: Depth | undefined;
  readonly units: Units;
}

/** null clears the station's depth window. */
export type DepthChangeEvent = CustomEvent<Depth | null>;

/** Accepted input, in the display unit. Wide enough for any US station's range. */
const RANGE: Record<Units, { readonly min: number; readonly max: number; readonly say: string }> = {
  ft: { min: -10, max: 40, say: '−10 to 40 ft' },
  m: { min: -3, max: 12, say: '−3 to 12 m' },
};
const DIR_WORD = { above: 'Above', below: 'Below' } as const;

/**
 * Depth window: when the water is above (or below) a depth the user names, for the
 * selected day. Loaded on first use; <tide-chart> draws the matching dashed line.
 * Times are text, never only shading, and say "estimated" because the curve is
 * interpolated between NOAA's published highs and lows.
 */
export class TideDepth extends DataElement<DepthData> {
  #editing = false;
  /** After a save or removal: move focus back and announce the result once. */
  #settled: 'saved' | 'removed' | null = null;
  #live = h('p', { class: 'sw-sr', 'aria-live': 'polite' });
  #body = h('div');

  /** Open the editor, e.g. from the static "Set depth" button clicked before this module loaded. */
  edit(): void {
    this.#editing = true;
    if (this.data) this.data = this.data;
  }

  protected render(d: DepthData): void {
    // The static "Set depth" markup stays until the first render, so nothing shifts on upgrade.
    if (!this.#live.isConnected) this.replaceChildren(this.#body, this.#live);
    this.#body.replaceChildren(this.#editing ? this.#form(d) : this.#row(d));
    if (this.#editing) {
      this.#body.querySelector<HTMLInputElement>('input[type="number"]')?.focus();
    } else if (this.#settled) {
      this.#body.querySelector<HTMLButtonElement>('button')?.focus();
      this.#live.textContent = '';
      const said = this.#settled === 'saved' && d.depth ? this.#spoken(d, d.depth) : 'Depth window removed.';
      requestAnimationFrame(() => (this.#live.textContent = said));
      this.#settled = null;
    }
  }

  #row(d: DepthData): HTMLElement {
    const btn = h('button', { type: 'button', class: 'sw-button sw-button--quiet' }, d.depth ? 'Change' : 'Set depth');
    btn.addEventListener('click', () => this.edit());
    if (!d.depth) return h('div', { class: 'depth-row' }, h('p', { class: 'body-sm depth-muted' }, 'Depth window'), btn);

    const t = this.#times(d, d.depth);
    btn.setAttribute('aria-label', `Change depth, now ${DIR_WORD[d.depth.dir].toLowerCase()} ${heightSpoken(d.depth.m, d.units)}`);
    return h(
      'div',
      { class: 'depth-row' },
      h(
        'p',
        { class: 'depth-text' },
        h('span', { class: 'body-sm depth-muted' }, `${DIR_WORD[d.depth.dir]} ${height(d.depth.m, d.units)}, estimated`),
        h('span', { class: 'data' }, h('span', { 'aria-hidden': 'true' }, t.short), sr(t.spoken)),
      ),
      btn,
    );
  }

  /** Visual "06:12–13:40 · 18:02–24:00" and spoken "06:12 to 13:40, 18:02 to 24:00". */
  #times(d: DepthData, depth: Depth): { short: string; spoken: string } {
    const spans = depthSpans(d.events, d.day, depth);
    const { end } = dayBounds(d.events, d.day);
    const pairs = spans.map((s) => [wallTime(d.events, s.start, end), wallTime(d.events, s.end, end)]);
    const one = !pairs.length ? 'Not today' : pairs.length === 1 && pairs[0]!.join() === '00:00,24:00' ? 'All day' : '';
    return one ? { short: one, spoken: one } : { short: pairs.map((p) => p.join('–')).join(' · '), spoken: pairs.map((p) => p.join(' to ')).join(', ') };
  }

  #spoken(d: DepthData, depth: Depth): string {
    return `Depth window set. ${DIR_WORD[depth.dir]} ${heightSpoken(depth.m, d.units)}, estimated: ${this.#times(d, depth).spoken}.`;
  }

  #form(d: DepthData): HTMLFormElement {
    const range = RANGE[d.units];
    const unitWord = d.units === 'ft' ? 'feet' : 'metres';
    const dir = d.depth?.dir ?? 'above';
    const input = h('input', {
      id: 'depth-input',
      class: 'sw-field__input',
      type: 'number',
      inputmode: 'decimal',
      step: 0.1,
      min: range.min,
      max: range.max,
      required: true,
      'aria-describedby': 'depth-help',
      value: d.depth ? inUnits(d.depth.m, d.units).toFixed(1) : '',
    });
    const help = h('p', { id: 'depth-help', class: 'sw-field__help' }, 'Times are estimated from the curve between highs and lows.');
    const field = h(
      'div',
      { class: 'sw-field' },
      h('label', { class: 'sw-field__label', for: 'depth-input' }, `Depth in ${unitWord}`),
      h('div', { class: 'sw-field__control' }, input, h('span', { class: 'data depth-unit', 'aria-hidden': 'true' }, d.units)),
      help,
    );
    const seg = h(
      'fieldset',
      { class: 'sw-segmented' },
      h('legend', { class: 'sw-sr' }, 'Show water'),
      ...(['above', 'below'] as const).flatMap((v) => [
        h('input', { type: 'radio', name: 'depth-dir', value: v, id: `depth-${v}`, class: 'sw-segmented__input', checked: v === dir }),
        h('label', { for: `depth-${v}`, class: 'sw-segmented__option' }, DIR_WORD[v]),
      ]),
    );
    const cancel = h('button', { type: 'button', class: 'sw-button sw-button--quiet' }, 'Cancel');
    const remove = d.depth ? h('button', { type: 'button', class: 'sw-button sw-button--quiet' }, 'Remove') : null;
    const form = h(
      'form',
      { class: 'depth-form', 'aria-label': 'Depth window', novalidate: true },
      seg,
      field,
      h('div', { class: 'depth-actions' }, h('button', { type: 'submit', class: 'sw-button' }, 'Save'), remove, cancel),
    );

    const close = (result: Depth | null | undefined): void => {
      this.#editing = false;
      if (result === undefined) {
        this.#settled = null;
        this.data = d;
        requestAnimationFrame(() => this.#body.querySelector<HTMLButtonElement>('button')?.focus());
        return;
      }
      this.#settled = result ? 'saved' : 'removed';
      this.dispatchEvent(new CustomEvent<Depth | null>('depth-change', { detail: result, bubbles: true }));
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = input.valueAsNumber;
      if (!Number.isFinite(v) || v < range.min || v > range.max) {
        field.classList.add('sw-field--error');
        input.setAttribute('aria-invalid', 'true');
        help.textContent = `Enter a depth from ${range.say}.`;
        input.focus();
        return;
      }
      const picked = form.querySelector<HTMLInputElement>('input[name="depth-dir"]:checked')?.value === 'below' ? 'below' : 'above';
      close({ m: Math.round(toMetres(v, d.units) * 1000) / 1000, dir: picked });
    });
    form.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(undefined);
      }
    });
    cancel.addEventListener('click', () => close(undefined));
    remove?.addEventListener('click', () => close(null));
    return form;
  }
}
customElements.define('tide-depth', TideDepth);
