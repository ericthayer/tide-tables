import type { Theme } from '../data/prefs';
import type { Units } from '../domain/types';
import { h, icon } from './dom';

export type SettingsChange = { readonly kind: 'units'; readonly value: Units } | { readonly kind: 'theme'; readonly value: Theme };
export type SettingsChangeEvent = CustomEvent<SettingsChange>;

interface Option<T extends string> {
  readonly value: T;
  readonly label: string;
}

const UNITS: readonly Option<Units>[] = [
  { value: 'ft', label: 'Feet' },
  { value: 'm', label: 'Metres' },
];
const THEMES: readonly Option<Theme>[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * Settings sheet: a modal <dialog> with two native radio groups drawn as the
 * design system's segmented control. Changes apply at once; there is no Save.
 */
export class TideSettings extends HTMLElement {
  #dialog!: HTMLDialogElement;
  #opener: HTMLElement | null = null;

  connectedCallback(): void {
    if (this.#dialog) return;
    const close = h('button', { type: 'button', class: 'sw-button sw-button--quiet icon-btn', 'aria-label': 'Close' }, icon('i-close', 'sw-icon'));
    this.#dialog = h(
      'dialog',
      { class: 'sheet', 'aria-labelledby': 'settings-h' },
      h('div', { class: 'sheet-head' }, h('h2', { id: 'settings-h', class: 'title-2' }, 'Settings'), close),
      this.#group('units', 'Heights', UNITS),
      this.#group('theme', 'Appearance', THEMES, 'System follows your phone.'),
    );
    this.append(this.#dialog);

    close.addEventListener('click', () => this.#dialog.close());
    this.#dialog.addEventListener('close', () => this.#opener?.focus());
    this.#dialog.addEventListener('click', (e) => {
      if (e.target === this.#dialog) this.#dialog.close(); // backdrop tap
    });
    this.#dialog.addEventListener('change', (e) => {
      const input = e.target;
      if (!(input instanceof HTMLInputElement)) return;
      const detail = (input.name === 'units' ? { kind: 'units', value: input.value } : { kind: 'theme', value: input.value }) as SettingsChange;
      this.dispatchEvent(new CustomEvent<SettingsChange>('settings-change', { detail, bubbles: true }));
    });
  }

  open(opener: HTMLElement, current: { readonly units: Units; readonly theme: Theme }): void {
    this.#opener = opener;
    for (const input of this.#dialog.querySelectorAll<HTMLInputElement>('input[type="radio"]')) {
      input.checked = input.value === (input.name === 'units' ? current.units : current.theme);
    }
    this.#dialog.showModal();
    this.#dialog.querySelector<HTMLInputElement>('input:checked')?.focus();
  }

  #group<T extends string>(name: string, legend: string, options: readonly Option<T>[], help?: string): HTMLElement {
    const helpId = help ? `${name}-help` : undefined;
    const set = h(
      'fieldset',
      { class: options.length === 3 ? 'sw-segmented seg-3' : 'sw-segmented', 'aria-describedby': helpId },
      h('legend', { class: 'sw-sr' }, legend),
      ...options.flatMap((o) => [
        h('input', { type: 'radio', name, value: o.value, id: `${name}-${o.value}`, class: 'sw-segmented__input' }),
        h('label', { for: `${name}-${o.value}`, class: 'sw-segmented__option' }, o.label),
      ]),
    );
    return h(
      'div',
      { class: 'set-group' },
      h('p', { class: 'label set-label', 'aria-hidden': 'true' }, legend),
      set,
      help ? h('p', { id: helpId, class: 'body-sm set-help' }, help) : null,
    );
  }
}
customElements.define('tide-settings', TideSettings);
