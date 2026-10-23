import { height, heightSpoken } from '../domain/format';
import { clockAt, readingAt } from '../domain/tide-math';
import type { DayKey, TideEvent, Units } from '../domain/types';
import { h, s } from './dom';

const MINUTE = 60_000;
const STEP = 5;

/** What the scrubber needs from the chart it sits on. */
export interface ScrubView {
  readonly events: readonly TideEvent[];
  readonly day: DayKey;
  readonly start: number;
  readonly end: number;
  /** Instant the cursor rests on until it is moved: now on today, midday otherwise. */
  readonly rest: number;
  readonly units: Units;
  /** Plot mapping into the chart's viewBox. */
  readonly x: (t: number) => number;
  readonly y: (v: number) => number;
  readonly top: number;
  readonly bottom: number;
}

const f = (n: number): string => n.toFixed(1);

/**
 * Read the tide at any moment: a native range input laid over the curve, so arrow keys,
 * Home/End and screen readers work as they do on any slider. Pointer drags are mapped
 * straight to the time under the finger (iOS only moves a range by its thumb otherwise).
 * The cursor and tag stay hidden until the slider has focus, so the chart looks unchanged.
 */
export class CurveScrub {
  readonly nodes: readonly Node[];
  readonly #input: HTMLInputElement;
  readonly #tag: HTMLParagraphElement;
  readonly #marks: SVGGElement;
  readonly #line: SVGLineElement;
  readonly #dot: SVGCircleElement;
  #view: ScrubView | undefined;
  #day = '';
  #moved = false;
  #queued = false;

  constructor(id: string) {
    this.#input = h('input', { class: 'scrub-input', id, type: 'range', min: 0, step: STEP, value: 0 });
    this.#tag = h('p', { class: 'scrub-tag data', 'aria-hidden': 'true' });
    this.#line = s('line', { class: 'sw-curve__scrub' });
    this.#dot = s('circle', { class: 'sw-curve__scrub-dot', r: 3 });
    this.#marks = s('g', { class: 'scrub-marks' }, this.#line, this.#dot);
    this.nodes = [h('label', { class: 'sw-sr', for: id }, 'Time of day'), this.#input, this.#tag];

    this.#input.addEventListener('input', () => this.#schedule());
    this.#input.addEventListener('pointerdown', (e) => this.#drag(e));
    // Focus ring for keyboard use only; a press focuses the slider by script, which would show it.
    this.#input.addEventListener('keydown', () => this.#input.removeAttribute('data-pointer'));
    // Next time it gets focus, start again from now.
    this.#input.addEventListener('blur', () => {
      this.#moved = false;
      this.#input.removeAttribute('data-pointer');
    });
  }

  /** Put the cursor marks into a freshly drawn curve and re-read the current moment. */
  attach(svg: SVGSVGElement, view: ScrubView): void {
    const { start, end, rest, top, bottom } = view;
    const minutes = Math.round((end - start) / MINUTE);
    this.#input.max = String(minutes - STEP);
    if (view.day !== this.#day) this.#moved = false;
    this.#day = view.day;
    if (!this.#moved) this.#input.value = String(Math.floor((rest - start) / MINUTE / STEP) * STEP);
    this.#view = view;
    this.#line.setAttribute('y1', String(top - 4));
    this.#line.setAttribute('y2', String(bottom + 6));
    svg.append(this.#marks);
    this.#paint();
  }

  #drag(e: PointerEvent): void {
    if (e.button !== 0) return;
    // Take over from the native thumb so a press anywhere on the curve lands there.
    e.preventDefault();
    this.#input.setAttribute('data-pointer', '');
    this.#input.focus({ preventScroll: true });
    this.#input.setPointerCapture(e.pointerId);
    const rect = this.#input.getBoundingClientRect();
    const at = (ev: PointerEvent): void => {
      const max = Number(this.#input.max);
      const v = Math.round((((ev.clientX - rect.left) / rect.width) * (max + STEP)) / STEP) * STEP;
      this.#input.value = String(Math.min(max, Math.max(0, v)));
      this.#schedule();
    };
    const end = (): void => {
      this.#input.removeEventListener('pointermove', at);
      this.#input.removeEventListener('pointerup', end);
      this.#input.removeEventListener('pointercancel', end);
    };
    this.#input.addEventListener('pointermove', at);
    this.#input.addEventListener('pointerup', end);
    this.#input.addEventListener('pointercancel', end);
    at(e);
  }

  #schedule(): void {
    this.#moved = true;
    if (this.#queued) return;
    this.#queued = true;
    requestAnimationFrame(() => {
      this.#queued = false;
      this.#paint();
    });
  }

  #paint(): void {
    const v = this.#view;
    if (!v) return;
    const t = v.start + Number(this.#input.value) * MINUTE;
    const r = readingAt(v.events, t);
    const time = clockAt(v.events, t);
    const cx = v.x(t);
    this.#line.setAttribute('x1', f(cx));
    this.#line.setAttribute('x2', f(cx));
    this.#marks.setAttribute('display', r ? 'inline' : 'none');
    this.#tag.style.setProperty('--x', `${((cx / v.x(v.end)) * 100).toFixed(2)}%`);
    if (!r) {
      this.#tag.textContent = `${time} · no prediction`;
      this.#input.setAttribute('aria-valuetext', `${time}, no prediction`);
      return;
    }
    const dir = r.rising ? 'rising' : 'falling';
    this.#dot.setAttribute('cx', f(cx));
    this.#dot.setAttribute('cy', f(v.y(r.height)));
    this.#tag.textContent = `${time} · ${height(r.height, v.units)} · ${dir}`;
    this.#input.setAttribute('aria-valuetext', `${time}, ${heightSpoken(r.height, v.units)}, ${dir}`);
  }
}
