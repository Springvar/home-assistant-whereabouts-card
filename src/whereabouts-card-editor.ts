import { LitElement, html, css } from 'lit';
import { property, state } from 'lit/decorators.js';
import { WhereaboutsCardConfig, ZoneGroup } from './whereabouts-card';
import type { PersonSensors } from './types';

export class WhereaboutsCardEditor extends LitElement {
  @property({ attribute: false }) public hass: any;
  @state() private _config: WhereaboutsCardConfig = { persons: [], zone_groups: [] };
  @state() private _addingSensor: Map<number, { name: string; entity_id: string }> = new Map();

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
      <div class="editor-container">
        <div class="editor-panel">

      <!-- CARD SETTINGS -->
      <h3>Card Settings</h3>
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

      <!-- PERSONS SECTION -->
      <details open>
        <summary><h3 style="display: inline;">Persons</h3></summary>
        <div style="margin-left: 1em;">
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
        ${this._config.persons.map((person, idx) =>
          html`
            <fieldset style="margin-bottom:1em;">
              <legend>
                ${person.name || this.hass.states[person.entity_id]?.attributes?.friendly_name || person.entity_id}
                (${person.entity_id})
                <button @click=${() => this._removePerson(idx)}>Remove Person</button>
              </legend>
              <div>
                <label>Custom name (optional):</label>
                <input
                  type="text"
                  .value=${person.name || ''}
                  @input=${(e: Event) => this._personNameChanged(idx, e)}
                  placeholder="Leave empty to use entity name"
                />
              </div>

              <!-- Sensors -->
              <div>
                <strong>Sensors</strong>
                <p style="font-size: 0.9em; color: #666; margin-top: 0.25em; margin-bottom: 0.5em;">
                  Add sensors with custom names to use in activity rules
                </p>

                <div class="sensor-list">
                  <!-- Existing sensors -->
                  ${person.namedSensors && Object.keys(person.namedSensors).length > 0
                    ? Object.entries(person.namedSensors).map(([name, sensor]) => html`
                        <div class="sensor-row">
                          <input type="text" value="${name}" disabled style="width: 150px;" />
                          <input type="text" value="${Array.isArray(sensor.entity_id) ? sensor.entity_id.join(', ') : sensor.entity_id}" disabled style="flex: 1;" />
                          <button class="icon-button" @click=${() => this._removeNamedSensor(idx, name)} title="Remove">🗑️</button>
                        </div>
                      `)
                    : ''}

                  <!-- Adding new sensor row -->
                  ${this._addingSensor.has(idx) ? html`
                    <div class="sensor-row">
                      <input
                        type="text"
                        placeholder="name"
                        style="width: 150px;"
                        .value=${this._addingSensor.get(idx)!.name}
                        @input=${(e: Event) => this._updateAddingSensor(idx, 'name', (e.target as HTMLInputElement).value)}
                      />
                      <input
                        type="text"
                        placeholder="entity_id (comma for multiple)"
                        style="flex: 1;"
                        .value=${this._addingSensor.get(idx)!.entity_id}
                        @input=${(e: Event) => this._updateAddingSensor(idx, 'entity_id', (e.target as HTMLInputElement).value)}
                      />
                      <button
                        class="icon-button"
                        @click=${() => this._cancelAddingSensor(idx)}
                        title="Cancel"
                      >🗑️</button>
                    </div>
                    <div style="margin-top: 0.5em;">
                      <button @click=${() => this._saveAddingSensor(idx)}>Save Sensor</button>
                    </div>
                  ` : ''}
                </div>

                <!-- Add sensor button -->
                ${!this._addingSensor.has(idx) ? html`
                  <button
                    @click=${() => this._startAddingSensor(idx)}
                    style="margin-top: 0.5em;"
                  >+ Add Sensor</button>
                ` : ''}
              </div>

              <!-- Hide If Conditions -->
              <div>
                <strong>Hide If</strong>
                <p style="font-size: 0.9em; color: #666; margin-top: 0.25em; margin-bottom: 0.5em;">
                  Hide this person from the card if all conditions match
                </p>
                <div>
                  ${person.hideIf && Object.keys(person.hideIf).length > 0
                    ? Object.entries(person.hideIf).map(([key, value]) => html`
                      <div style="display: flex; gap: 0.5em; margin-bottom: 0.5em; align-items: center;">
                        <input type="text" value="${key}" disabled style="width: 120px;" />
                        <input type="text" value="${Array.isArray(value) ? value.join(', ') : value}" disabled style="flex: 1;" />
                        <button class="icon-button" @click=${() => this._removeHideIfCondition(idx, key)} title="Remove">🗑️</button>
                      </div>
                    `)
                    : ''}
                </div>
                <button @click=${() => this._addHideIfCondition(idx)} style="margin-top: 0.5em;">+ Add Condition</button>
              </div>
            </fieldset>
          `
        )}
      </div>
        </div>
      </details>

