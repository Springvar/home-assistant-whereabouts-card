import { LitElement, html, css } from 'lit';
import { property, state } from 'lit/decorators.js';
import { WhereaboutsCardConfig } from './whereabouts-card';

// Use HTMLElement instead of LitElement for the class.
export class WhereaboutsCardEditor extends HTMLElement {
  hass: any;
  _persons: any[] = [];
  _availablePersons: string[] = [];
  _customEntity: string = '';
  _customName: string = '';
  static styles = css`
    div { margin-bottom: 16px; }
    ul { list-style: none; padding: 0; }
    li { margin-bottom: 8px; }
    button { margin-left: 8px; }
  `;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  setConfig(config: WhereaboutsCardConfig) {
    this._persons = [...(config.persons || [])];
    this._render();
  }

  set hassObj(hass: any) {
    this.hass = hass;
    this._availablePersons = Object.keys(hass.states).filter(eid => eid.startsWith('person.'));
    this._render();
  }

  addPerson(e: Event) {
    const select = this.shadowRoot!.getElementById('person-dropdown') as HTMLSelectElement;
    if (select?.value) {
      this._persons = [
        ...this._persons,
        { entity_id: select.value }
      ];
      select.value = '';
      this._updateConfig();
      this._render();
    }
  }

  addCustomPerson() {
    if (this._customEntity) {
      this._persons = [
        ...this._persons,
        { entity_id: this._customEntity, name: this._customName }
      ];
      this._customEntity = '';
      this._customName = '';
      this._updateConfig();
      this._render();
    }
  }

  removePerson(idx: number) {
    this._persons = this._persons.filter((_, i) => i !== idx);
    this._updateConfig();
    this._render();
  }

  _updateConfig() {
    this.dispatchEvent(
      new CustomEvent('config-changed', {
        detail: { config: { persons: this._persons } },
      })
    );
  }

  _onCustomEntityInput(e: any) {
    this._customEntity = e.target.value;
  }
  _onCustomNameInput(e: any) {
    this._customName = e.target.value;
  }

  _render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = `
      <style>
        div { margin-bottom: 16px; }
        ul { list-style: none; padding: 0; }
        li { margin-bottom: 8px; }
        button { margin-left: 8px; }
      </style>
      <div>
        <label>Add person:</label>
        <select id="person-dropdown">
          <option value="">Select...</option>
          ${
            this._availablePersons
              .filter(eid => !this._persons.some(p => p.entity_id === eid))
              .map(
                eid =>
                  `<option value="${eid}">${this.hass?.states[eid].attributes.friendly_name || eid}</option>`
              )
              .join('')
          }
        </select>
        <button id="add-person-btn">Add</button>
      </div>
      <div>
        <label>Add custom entity:</label>
        <input id="custom-entity" type="text" placeholder="Entity id" value="${this._customEntity}">
        <input id="custom-name" type="text" placeholder="Name (optional)" value="${this._customName}">
        <button id="add-custom-btn">Add custom</button>
      </div>
      <div style="margin-top: 1em;">
        <label>Configured persons:</label>
        <ul>
          ${this._persons
            .map(
              (p, idx) => `
              <li>
                ${p.name || this.hass?.states[p.entity_id]?.attributes.friendly_name || p.entity_id}
                (${p.entity_id})
                <button data-idx="${idx}" class="remove-person-btn">Remove</button>
              </li>`
            )
            .join('')}
        </ul>
      </div>
    `;

    // Add event listeners
    this.shadowRoot.getElementById('add-person-btn')?.addEventListener('click', (e) => this.addPerson(e));
    this.shadowRoot.getElementById('add-custom-btn')?.addEventListener('click', () => this.addCustomPerson());

    this.shadowRoot.getElementById('custom-entity')?.addEventListener('input', (e) => this._onCustomEntityInput(e));
    this.shadowRoot.getElementById('custom-name')?.addEventListener('input', (e) => this._onCustomNameInput(e));

    Array.from(this.shadowRoot.querySelectorAll('.remove-person-btn')).forEach((btn: Element) => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLButtonElement).getAttribute('data-idx') || '0', 10);
        this.removePerson(idx);
      });
    });
  }

  connectedCallback() {
    this._render();
  }
}

customElements.define('whereabouts-card-editor', WhereaboutsCardEditor);
