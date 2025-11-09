import { LitElement, html, css } from 'lit';
import { property, state } from 'lit/decorators.js';
import { WhereaboutsCardConfig, ZoneGroup } from './whereabouts-card';

export class WhereaboutsCardEditor extends LitElement {
  @property({ attribute: false }) public hass: any;
  @state() private _config: WhereaboutsCardConfig = { persons: [], zone_groups: [] };

  get availablePersons(): string[] {
    if (!this.hass) return [];
    return Object.keys(this.hass.states)
      .filter(eid => eid.startsWith('person.'))
      .filter(eid => !this._config.persons.some(p => p.entity_id === eid));
  }

  get availableZones(): string[] {
    if (!this.hass) return [];
    let allZones = Object.keys(this.hass.states).filter(eid => eid.startsWith('zone.'));
    const homeZonePresent = allZones.includes('zone.home');
    if (!homeZonePresent) {
      allZones = ['home', ...allZones];
    }
    const usedZones = new Set(
      (this._config.zone_groups ?? []).flatMap((g: ZoneGroup) => g.zones)
    );
    return allZones
      .filter(zid => !usedZones.has(zid))
      .sort((a, b) => {
        const aname = this.hass.states[a]?.attributes?.friendly_name || (a === 'home' ? 'Home' : a);
        const bname = this.hass.states[b]?.attributes?.friendly_name || (b === 'home' ? 'Home' : b);
        return aname.localeCompare(bname);
      });
  }

  setConfig(config: WhereaboutsCardConfig) {
    this._config = { ...config };
    this._config.zone_groups = (this._config.zone_groups || []).map((zg) => ({
      ...zg,
      show_preposition: zg.show_preposition !== false
    })) as ZoneGroup[];
    this.requestUpdate();
  }

  render() {
    if (!this.hass) return html``;

    return html`
      <div>
        <label>
          <input
            type="checkbox"
            .checked=${this._config.show_title !== false}
            @change=${this._toggleShowTitle}
          />
          Show title
        </label>
        <input
          type="text"
          placeholder="Card Title"
          .value=${this._config.title ?? 'Whereabouts'}
          ?disabled=${this._config.show_title === false}
          @input=${this._titleChanged}
        />
      </div>
      <div>
        <label>Default verb:</label>
        <input
          type="text"
          .value=${this._config.default_verb ?? 'is'}
          @input=${this._defaultVerbChanged}
        />
      </div>
      <div>
        <label>Default preposition:</label>
        <input
          type="text"
          .value=${this._config.default_preposition ?? 'in'}
          @input=${this._defaultPrepositionChanged}
        />
      </div>
      <div>
        <label>Zone Groups:</label>
        <button @click=${this._addZoneGroup}>Add group</button>
        <div>
          ${(this._config.zone_groups ?? []).map((group: ZoneGroup, gidx: number) => html`
            <fieldset style="margin-bottom:1em;">
              <legend>
                <input type="text" .value=${group.name ?? ''} @input=${(e: Event) => this._zoneGroupNameChanged(gidx, e)} placeholder="Group Name (optional)" />
                <button @click=${() => this._removeZoneGroup(gidx)}>Remove Group</button>
              </legend>
              <label>
                <input type="checkbox"
                  .checked=${group.show_preposition !== false}
                  @change=${(e: Event) => this._zoneGroupShowPrepositionChanged(gidx, e)}/>
                Show preposition
              </label>
              <label>
                Preposition:
                <input type="text" .value=${group.preposition ?? ''} @input=${(e: Event) => this._zoneGroupPrepositionChanged(gidx, e)} placeholder="(optional, e.g., at)" />
              </label>
              <div>
                <label>Add zone:</label>
                <select @change=${(e: Event) => this._addZoneToGroup(gidx, e)}>
                  <option value="">Select a zone...</option>
                  ${this.availableZones.map(zid =>
                    html`<option value=${zid}>${this.hass.states[zid]?.attributes?.friendly_name || (zid === 'home' ? 'Home' : zid)}</option>`
                  )}
        </select>
      </div>
      <div>
                Zones:
        <ul>
                  ${group.zones
                    .slice()
                    .sort((a, b) => {
                      const aname = this.hass.states[a]?.attributes?.friendly_name || (a === 'home' ? 'Home' : a);
                      const bname = this.hass.states[b]?.attributes?.friendly_name || (b === 'home' ? 'Home' : b);
                      return aname.localeCompare(bname);
                    })
                    .map(zid => html`
              <li>
                        ${this.hass.states[zid]?.attributes?.friendly_name || (zid === 'home' ? 'Home' : zid)}
                        <button @click=${() => this._removeZoneFromGroup(gidx, group.zones.indexOf(zid))}>Remove</button>
              </li>
                    `)
  }
                </ul>
              </div>
            </fieldset>
          `)}
        </div>
      </div>
      <div>
        <label>Add person:</label>
        <select @change=${this._addPerson}>
          <option value="">Select a person...</option>
          ${this.availablePersons.map(eid =>
            html`<option value=${eid}>${this.hass.states[eid]?.attributes?.friendly_name || eid}</option>`
          )}
        </select>
      </div>
      <div>
        <label>Selected persons:</label>
        <ul>
          ${this._config.persons.map((person, idx) =>
            html`
              <li>
                ${person.name || this.hass.states[person.entity_id]?.attributes?.friendly_name || person.entity_id}
                (${person.entity_id})
                <button @click=${() => this._removePerson(idx)}>Remove</button>
              </li>
            `
          )}
        </ul>
      </div>
  `;
}

