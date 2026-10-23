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
 * listbox popup, saved and recent stations, and an opt-in "Use my location".
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
  #statusTimer: ReturnType<typeof setTimeout> | undefined;
  recents: readonly Station[] = [];
  saved: readonly Station[] = [];
  homeId: string | undefined;

  connectedCallback(): void {
    if (this.#dialog) return;
    this.#input = h('input', {
      id: 'station-q',
      type: 'search',
      class: 'sw-field__input',
      placeholder: 'Town, bay or station number',
      role: 'combobox',
      'aria-autocomplete': 'list',
      'aria-expanded': 'false',
      'aria-controls': 'station-results',
      'aria-describedby': 'station-help',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      enterkeyhint: 'search',
    });
    this.#list = h('ul', { id: 'station-results', role: 'listbox', class: 'results', 'aria-label': 'Stations', hidden: true });
    this.#status = h('p', { class: 'sw-field__help', id: 'station-help', role: 'status' });
    this.#recents = h('div', { class: 'recents' });
    const close = h('button', { type: 'button', class: 'sw-button sw-button--quiet icon-btn', 'aria-label': 'Close' }, icon('i-close', 'sw-icon'));
    const locate = h('button', { type: 'button', class: 'sw-button sw-button--outline locate-btn' }, icon('i-pin', 'sw-icon'), 'Use my location');

    this.#dialog = h(
      'dialog',
      { class: 'sheet', 'aria-labelledby': 'search-h' },
      h('div', { class: 'sheet-head' }, h('h2', { id: 'search-h', class: 'title-2' }, 'Find a station'), close),
      h(
        'form',
        { class: 'sw-field', role: 'search' },
        h('label', { for: 'station-q', class: 'sw-field__label' }, 'Station or harbour'),
        h('div', { class: 'sw-field__control' }, icon('i-search', 'sw-icon'), this.#input),
        this.#status,
      ),
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
    this.#say('');
    this.#renderRecents();
    this.#dialog.showModal();
    this.#input.focus();
    void loadStations().catch(() => {
      this.#say('Station list is unavailable offline. Recent stations still work.');
    });
  }

  /** Write the status line; `delay` debounces result counts so typing isn't narrated per keystroke. */
  #say(text: string, delay = 0): void {
    clearTimeout(this.#statusTimer);
    if (delay) this.#statusTimer = setTimeout(() => (this.#status.textContent = text), delay);
    else this.#status.textContent = text;
  }

  async #search(): Promise<void> {
    const q = this.#input.value;
    if (!q.trim()) {
      this.#setResults([]);
      this.#say('');
      return;
    }
    try {
      const all = await loadStations();
      if (q !== this.#input.value) return; // stale keystroke
      const hits = searchStations(all, q, MAX_RESULTS);
      this.#setResults(hits);
      this.#say(
        hits.length
          ? `${hits.length}${hits.length === MAX_RESULTS ? '+' : ''} stations found. Use arrow keys to choose.`
          : 'No stations match. Try a town, bay or NOAA station number.',
        400,
      );
    } catch {
      this.#say('Station list is unavailable offline. Recent stations still work.');
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
          h('span', { class: 'body opt-name' }, label(st)),
          h('span', { class: 'caption opt-id' }, st.id),
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
    const savedIds = new Set(this.saved.map((s) => s.id));
    const recents = this.recents.filter((s) => !savedIds.has(s.id));
    const saved = this.saved.map((st) => {
      const home = st.id === this.homeId;
      const b = h(
        'button',
        { type: 'button', class: 'saved-btn' },
        h('span', { class: 'body saved-name' }, home ? icon('i-anchor', 'sw-icon') : null, label(st)),
        h('span', { class: 'caption saved-meta' }, home ? 'Home port' : st.id),
      );
      b.addEventListener('click', () => this.#choose(st));
      return h('li', {}, b);
    });
    const chips = recents.map((st) => {
      const b = h('button', { type: 'button', class: 'sw-chip recent' }, label(st));
      b.addEventListener('click', () => this.#choose(st));
      return h('li', {}, b);
    });
    this.#recents.replaceChildren(
      ...(saved.length ? [h('h3', { id: 'saved-h', class: 'label' }, 'Saved'), h('ul', { class: 'saved-list', 'aria-labelledby': 'saved-h' }, ...saved)] : []),
      ...(chips.length ? [h('h3', { id: 'recents-h', class: 'label' }, 'Recent'), h('ul', { class: 'recent-list', 'aria-labelledby': 'recents-h' }, ...chips)] : []),
    );
  }

  async #locate(): Promise<void> {
    if (!('geolocation' in navigator)) {
      this.#say('Location is not available on this device.');
      return;
    }
    this.#say('Finding the nearest station…');
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
      this.#say('Couldn’t get your location. Search by name instead.');
    }
  }

  #choose(st: Station | undefined): void {
    if (!st) return;
    this.dispatchEvent(new CustomEvent<Station>('station-pick', { detail: st, bubbles: true }));
    this.#dialog.close();
  }
}
customElements.define('tide-station-search', TideStationSearch);
