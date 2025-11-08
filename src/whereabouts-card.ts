import { LitElement, html, css } from 'lit';
import { property } from 'lit/decorators.js';
import './whereabouts-card-editor';

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

  static async getConfigElement() {
    await import('./whereabouts-card-editor');
    return document.createElement('whereabouts-card-editor');
  }

  static getConfigElementStatic = () => document.createElement('whereabouts-card-editor');

  static getStubConfig(hass: any) {
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

if (typeof window !== 'undefined') {
  (window as any).customCards = (window as any).customCards || [];
  (window as any).customCards.push({
    type: 'whereabouts-card',
    name: 'Whereabouts Card',
    preview: false,
    description: "Show one or more person's whereabouts as a simple card.",
  });
}