      <!-- ACTIVITIES SECTION -->
      <details>
        <summary><h3 style="display: inline;">Activities (Optional)</h3></summary>
        <div style="margin-left: 1em;">
          <p style="font-size: 0.9em; color: #666; margin-bottom: 0.5em;">
            Define general activities that apply to persons based on their sensor values.
          </p>
          <button @click=${this._addActivity}>Add Activity</button>
          <div>
            ${(this._config.activities ?? []).map((activity, idx) => html`
              <fieldset style="margin-bottom:1em;">
                <legend>
                  <input
                    type="text"
                    .value=${activity.verb || ''}
                    @input=${(e: Event) => this._activityVerbChanged(idx, e)}
                    placeholder="Activity verb (e.g., is gaming)"
                  />
                  <button @click=${() => this._removeActivity(idx)}>Remove</button>
                </legend>
                <div>
                  <label>Location override (optional):</label>
                  <input
                    type="text"
                    .value=${activity.location_override || ''}
                    @input=${(e: Event) => this._activityLocationOverrideChanged(idx, e)}
                    placeholder="Use '-' to hide location, or custom text"
                  />
                </div>
                <div>
                  <label>Icon (optional):</label>
                  <input
                    type="text"
                    .value=${activity.icon || ''}
                    @input=${(e: Event) => this._activityIconChanged(idx, e)}
                    placeholder="e.g., mdi:gamepad"
                  />
                </div>
                <div>
                  <label>
                    <input
                      type="checkbox"
                      .checked=${activity.show_preposition === true}
                      .indeterminate=${activity.show_preposition === undefined}
                      @change=${(e: Event) => this._activityShowPrepositionChanged(idx, e)}
                    />
                    Override zone preposition setting (show preposition)
                  </label>
                </div>
                <div>
                  <strong>Conditions</strong>
                  <p style="font-size: 0.9em; color: #666; margin-top: 0.25em;">
                    All conditions must match for this activity to apply. Use "who" to target a specific person, "where" to match zones or zone groups.
                  </p>
                  <div>
                    ${Object.entries(activity.conditions || {}).map(([key, value]) => html`
                      <div style="display: flex; gap: 0.5em; margin-bottom: 0.5em; align-items: center;">
                        <input type="text" value="${key}" disabled style="width: 120px;" />
                        <input type="text" value="${Array.isArray(value) ? value.join(', ') : value}" disabled style="flex: 1;" />
                        <button class="icon-button" @click=${() => this._removeActivityCondition(idx, key)} title="Remove">🗑️</button>
                      </div>
                    `)}
                  </div>
                  <button @click=${() => this._addActivityCondition(idx)} style="margin-top: 0.5em;">+ Add Condition</button>
                </div>
              </fieldset>
            `)}
          </div>
        </div>
      </details>

      <!-- ZONE GROUPS (Optional) -->
      <details>
        <summary><h3 style="display: inline;">Zone Groups (Optional)</h3></summary>
        <div style="margin-left: 1em;">
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
              <label>
                Icon:
                <input type="text" .value=${group.icon ?? ''} @input=${(e: Event) => this._zoneGroupIconChanged(gidx, e)} placeholder="(optional, e.g., mdi:home)" />
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
      </details>

      <!-- TEMPLATE (Optional) -->
      <details>
        <summary><h3 style="display: inline;">Template (Optional)</h3></summary>
        <div style="margin-left: 1em;">
          <p style="font-size: 0.9em; color: #666; margin-bottom: 1em;">
            Customize the display format. Available placeholders:
            <strong>{name}</strong>, <strong>{verb}</strong>, <strong>{preposition}</strong>,
            <strong>{location}</strong>, <strong>{icon}</strong>, <strong>{avatar}</strong>
          </p>
          <p style="font-size: 0.9em; color: #666; margin-bottom: 1em;">
            Use <strong>{-placeholder}</strong> to omit preceding space if empty.
            Use <strong>&lt;right ...&gt;</strong> to float content to the right.
          </p>
          <div>
            <label>
              Template:
              <input type="text"
                style="width: 100%; box-sizing: border-box; font-family: monospace;"
                .value=${this._config.template || '{name} {verb} {-preposition} {-location} <right {icon}>'}
                @input=${this._templateChanged}
                placeholder="{name} {verb} {-preposition} {-location} <right {icon}>" />
            </label>
            <p style="font-size: 0.85em; color: #888; margin: 0.3em 0 0 0;">
              Default: "{name} {verb} {-preposition} {-location} &lt;right {icon}&gt;"
            </p>
          </div>
        </div>
      </details>