  _toggleShowTitle(e: Event) {
    const checked = (e.target as HTMLInputElement).checked;
    this._config = { ...this._config, show_title: checked };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _titleChanged(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    this._config = { ...this._config, title: value };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _defaultVerbChanged(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    this._config = { ...this._config, default_verb: value };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _defaultPrepositionChanged(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    this._config = { ...this._config, default_preposition: value };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _addPerson(e: Event) {
    const select = e.target as HTMLSelectElement;
    const entity_id = select.value;
    if (
      entity_id &&
      !this._config.persons.some(p => p.entity_id === entity_id)
    ) {
      this._config = { ...this._config, persons: [...this._config.persons, { entity_id }] };
      select.value = '';
      this.requestUpdate();
      this._emitConfigChanged();
    }
  }

  _removePerson(idx: number) {
    const newPersons = this._config.persons.filter((_, i) => i !== idx);
    this._config = { ...this._config, persons: newPersons };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _addZoneGroup() {
    const added: ZoneGroup[] = [...(this._config.zone_groups ?? []), { name: '', zones: [], show_preposition: true }];
    this._config = { ...this._config, zone_groups: added };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _removeZoneGroup(idx: number) {
    const updated: ZoneGroup[] = (this._config.zone_groups ?? []).filter((_, i) => i !== idx);
    this._config = { ...this._config, zone_groups: updated };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _zoneGroupNameChanged(gidx: number, e: Event) {
    const value = (e.target as HTMLInputElement).value;
    const groups: ZoneGroup[] = [...(this._config.zone_groups ?? [])];
    groups[gidx] = { ...groups[gidx], name: value };
    this._config = { ...this._config, zone_groups: groups };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _zoneGroupPrepositionChanged(gidx: number, e: Event) {
    const value = (e.target as HTMLInputElement).value;
    const groups: ZoneGroup[] = [...(this._config.zone_groups ?? [])];
    groups[gidx] = { ...groups[gidx], preposition: value };
    this._config = { ...this._config, zone_groups: groups };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _zoneGroupShowPrepositionChanged(gidx: number, e: Event) {
    const checked = (e.target as HTMLInputElement).checked;
    const groups: ZoneGroup[] = [...(this._config.zone_groups ?? [])];
    groups[gidx] = { ...groups[gidx], show_preposition: checked };
    this._config = { ...this._config, zone_groups: groups };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _addZoneToGroup(gidx: number, e: Event) {
    const select = e.target as HTMLSelectElement;
    const zid = select.value;
    if (
      zid &&
      !(this._config.zone_groups ?? []).some(g => g.zones.includes(zid)) &&
      !(this._config.zone_groups ?? [])[gidx].zones.includes(zid)
    ) {
      const groups: ZoneGroup[] = [...(this._config.zone_groups ?? [])];
      groups[gidx] = { ...groups[gidx], zones: [...groups[gidx].zones, zid] };
      this._config = { ...this._config, zone_groups: groups };
      select.value = '';
      this.requestUpdate();
      this._emitConfigChanged();
    }
  }

  _removeZoneFromGroup(gidx: number, zidx: number) {
    const groups: ZoneGroup[] = [...(this._config.zone_groups ?? [])];
    groups[gidx] = { ...groups[gidx], zones: groups[gidx].zones.filter((_, i) => i !== zidx) };
    this._config = { ...this._config, zone_groups: groups };
    this.requestUpdate();
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
    input[type="text"] { margin-left: 1em; }
    fieldset { border: 1px solid #ccc; padding: 1em; }
    legend { font-weight: bold; }
  `;
}

customElements.define('whereabouts-card-editor', WhereaboutsCardEditor);
