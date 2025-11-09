import { LitElement, html, css } from 'lit';
import { property } from 'lit/decorators.js';
import './whereabouts-card-editor';
import type { WhereaboutsCardEditor } from './whereabouts-card-editor';

interface PersonConfig {
  entity_id: string;
  name?: string;
}

export interface ZoneGroup {
  name?: string;
  zones: string[];
  preposition?: string;
  show_preposition?: boolean;
}

export interface WhereaboutsCardConfig {
  persons: PersonConfig[];
  show_title?: boolean;
  title?: string;
  default_verb?: string;
  default_preposition?: string;
  zone_groups?: ZoneGroup[];
}

class WhereaboutsCard extends LitElement {
  @property({ type: Array })
  persons: PersonConfig[];

  @property({ type: Boolean })
  show_title = true;

  @property({ type: String })
  title = "Whereabouts";

  @property({ type: String })
  default_verb = "is";

  @property({ type: String })
  default_preposition = "in";

  @property({ type: Array })
  zone_groups: ZoneGroup[] = [];

  @property({ attribute: false })
  hass: any;

  constructor() {
    super();
    this.persons = [];
    this.hass = undefined;
    this.show_title = true;
    this.title = "Whereabouts";
    this.default_verb = "is";
    this.default_preposition = "in";
    this.zone_groups = [];
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
    return { persons, show_title: true, title: "Whereabouts", default_verb: "is", default_preposition: "in", zone_groups: [] };
  }

  static get properties() {
    return {
      hass: {},
      persons: {},
      show_title: {},
      title: {},
      default_verb: {},
      default_preposition: {},
      zone_groups: {}
    };
  }

  setConfig(config: WhereaboutsCardConfig) {
    this.persons = config.persons || [];
    this.show_title = config.show_title !== undefined ? config.show_title : true;
    this.title = config.title || "Whereabouts";
    this.default_verb = config.default_verb || "is";
    this.default_preposition = config.default_preposition || "in";
    this.zone_groups = (config.zone_groups || []).map(
      z => ({ ...z, show_preposition: z.show_preposition !== false })
    );
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
            let usedPreposition = this.default_preposition;
            let showPreposition = true;
            let zoneNameOverride: string | undefined;

            const zoneId = zone;
            const zoneFriendlyName = this.hass.states[zone]?.attributes?.friendly_name || zone;
            if (Array.isArray(this.zone_groups)) {
              for (const group of this.zone_groups) {
                if (
                  group.zones.includes(zoneId)
                  || group.zones.includes(zoneFriendlyName)
                ) {
                  showPreposition = group.show_preposition !== false;
                  if (group.preposition) usedPreposition = group.preposition;
                  if (group.name) zoneNameOverride = group.name;
                  break;
                }
              }
            }

            // Prefer .name override, else friendly name, else raw state
            const zoneDisplay =
              zoneNameOverride ??
              this.hass.states[zone]?.attributes?.friendly_name ??
              zone;

            return html`
              <div>
                ${name} ${this.default_verb}
                ${showPreposition ? usedPreposition + ' ' : ''}
                ${zoneDisplay}
              </div>
            `;
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
