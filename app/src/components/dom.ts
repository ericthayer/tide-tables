type Attrs = Record<string, string | number | boolean | undefined>;
type Child = Node | string | null | undefined | false;

function apply(el: Element, attrs: Attrs): void {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    el.setAttribute(k, v === true ? '' : String(v));
  }
}

/** createElement with attributes and text-safe children (strings become text nodes). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  apply(el, attrs);
  for (const c of children) if (c) el.append(c);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  apply(el, attrs);
  for (const c of children) if (c) el.append(c);
  return el;
}

/** Inline sprite icon, hidden from assistive tech. */
export function icon(id: string, cls = 'ico'): SVGSVGElement {
  return s('svg', { class: cls, 'aria-hidden': 'true', focusable: 'false' }, s('use', { href: `#${id}` }));
}

/** Visually hidden text for screen readers. */
export const sr = (text: string): HTMLSpanElement => h('span', { class: 'sr' }, text);

/**
 * Base class: data arrives via `data` setter; render is batched to one per frame.
 * Subclasses implement `render(data)` and may assume it runs connected.
 */
export abstract class DataElement<T> extends HTMLElement {
  #data: T | undefined;
  #queued = false;

  set data(value: T) {
    this.#data = value;
    if (this.#queued) return;
    this.#queued = true;
    requestAnimationFrame(() => {
      this.#queued = false;
      if (this.isConnected && this.#data !== undefined) this.render(this.#data);
    });
  }

  get data(): T | undefined {
    return this.#data;
  }

  protected abstract render(data: T): void;
}
