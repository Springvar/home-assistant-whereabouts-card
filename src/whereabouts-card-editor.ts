import { LitElement, html, css } from 'lit';
import { property, state } from 'lit/decorators.js';
import { WhereaboutsCardConfig } from './whereabouts-card';

export class WhereaboutsCardEditor extends LitElement {
  @property({ attribute: false }) public hass: any;
  @state() private _config: WhereaboutsCardConfig = { persons: [] };

  setConfig(config: WhereaboutsCardConfig) {
    this._config = { ...config };
  }

  get availablePersons(): string[] {
    if (!this.hass) return [];
    return Object.keys(this.hass.states)
      .filter(eid => eid.startsWith('person.'))
      .filter(eid => !this._config.persons.some(p => p.entity_id === eid));
  }

  render() {
    if (!this.hass) return html``;

    return html`
      <div>
        <label>Add person:</label>
        <select @change=${this._addPerson}>
          <option value="">Select a person...</option>
          ${this.availablePersons.map(eid =>
            html`<option value=${eid}>${this.hass.states[eid].attributes.friendly_name || eid}</option>`
          )}
        </select>
      </div>
      <div>
        <label>Selected persons:</label>
        <ul>
          ${this._config.persons.map((person, idx) =>
            html`
              <li>
                ${person.name || this.hass.states[person.entity_id]?.attributes.friendly_name || person.entity_id}
                (${person.entity_id})
                <button @click=${() => this._removePerson(idx)}>Remove</button>
              </li>
            `
          )}
        </ul>
      </div>
    `;
  }

  _addPerson(e: Event) {
    const select = e.target as HTMLSelectElement;
    const entity_id = select.value;
    if (entity_id) {
      this._config = {
        ...this._config,
        persons: [...this._config.persons, { entity_id }]
      };
      select.value = '';
      this._emitConfigChanged();
    }
  }

  _removePerson(idx: number) {
    const newPersons = this._config.persons.filter((_, i) => i !== idx);
    this._config = { ...this._config, persons: newPersons };
    this._emitConfigChanged();
  }

  _emitConfigChanged() {
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: this._config },
      bubbles: true,
      composed: true,
    }));
  }

  static styles = css`
    div { margin-bottom: 1em; }
    ul { list-style: none; padding: 0; }
    li { margin-bottom: 0.5em; }
    button { margin-left: 1em; }
  `;
}

customElements.define('whereabouts-card-editor', WhereaboutsCardEditor);
