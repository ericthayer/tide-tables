import { loadStations } from '../data/stations';
import { nearestStation } from '../domain/geo';
import { searchStations } from '../domain/search';
import type { Station } from '../domain/types';
import { h, icon } from './dom';

export type StationPickEvent = CustomEvent<Station>;

const MAX_RESULTS = 50;
const label = (st: Station): string => (st.state ? `${st.name}, ${st.state}` : st.name);

/**
 * Station picker: a modal <dialog> holding a WAI-ARIA 1.2 combobox with a
 * listbox popup, recent stations and an opt-in "Use my location".
 */
export class TideStationSearch extends HTMLElement {
  #dialog!: HTMLDialogElement;
  #input!: HTMLInputElement;
  #list!: HTMLUListElement;
  #status!: HTMLParagraphElement;
  #recents!: HTMLElement;
  #results: Station[] = [];
  #active = -1;
  #opener: HTMLElement | null = null;
  recents: readonly Station[] = [];

  connectedCallback(): void {
    if (this.#dialog) return;
    this.#input = h('input', {
      id: 'station-q',
      type: 'search',
      role: 'combobox',
      'aria-autocomplete': 'list',
      'aria-expanded': 'false',
      'aria-controls': 'station-results',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      enterkeyhint: 'search',
    });
    this.#list = h('ul', { id: 'station-results', role: 'listbox', class: 'results', 'aria-label': 'Stations', hidden: true });
    this.#status = h('p', { class: 'search-status', role: 'status' });
    this.#recents = h('section', { class: 'recents', 'aria-labelledby': 'recents-h' });
    const close = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close' }, icon('i-close'));
    const locate = h('button', { type: 'button', class: 'locate-btn' }, icon('i-pin'), 'Use my location');

    this.#dialog = h(
      'dialog',
      { class: 'sheet', 'aria-labelledby': 'search-h' },
      h('div', { class: 'sheet-head' }, h('h2', { id: 'search-h' }, 'Find a station'), close),
      h(
        'form',
        { class: 'search', role: 'search' },
        h('label', { for: 'station-q', class: 'lbl' }, 'Station or harbour'),
        h('div', { class: 'search-field' }, icon('i-search'), this.#input),
      ),
      this.#status,
      this.#list,
      locate,
      this.#recents,
    );
    this.append(this.#dialog);

    close.addEventListener('click', () => this.#dialog.close());
    this.#dialog.addEventListener('close', () => this.#opener?.focus());
    this.#dialog.addEventListener('click', (e) => {
      if (e.target === this.#dialog) this.#dialog.close(); // backdrop tap
    });
    this.#dialog.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      this.#choose(this.#results[Math.max(this.#active, 0)]);
    });
    this.#input.addEventListener('input', () => void this.#search());
    this.#input.addEventListener('keydown', (e) => this.#onKey(e));
    this.#list.addEventListener('click', (e) => {
      const li = (e.target as Element).closest<HTMLLIElement>('[role="option"]');
      if (li) this.#choose(this.#results[Number(li.dataset['i'])]);
    });
    locate.addEventListener('click', () => void this.#locate());
  }

  open(opener: HTMLElement): void {
    this.#opener = opener;
    this.#input.value = '';
    this.#setResults([]);
    this.#status.textContent = '';
    this.#renderRecents();
    this.#dialog.showModal();
    this.#input.focus();
    void loadStations().catch(() => {
      this.#status.textContent = 'Station list is unavailable offline. Recent stations still work.';
    });
  }

  async #search(): Promise<void> {
    const q = this.#input.value;
    if (!q.trim()) {
      this.#setResults([]);
      this.#status.textContent = '';
      return;
    }
    try {
      const all = await loadStations();
      if (q !== this.#input.value) return; // stale keystroke
      const hits = searchStations(all, q, MAX_RESULTS);
      this.#setResults(hits);
      this.#status.textContent = hits.length
        ? `${hits.length}${hits.length === MAX_RESULTS ? '+' : ''} stations found. Use arrow keys to choose.`
        : 'No stations match. Try a town, bay or NOAA station number.';
    } catch {
      this.#status.textContent = 'Station list is unavailable offline. Recent stations still work.';
    }
  }

  #setResults(list: Station[]): void {
    this.#results = list;
    this.#active = -1;
    this.#list.replaceChildren(
      ...list.map((st, i) =>
        h(
          'li',
          { role: 'option', id: `opt-${i}`, 'data-i': i, 'aria-selected': 'false', class: 'option' },
          h('span', { class: 'opt-name' }, label(st)),
          h('span', { class: 'opt-id num' }, st.id),
        ),
      ),
    );
    this.#list.hidden = list.length === 0;
    this.#input.setAttribute('aria-expanded', String(list.length > 0));
    this.#input.removeAttribute('aria-activedescendant');
  }

  #move(to: number): void {
    const opts = this.#list.children;
    if (!opts.length) return;
    this.#active = (to + opts.length) % opts.length;
    for (const [i, el] of [...opts].entries()) el.setAttribute('aria-selected', String(i === this.#active));
    const cur = opts[this.#active] as HTMLElement;
    this.#input.setAttribute('aria-activedescendant', cur.id);
    cur.scrollIntoView({ block: 'nearest' });
  }

  #onKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.#move(this.#active + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.#move(this.#active - 1);
    }
  }

  #renderRecents(): void {
    if (!this.recents.length) {
      this.#recents.replaceChildren();
      return;
    }
    const items = this.recents.map((st) => {
      const b = h('button', { type: 'button', class: 'recent' }, label(st));
      b.addEventListener('click', () => this.#choose(st));
      return h('li', {}, b);
    });
    this.#recents.replaceChildren(h('h3', { id: 'recents-h', class: 'lbl' }, 'Recent'), h('ul', { class: 'recent-list' }, ...items));
  }

  async #locate(): Promise<void> {
    if (!('geolocation' in navigator)) {
      this.#status.textContent = 'Location is not available on this device.';
      return;
    }
    this.#status.textContent = 'Finding the nearest station…';
    try {
      const [pos, all] = await Promise.all([
        new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { maximumAge: 600_000, timeout: 10_000 }),
        ),
        loadStations(),
      ]);
      const hit = nearestStation(all, pos.coords.latitude, pos.coords.longitude);
      if (hit) this.#choose(hit.station);
    } catch {
      this.#status.textContent = 'Couldn’t get your location. Search by name instead.';
    }
  }

  #choose(st: Station | undefined): void {
    if (!st) return;
    this.dispatchEvent(new CustomEvent<Station>('station-pick', { detail: st, bubbles: true }));
    this.#dialog.close();
  }
}
customElements.define('tide-station-search', TideStationSearch);
