import { LitElement, html, css } from 'lit';
import { property } from 'lit/decorators.js';

interface PersonConfig {
  entity_id: string;
  name?: string;
}

export interface WhereaboutsCardConfig {
  persons: PersonConfig[];
}

class WhereaboutsCard extends LitElement {
  @property({ type: Array })
  persons: PersonConfig[];

  @property({ attribute: false })
  hass: any;

  constructor() {
    super();
    this.persons = [];
    this.hass = undefined;
  }

  static getConfigElement() {
    return document.createElement('whereabouts-card-editor');
  }

  // Add static property for Lovelace editor autodetection
  static getConfigElementStatic = () => document.createElement('whereabouts-card-editor');

  static getStubConfig(hass: any) {
    // Suggest first person entity if available
    const persons = Object.keys(hass.states)
      .filter(eid => eid.startsWith('person.'))
      .slice(0, 1)
      .map(eid => ({ entity_id: eid }));
    return { persons };
  }

  static get properties() {
    return {
      hass: {},
      persons: {},
    };
  }

  setConfig(config: WhereaboutsCardConfig) {
    this.persons = config.persons || [];
  }

  render() {
    if (!this.hass || this.persons.length === 0) {
      return html`<div>No persons configured</div>`;
    }
    return html`
      <ha-card header="Whereabouts Card">
        <div>
          ${this.persons.map(person => {
            const entity = this.hass.states[person.entity_id];
            if (!entity) return html`<div>${person.entity_id} – unavailable</div>`;
            const name = person.name || entity.attributes.friendly_name || person.entity_id;
            const zone = entity.state;
            return html`<div>${name} is in ${zone}</div>`;
          })}
        </div>
      </ha-card>
    `;
  }

  static styles = css`
    ha-card {
      padding: 16px;
    }
    div {
      margin: 8px 0;
    }
  `;
}

customElements.define('whereabouts-card', WhereaboutsCard);

// Ensure the editor is registered (for HA compatibility)
if (!customElements.get('whereabouts-card-editor')) {
  import('./whereabouts-card-editor');
}
