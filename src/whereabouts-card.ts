import { LitElement, html, css } from 'lit';
import { property } from 'lit/decorators.js';
import './whereabouts-card-editor';
import type { WhereaboutsCardEditor } from './whereabouts-card-editor';

interface PersonConfig {
  entity_id: string;
  name?: string;
}

export interface WhereaboutsCardConfig {
  persons: PersonConfig[];
  show_title?: boolean;
  title?: string;
}

class WhereaboutsCard extends LitElement {
  @property({ type: Array })
  persons: PersonConfig[];

  @property({ type: Boolean })
  show_title = true;

  @property({ type: String })
  title = "Whereabouts";

  @property({ attribute: false })
  hass: any;

  constructor() {
    super();
    this.persons = [];
    this.hass = undefined;
    this.show_title = true;
    this.title = "Whereabouts";
  }

  static async getConfigElement(config: WhereaboutsCardConfig) {
    await import('./whereabouts-card-editor');
    const el = document.createElement('whereabouts-card-editor') as WhereaboutsCardEditor;
    el.setConfig(config);
    return el;
  }

  static getConfigElementStatic(config: WhereaboutsCardConfig) {
    const el = document.createElement('whereabouts-card-editor') as WhereaboutsCardEditor;
    el.setConfig(config);
    return el;
  }

  static getStubConfig(hass: any) {
    const persons = Object.keys(hass.states)
      .filter(eid => eid.startsWith('person.'))
      .slice(0, 1)
      .map(eid => ({ entity_id: eid }));
    return { persons, show_title: true, title: "Whereabouts" };
  }

  static get properties() {
    return {
      hass: {},
      persons: {},
      show_title: {},
      title: {}
    };
  }

  setConfig(config: WhereaboutsCardConfig) {
    this.persons = config.persons || [];
    this.show_title = config.show_title !== undefined ? config.show_title : true;
    this.title = config.title || "Whereabouts";
  }

  render() {
    if (!this.hass || this.persons.length === 0) {
      return html`<div>No persons configured</div>`;
    }
    return html`
      <ha-card>
        ${this.show_title ? html`<div class="card-header">${this.title}</div>` : ""}
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
    .card-header {
      font-weight: bold;
      font-size: 1.2em;
      margin-bottom: 10px;
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