        </div>
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

  _personNameChanged(idx: number, e: Event) {
    const value = (e.target as HTMLInputElement).value;
    const persons = [...this._config.persons];
    persons[idx] = { ...persons[idx], name: value || undefined };
    this._config = { ...this._config, persons };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _addActivity() {
    const activities = [...(this._config.activities ?? []), { verb: '', conditions: {} }];
    this._config = { ...this._config, activities };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _removeActivity(idx: number) {
    const activities = (this._config.activities ?? []).filter((_, i) => i !== idx);
    this._config = { ...this._config, activities };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _activityVerbChanged(idx: number, e: Event) {
    const value = (e.target as HTMLInputElement).value;
    const activities = [...(this._config.activities ?? [])];
    activities[idx] = { ...activities[idx], verb: value };
    this._config = { ...this._config, activities };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _activityLocationOverrideChanged(idx: number, e: Event) {
    const value = (e.target as HTMLInputElement).value;
    const activities = [...(this._config.activities ?? [])];
    activities[idx] = { ...activities[idx], location_override: value || undefined };
    this._config = { ...this._config, activities };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _activityIconChanged(idx: number, e: Event) {
    const value = (e.target as HTMLInputElement).value;
    const activities = [...(this._config.activities ?? [])];
    activities[idx] = { ...activities[idx], icon: value || undefined };
    this._config = { ...this._config, activities };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _activityShowPrepositionChanged(idx: number, e: Event) {
    const checkbox = e.target as HTMLInputElement;
    const activities = [...(this._config.activities ?? [])];

    // Cycle through three states: undefined (inherit) -> true -> false -> undefined
    const currentValue = activities[idx].show_preposition;
    let newValue: boolean | undefined;

    if (currentValue === undefined) {
      newValue = true;
    } else if (currentValue === true) {
      newValue = false;
    } else {
      newValue = undefined;
    }

    activities[idx] = { ...activities[idx], show_preposition: newValue };
    this._config = { ...this._config, activities };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _addActivityCondition(idx: number) {
    const key = prompt('Enter condition key (sensor name, "who", or "where"):');
    if (!key || !key.trim()) return;

    const valueStr = prompt('Enter value(s) - comma-separated for multiple, use operators like >5, <=10, <>off:');
    if (valueStr === null) return;

    const activities = [...(this._config.activities ?? [])];
    const conditions = { ...(activities[idx].conditions || {}) };

    // Parse value - check if comma-separated
    const value = valueStr.includes(',')
      ? valueStr.split(',').map(v => v.trim()).filter(v => v)
      : valueStr.trim();

    conditions[key.trim()] = value;
    activities[idx] = { ...activities[idx], conditions };
    this._config = { ...this._config, activities };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _removeActivityCondition(idx: number, key: string) {
    const activities = [...(this._config.activities ?? [])];
    const conditions = { ...(activities[idx].conditions || {}) };
    delete conditions[key];
    activities[idx] = { ...activities[idx], conditions };
    this._config = { ...this._config, activities };
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

  _zoneGroupIconChanged(gidx: number, e: Event) {
    const value = (e.target as HTMLInputElement).value;
    const groups: ZoneGroup[] = [...(this._config.zone_groups ?? [])];
    groups[gidx] = { ...groups[gidx], icon: value || undefined };
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

  _startAddingSensor(personIdx: number) {
    this._addingSensor.set(personIdx, { name: '', entity_id: '' });
    this.requestUpdate();
  }

  _updateAddingSensor(personIdx: number, field: 'name' | 'entity_id', value: string) {
    const sensor = this._addingSensor.get(personIdx);
    if (sensor) {
      this._addingSensor.set(personIdx, { ...sensor, [field]: value });
      this.requestUpdate();
    }
  }

  _saveAddingSensor(personIdx: number) {
    const sensor = this._addingSensor.get(personIdx);
    if (!sensor) return;

    // Only save if name and entity_id are provided
    if (!sensor.name.trim() || !sensor.entity_id.trim()) {
      return;
    }

    const persons = [...this._config.persons];
    const namedSensors: PersonSensors = persons[personIdx].namedSensors || {};

    // Parse entity_id - support comma-separated for multiple
    const entityIds = sensor.entity_id.includes(',')
      ? sensor.entity_id.split(',').map(id => id.trim()).filter(id => id)
      : sensor.entity_id.trim();

    namedSensors[sensor.name.trim()] = {
      entity_id: entityIds
    };

    persons[personIdx] = { ...persons[personIdx], namedSensors };
    this._config = { ...this._config, persons };

    // Clear adding state
    this._addingSensor.delete(personIdx);

    this.requestUpdate();
    this._emitConfigChanged();
  }

  _cancelAddingSensor(personIdx: number) {
    this._addingSensor.delete(personIdx);
    this.requestUpdate();
  }

  _removeNamedSensor(personIdx: number, sensorName: string) {
    const persons = [...this._config.persons];
    const namedSensors = { ...(persons[personIdx].namedSensors || {}) };
    delete namedSensors[sensorName];
    persons[personIdx] = { ...persons[personIdx], namedSensors };
    this._config = { ...this._config, persons };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _addHideIfCondition(personIdx: number) {
    const key = prompt('Enter condition key (sensor name):');
    if (!key || !key.trim()) return;

    const valueStr = prompt('Enter value(s) - comma-separated for multiple, use operators like >5, <=10, <>off:');
    if (valueStr === null) return;

    const persons = [...this._config.persons];
    const hideIf = { ...(persons[personIdx].hideIf || {}) };

    // Parse value - check if comma-separated
    const value = valueStr.includes(',')
      ? valueStr.split(',').map(v => v.trim()).filter(v => v)
      : valueStr.trim();

    hideIf[key.trim()] = value;
    persons[personIdx] = { ...persons[personIdx], hideIf };
    this._config = { ...this._config, persons };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _removeHideIfCondition(personIdx: number, key: string) {
    const persons = [...this._config.persons];
    const hideIf = { ...(persons[personIdx].hideIf || {}) };
    delete hideIf[key];

    // If hideIf is now empty, remove it entirely
    if (Object.keys(hideIf).length === 0) {
      persons[personIdx] = { ...persons[personIdx], hideIf: undefined };
    } else {
      persons[personIdx] = { ...persons[personIdx], hideIf };
    }

    this._config = { ...this._config, persons };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _templateChanged(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    this._config = { ...this._config, template: value };
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
    .editor-container {
      width: 100%;
    }
    .editor-panel {
      width: 100%;
    }
    div { margin-bottom: 1em; }
    ul { list-style: none; padding: 0; }
    li { margin-bottom: 0.5em; }
    button { margin-left: 1em; }
    input[type="text"] { margin-left: 1em; }
    fieldset { border: 1px solid #ccc; padding: 1em; }
    legend { font-weight: bold; }
    h3 { margin-top: 1.5em; margin-bottom: 0.5em; }
    h3:first-of-type { margin-top: 0; }
    details { margin-bottom: 1.5em; }
    details summary { cursor: pointer; user-select: none; }
    details summary:hover { text-decoration: underline; }

    .sensor-list {
      display: flex;
      flex-direction: column;
      gap: 0.5em;
      margin-top: 0.5em;
    }
    .sensor-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5em;
      align-items: center;
    }
    .sensor-row input[type="text"] {
      margin: 0;
      padding: 0.4em;
      font-size: 0.9em;
      border: 1px solid #ccc;
      border-radius: 3px;
      min-width: 0;
    }
    .sensor-row input[type="text"]:nth-child(1) {
      width: 150px;
      max-width: 150px;
      flex-shrink: 0;
    }
    .sensor-row input[type="text"]:nth-child(2) {
      flex: 1 1 200px;
      min-width: 150px;
    }
    .sensor-row input[disabled] {
      background: #f5f5f5;
      color: #666;
    }
    .icon-button {
      margin: 0;
      padding: 0.2em 0.6em;
      font-size: 1.2em;
      font-weight: bold;
      border: 1px solid #ccc;
      border-radius: 3px;
      background: white;
      cursor: pointer;
      min-width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .icon-button:hover {
      background: #f0f0f0;
    }
  `;
}

customElements.define('whereabouts-card-editor', WhereaboutsCardEditor);
