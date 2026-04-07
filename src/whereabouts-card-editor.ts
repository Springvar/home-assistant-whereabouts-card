import { LitElement, html, css } from 'lit';
import { property, state } from 'lit/decorators.js';
import { WhereaboutsCardConfig, ZoneGroup } from './whereabouts-card';
import type { PersonSensors } from './types';

export class WhereaboutsCardEditor extends LitElement {
  @property({ attribute: false }) public hass: any;
  @state() private _config: WhereaboutsCardConfig = { persons: [], zone_groups: [] };

  get availablePersons(): string[] {
    if (!this.hass) return [];
    return Object.keys(this.hass.states)
      .filter(eid => eid.startsWith('person.'))
      .filter(eid => !this._config.persons.some(p => p.entity_id === eid));
  }

  get usedIcons(): string[] {
    const icons = new Set<string>();
    // Collect from activities
    (this._config.activities ?? []).forEach(activity => {
      if (activity.icon) icons.add(activity.icon);
    });
    // Collect from zone groups
    (this._config.zone_groups ?? []).forEach(group => {
      if (group.icon) icons.add(group.icon);
    });
    return Array.from(icons).sort();
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

  isZoneValid(zoneId: string): boolean {
    if (!this.hass) return false;
    if (zoneId === 'home') return true;
    return !!this.hass.states[zoneId];
  }

  getZoneGroupInvalidZones(group: ZoneGroup): string[] {
    return group.zones.filter(zid => !this.isZoneValid(zid));
  }

  hasAnyInvalidZones(): boolean {
    return (this._config.zone_groups ?? []).some(group =>
      this.getZoneGroupInvalidZones(group).length > 0
    );
  }

  getSensorState(entityId: string | string[]): string {
    if (!this.hass) return 'unavailable';

    // Handle array of entity IDs
    if (Array.isArray(entityId)) {
      const states = entityId.map(id => this.hass.states[id]?.state || 'unknown');
      return states.join(' | ');
    }

    return this.hass.states[entityId]?.state || 'unavailable';
  }

  getSensorFriendlyName(entityId: string | string[]): string {
    if (!this.hass) return '';

    // Handle array of entity IDs
    if (Array.isArray(entityId)) {
      return entityId.map(id =>
        this.hass.states[id]?.attributes?.friendly_name || id
      ).join(' / ');
    }

    return this.hass.states[entityId]?.attributes?.friendly_name || entityId;
  }

  validateConditionValue(key: string, value: string | string[]): { valid: boolean; error?: string } {
    const val = Array.isArray(value) ? value.join(', ') : value;

    if (key === 'random') {
      return this.validateRandomValue(val);
    } else if (key === 'when') {
      return this.validateWhenValue(val);
    } else if (key === 'who') {
      return this.validateWhoValue(val);
    } else if (key === 'where') {
      return this.validateWhereValue(val);
    }

    return { valid: true };
  }

  validateRandomValue(value: string): { valid: boolean; error?: string } {
    if (!value.trim()) return { valid: false, error: 'Value required' };

    const trimmed = value.trim();

    // Check percentage format
    if (trimmed.endsWith('%')) {
      const num = parseFloat(trimmed.slice(0, -1));
      if (isNaN(num) || num < 0 || num > 100) {
        return { valid: false, error: 'Must be 0-100%' };
      }
      return { valid: true };
    }

    // Check decimal format
    const num = parseFloat(trimmed);
    if (isNaN(num) || num < 0 || num > 1) {
      return { valid: false, error: 'Must be 0-100% or 0-1' };
    }
    return { valid: true };
  }

  validateWhenValue(value: string): { valid: boolean; error?: string } {
    if (!value.trim()) return { valid: false, error: 'Value required' };

    const validPeriods = ['night', 'morning', 'afternoon', 'evening', 'weekday', 'weekend', 'schoolday', 'afterschool'];

    // Split by comma or "OR" (case insensitive)
    const periods = value.split(/,|\bor\b/i).map(p => p.trim().toLowerCase()).filter(p => p);

    if (periods.length === 0) {
      return { valid: false, error: 'At least one time period required' };
    }

    const invalidPeriods = periods.filter(p => !validPeriods.includes(p));
    if (invalidPeriods.length > 0) {
      return { valid: false, error: `Invalid: ${invalidPeriods.join(', ')}` };
    }

    return { valid: true };
  }

  validateWhoValue(value: string): { valid: boolean; error?: string } {
    if (!value.trim()) return { valid: false, error: 'Value required' };
    if (!this.hass) return { valid: true }; // Can't validate without hass

    // Split by comma
    const values = value.split(',').map(v => v.trim()).filter(v => v);

    for (const val of values) {
      // Special case: "user" is always valid
      if (val.toLowerCase() === 'user') continue;

      // Check if it's a valid person entity
      const entityId = val.startsWith('person.') ? val : `person.${val}`;
      const isValidEntity = !!this.hass.states[entityId];

      // Check if it matches a person's custom name
      const matchesName = this._config.persons.some(p =>
        p.name?.toLowerCase() === val.toLowerCase() ||
        p.entity_id === val ||
        p.entity_id === entityId
      );

      if (!isValidEntity && !matchesName) {
        return { valid: false, error: `Unknown person: ${val}` };
      }
    }

    return { valid: true };
  }

  validateWhereValue(value: string): { valid: boolean; error?: string } {
    if (!value.trim()) return { valid: false, error: 'Value required' };
    if (!this.hass) return { valid: true }; // Can't validate without hass

    // Split by comma
    const values = value.split(',').map(v => v.trim()).filter(v => v);

    for (const val of values) {
      // Check if it's a valid zone
      const zoneId = val.startsWith('zone.') ? val : (val === 'home' ? 'home' : `zone.${val}`);
      const isValidZone = zoneId === 'home' || !!this.hass.states[zoneId];

      // Check if it matches a zone group name
      const matchesZoneGroup = (this._config.zone_groups ?? []).some(g =>
        g.name?.toLowerCase() === val.toLowerCase()
      );

      if (!isValidZone && !matchesZoneGroup) {
        return { valid: false, error: `Unknown zone: ${val}` };
      }
    }

    return { valid: true };
  }

  setConfig(config: WhereaboutsCardConfig) {
    this._config = { ...config };
    this._config.zone_groups = (this._config.zone_groups || []).map((zg) => ({
      ...zg,
      show_preposition: zg.show_preposition !== false
    })) as ZoneGroup[];

    this.requestUpdate();
  }

  private _renderIconPicker(currentValue: string, placeholder: string, onChange: (value: string) => void) {
    const defaultIcons = [
      'mdi:account', 'mdi:home', 'mdi:office-building', 'mdi:briefcase',
      'mdi:gamepad', 'mdi:power-sleep', 'mdi:bike', 'mdi:car', 'mdi:walk',
      'mdi:run', 'mdi:map-marker', 'mdi:school', 'mdi:shopping', 'mdi:hospital',
      'mdi:food', 'mdi:coffee', 'mdi:dumbbell', 'mdi:airplane', 'mdi:phone',
      'mdi:laptop', 'mdi:television', 'mdi:briefcase-clock', 'mdi:desktop-classic'
    ];

    // Merge used icons with defaults
    const allIcons = [...new Set([...this.usedIcons, ...defaultIcons])].sort();

    return html`
      <div style="display: flex; align-items: flex-start; gap: 8px; margin-bottom: 4px;">
        <input
          type="text"
          .value=${currentValue || ''}
          @input=${(e: Event) => onChange((e.target as HTMLInputElement).value)}
          placeholder=${placeholder}
          list="icon-suggestions-enhanced"
          style="flex: 1;"
        />
        ${currentValue ? html`<ha-icon icon="${currentValue}" style="--mdc-icon-size: 24px;"></ha-icon>` : ''}
      </div>
      <details style="margin-top: 4px; margin-bottom: 8px;">
        <summary style="cursor: pointer; font-size: 0.9em; color: #666;">Pick an icon</summary>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(40px, 1fr)); gap: 4px; margin-top: 8px; padding: 8px; background: var(--secondary-background-color); border-radius: 4px; max-height: 200px; overflow-y: auto;">
          ${allIcons.map(icon => html`
            <button
              @click=${() => {
                onChange(icon);
                this.requestUpdate();
              }}
              style="padding: 8px; border: 1px solid var(--divider-color); background: var(--card-background-color); border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; ${currentValue === icon ? 'border-color: var(--primary-color); border-width: 2px;' : ''}"
              title="${icon}"
            >
              <ha-icon icon="${icon}" style="--mdc-icon-size: 20px;"></ha-icon>
            </button>
          `)}
        </div>
      </details>
    `;
  }

  render() {
    if (!this.hass) return html``;

    return html`
      <div class="editor-container">
        <div class="editor-panel">

      <!-- CARD SETTINGS -->
      <h3>Card Settings</h3>
      <div>
        <label>Default activity:</label>
        <input
          type="text"
          .value=${this._config.default_activity ?? this._config.default_verb ?? 'is'}
          @input=${this._defaultActivityChanged}
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
      <details ?open=${this._config.persons.length === 0}>
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
            <details style="margin-bottom:1em; border: 1px solid #ccc; padding: 0.5em; border-radius: 4px;">
              <summary style="cursor: pointer; font-weight: bold;">
                ${person.name || this.hass.states[person.entity_id]?.attributes?.friendly_name || person.entity_id}
                <span style="font-weight: normal; color: #666;">(${person.entity_id})</span>
                <button @click=${(e: Event) => { e.preventDefault(); e.stopPropagation(); this._removePerson(idx); }}>Remove Person</button>
              </summary>
              <div style="margin-top: 0.5em;">
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
                  ${person.namedSensors && Object.keys(person.namedSensors).length > 0
                    ? Object.entries(person.namedSensors).map(([name, sensor]) => html`
                        <div class="sensor-row">
                          <input
                            type="text"
                            value="${name}"
                            placeholder="name"
                            style="width: 150px;"
                            @blur=${(e: Event) => this._updateNamedSensorName(idx, name, (e.target as HTMLInputElement).value)}
                          />
                          <input
                            type="text"
                            value="${Array.isArray(sensor.entity_id) ? sensor.entity_id.join(', ') : sensor.entity_id}"
                            placeholder="entity_id (comma for multiple)"
                            list="entity-suggestions"
                            style="flex: 1;"
                            @blur=${(e: Event) => this._updateNamedSensorEntity(idx, name, (e.target as HTMLInputElement).value)}
                          />
                          <button class="icon-button" @click=${() => this._removeNamedSensor(idx, name)} title="Remove">🗑️</button>
                        </div>
                        ${sensor.entity_id ? html`
                          <div style="margin-left: 160px; font-size: 0.85em; color: #666; margin-bottom: 0.5em;">
                            ${this.getSensorFriendlyName(sensor.entity_id)}: <strong>${this.getSensorState(sensor.entity_id)}</strong>
                          </div>
                        ` : ''}
                      `)
                    : ''}
                </div>

                <button
                  @click=${() => this._addNamedSensor(idx)}
                  style="margin-top: 0.5em;"
                >+ Add Sensor</button>
              </div>

              <!-- Hide If Conditions -->
              <div>
                <strong>Hide If</strong>
                <p style="font-size: 0.9em; color: #666; margin-top: 0.25em; margin-bottom: 0.5em;">
                  Hide this person from the card if all conditions match
                </p>
                <div>
                  ${person.hideIf && Object.keys(person.hideIf).length > 0
                    ? Object.entries(person.hideIf).map(([key, value]) => {
                      const validation = this.validateConditionValue(key, value);
                      return html`
                      <div style="margin-bottom: 0.5em;">
                        <div style="display: flex; gap: 0.5em; align-items: center;">
                          <input
                            type="text"
                            value="${key}"
                            placeholder="condition key"
                            list="condition-key-suggestions-${idx}"
                            style="width: 120px;"
                            @blur=${(e: Event) => this._updateHideIfConditionKey(idx, key, (e.target as HTMLInputElement).value)}
                          />
                          <input
                            type="text"
                            value="${Array.isArray(value) ? value.join(', ') : value}"
                            placeholder="value (comma-separated for multiple)"
                            style="flex: 1; ${!validation.valid ? 'border-color: #ff9800;' : ''}"
                            @blur=${(e: Event) => this._updateHideIfConditionValue(idx, key, (e.target as HTMLInputElement).value)}
                          />
                          <button class="icon-button" @click=${() => this._removeHideIfCondition(idx, key)} title="Remove">🗑️</button>
                        </div>
                        ${!validation.valid ? html`
                          <div style="margin-left: 130px; margin-top: 0.25em; color: #ff9800; font-size: 0.85em;" title="${validation.error}">
                            ⚠️ ${validation.error}
                          </div>
                        ` : ''}
                      </div>
                    `;
                    })
                    : ''}
                </div>
                <datalist id="condition-key-suggestions-${idx}">
                  <option value="random">
                  <option value="user">
                  <option value="when">
                  <option value="who">
                  <option value="where">
                  <option value="is_workday">
                  <option value="is_work_hours">
                  <option value="is_night">
                  <option value="is_morning">
                  <option value="is_afternoon">
                  <option value="is_evening">
                  <option value="day">
                  ${person.namedSensors ? Object.keys(person.namedSensors).map(sensorName => html`
                    <option value="${sensorName}">
                  `) : ''}
                </datalist>
                <button @click=${() => this._addHideIfCondition(idx)} style="margin-top: 0.5em;">+ Add Condition</button>
              </div>
              </div>
            </details>
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
          <div>
            ${(this._config.activities ?? []).map((activity, idx) => html`
              <details style="margin-bottom:1em; border: 1px solid #ccc; padding: 0.5em; border-radius: 4px;">
                <summary style="cursor: pointer; font-weight: bold;">
                  ${activity.activity || activity.verb || `Activity ${idx + 1}`}
                  ${idx > 0 ? html`<button @click=${(e: Event) => { e.preventDefault(); e.stopPropagation(); this._moveActivityUp(idx); }} title="Move Up">↑</button>` : ''}
                  ${idx < (this._config.activities?.length ?? 0) - 1 ? html`<button @click=${(e: Event) => { e.preventDefault(); e.stopPropagation(); this._moveActivityDown(idx); }} title="Move Down">↓</button>` : ''}
                  <button @click=${(e: Event) => { e.preventDefault(); e.stopPropagation(); this._removeActivity(idx); }}>Remove</button>
                </summary>
                <div style="margin-top: 0.5em;">
                <div>
                  <label>Activity:</label>
                  <input
                    type="text"
                    .value=${activity.activity || activity.verb || ''}
                    @input=${(e: Event) => this._activityChanged(idx, e)}
                    placeholder="Activity (e.g., is gaming)"
                  />
                </div>
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
                  <label>
                    <input
                      type="checkbox"
                      class="tristate-checkbox"
                      .checked=${activity.show_preposition === true}
                      .indeterminate=${activity.show_preposition === undefined}
                      @change=${(e: Event) => this._activityShowPrepositionChanged(idx, e)}
                    />
                    Show preposition
                  </label>
                </div>
                ${activity.show_preposition !== false ? html`
                <div style="margin-left: 1.5em; margin-top: 0.5em; display: flex; align-items: flex-start; gap: 8px;">
                  <label style="flex-shrink: 0;">Preposition:</label>
                  <input
                    type="text"
                    .value=${activity.preposition || ''}
                    @input=${(e: Event) => this._activityPrepositionChanged(idx, e)}
                    placeholder="(optional, e.g., from, near)"
                    style="flex: 1; min-width: 100px; box-sizing: border-box;"
                  />
                </div>
                ` : ''}
                <div style="display: flex; align-items: flex-start; gap: 8px;">
                  <label style="flex-shrink: 0;">Icon (optional):</label>
                  <div style="flex: 1; min-width: 150px;">
                    ${this._renderIconPicker(
                      activity.icon || '',
                      'e.g., mdi:gamepad',
                      (value) => {
                        const activities = [...(this._config.activities || [])];
                        activities[idx] = { ...activities[idx], icon: value || undefined };
                        this._config = { ...this._config, activities };
                        this._emitConfigChanged();
                      }
                    )}
                  </div>
                </div>
                <div>
                  <strong>Conditions</strong>
                  <p style="font-size: 0.9em; color: #666; margin-top: 0.25em;">
                    All conditions must match for this activity to apply. Special keys: "random" (0-100% or 0-1), "who" (person), "where" (zone/group), "when" (time period), "user" (HA user).
                  </p>
                  <div>
                    ${Object.entries(activity.conditions || {}).map(([key, value]) => {
                      const validation = this.validateConditionValue(key, value);
                      return html`
                      <div style="margin-bottom: 0.5em;">
                        <div style="display: flex; gap: 0.5em; align-items: center;">
                          <input
                            type="text"
                            value="${key}"
                            placeholder="condition key"
                            list="activity-condition-suggestions"
                            style="width: 120px;"
                            @blur=${(e: Event) => this._updateActivityConditionKey(idx, key, (e.target as HTMLInputElement).value)}
                          />
                          <input
                            type="text"
                            value="${Array.isArray(value) ? value.join(', ') : value}"
                            placeholder="value (comma-separated for multiple)"
                            style="flex: 1; ${!validation.valid ? 'border-color: #ff9800;' : ''}"
                            @blur=${(e: Event) => this._updateActivityConditionValue(idx, key, (e.target as HTMLInputElement).value)}
                          />
                          <button class="icon-button" @click=${() => this._removeActivityCondition(idx, key)} title="Remove">🗑️</button>
                        </div>
                        ${!validation.valid ? html`
                          <div style="margin-left: 130px; margin-top: 0.25em; color: #ff9800; font-size: 0.85em;" title="${validation.error}">
                            ⚠️ ${validation.error}
                          </div>
                        ` : ''}
                      </div>
                    `;
                    })}
                  </div>
                  <button @click=${() => this._addActivityCondition(idx)} style="margin-top: 0.5em;">+ Add Condition</button>
                </div>
                </div>
              </details>
            `)}
          </div>
          <button @click=${this._addActivity} style="margin-top: 0.5em;">Add Activity</button>
        </div>
      </details>

      <!-- ZONE GROUPS (Optional) -->
      <details>
        <summary>
          <h3 style="display: inline;">Zone Groups (Optional)</h3>
          ${this.hasAnyInvalidZones() ? html`<span style="color: #ff9800; font-size: 1.2em; margin-left: 0.5em;" title="Some zones are missing">⚠️</span>` : ''}
        </summary>
        <div style="margin-left: 1em;">
          <div>
        <label>Zone Groups:</label>
        <div>
          ${(this._config.zone_groups ?? []).map((group: ZoneGroup, gidx: number) => {
            const invalidZones = this.getZoneGroupInvalidZones(group);
            const hasInvalidZones = invalidZones.length > 0;

            // Format zone list for display when no group name
            const zoneLabel = group.zones.map(zid =>
              this.hass.states[zid]?.attributes?.friendly_name || (zid === 'home' ? 'Home' : zid.replace('zone.', ''))
            ).join(', ');

            return html`
            <details style="margin-bottom:1em; border: 1px solid #ccc; padding: 0.5em; border-radius: 4px;">
              <summary style="cursor: pointer; font-weight: bold;">
                ${group.name || zoneLabel || `Zone Group ${gidx + 1}`}
                ${hasInvalidZones ? html`<span style="color: #ff9800; font-size: 1.2em; margin-left: 0.5em;" title="Contains invalid zones: ${invalidZones.join(', ')}">⚠️</span>` : ''}
                <button @click=${(e: Event) => { e.preventDefault(); e.stopPropagation(); this._removeZoneGroup(gidx); }} style="margin-left: 1em;">Remove Group</button>
              </summary>
              <div style="margin-top: 0.5em;">
              <div>
                <label>
                  <input type="checkbox"
                    .checked=${group.override_location !== false}
                    @change=${(e: Event) => this._zoneGroupOverrideLocationChanged(gidx, e)}/>
                  Show location
                </label>
              </div>
              ${group.override_location !== false ? html`
              <div style="margin-left: 1.5em; margin-top: 0.5em; display: flex; align-items: flex-start; gap: 8px;">
                <label style="flex-shrink: 0;">Display as:</label>
                <input type="text"
                  .value=${group.name ?? ''}
                  @input=${(e: Event) => this._zoneGroupNameChanged(gidx, e)}
                  placeholder="(optional, replace zone names with alternative name)"
                  style="flex: 1; min-width: 150px; box-sizing: border-box;" />
              </div>
              ` : ''}
              <div>
                <label>
                  <input
                    type="checkbox"
                    class="tristate-checkbox"
                    .checked=${group.show_preposition === true}
                    .indeterminate=${group.show_preposition === undefined}
                    @change=${(e: Event) => this._zoneGroupShowPrepositionChanged(gidx, e)}
                  />
                  Show preposition
                </label>
              </div>
              ${group.show_preposition !== false ? html`
              <div style="margin-left: 1.5em; margin-top: 0.5em; display: flex; align-items: flex-start; gap: 8px;">
                <label style="flex-shrink: 0;">Preposition:</label>
                <input type="text"
                  .value=${group.preposition ?? ''}
                  @input=${(e: Event) => this._zoneGroupPrepositionChanged(gidx, e)}
                  placeholder="(optional, e.g., at)"
                  style="flex: 1; min-width: 100px; box-sizing: border-box;" />
              </div>
              ` : ''}
              <div style="display: flex; align-items: flex-start; gap: 8px;">
                <label style="flex-shrink: 0;">Icon (optional):</label>
                <div style="flex: 1; min-width: 150px;">
                  ${this._renderIconPicker(
                    group.icon || '',
                    'e.g., mdi:home',
                    (value) => {
                      const zone_groups = [...(this._config.zone_groups || [])];
                      zone_groups[gidx] = { ...zone_groups[gidx], icon: value || undefined };
                      this._config = { ...this._config, zone_groups };
                      this._emitConfigChanged();
                    }
                  )}
                </div>
              </div>
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
        <ul>
                  ${group.zones
                    .slice()
                    .sort((a, b) => {
                      const aname = this.hass.states[a]?.attributes?.friendly_name || (a === 'home' ? 'Home' : a);
                      const bname = this.hass.states[b]?.attributes?.friendly_name || (b === 'home' ? 'Home' : b);
                      return aname.localeCompare(bname);
                    })
                    .map(zid => {
                      const isValid = this.isZoneValid(zid);
                      return html`
              <li>
                        ${!isValid ? html`<span style="color: #ff9800; margin-right: 0.5em;" title="Zone not found">⚠️</span>` : ''}
                        ${this.hass.states[zid]?.attributes?.friendly_name || (zid === 'home' ? 'Home' : zid)}
                        ${!isValid ? html`<span style="color: #999; font-size: 0.9em; margin-left: 0.5em;">(${zid})</span>` : ''}
                        <button @click=${() => this._removeZoneFromGroup(gidx, group.zones.indexOf(zid))}>Remove</button>
              </li>
                    `;
                    })
  }
                </ul>
              </div>
              </div>
            </details>
          `;})}
        </div>
        <button @click=${this._addZoneGroup} style="margin-top: 0.5em;">Add group</button>
        </div>
      </details>

      <!-- DISPLAY & STYLE (Optional) -->
      <details>
        <summary><h3 style="display: inline;">Display & Style (Optional)</h3></summary>
        <div style="margin-left: 1em;">

          <!-- Show Title & Show Avatars -->
          <div style="margin-bottom: 1em;">
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
              style="margin-left: 1em; width: 200px;"
            />
          </div>
          <div style="margin-bottom: 1em;">
            <label>
              <input
                type="checkbox"
                .checked=${this._config.show_avatars === true}
                @change=${this._toggleShowAvatars}
              />
              Show avatars
            </label>
          </div>

          <!-- Template -->
          <div style="margin-bottom: 1em;">
            <p style="font-size: 0.9em; color: #666; margin-bottom: 0.5em;">
              Customize the display format. Available placeholders:
              <strong>{name}</strong>, <strong>{verb}</strong>, <strong>{preposition}</strong>,
              <strong>{location}</strong>, <strong>{icon}</strong>
            </p>
            <p style="font-size: 0.9em; color: #666; margin-bottom: 1em;">
              Use <strong>{-placeholder}</strong> to omit preceding space if empty.
              Use <strong>&lt;right ...&gt;</strong> to float content to the right.
            </p>
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

          <!-- Style Customization -->
          <details style="margin-top: 1em;">
            <summary style="cursor: pointer;"><strong>Advanced Styling</strong></summary>
            <div style="margin-left: 1em; margin-top: 1em;">
              <p style="font-size: 0.9em; color: #666; margin-bottom: 1em;">
                Customize spacing, borders, and sizes. Leave empty to use defaults.
              </p>

              <div style="margin-bottom: 0.8em;">
                <label style="font-size: 0.9em; display: block; margin-bottom: 0.3em;">Container Margin:</label>
                <input type="text"
                  style="width: 100%; box-sizing: border-box;"
                  .value=${this._config.style?.container_margin || ''}
                  @input=${this._styleChanged('container_margin')}
                  placeholder="12px 0 (default)" />
                <p style="font-size: 0.85em; color: #888; margin: 0.2em 0 0 0;">Example: 12px 0, 1em 0.5em</p>
              </div>

              <div style="margin-bottom: 0.8em;">
                <label style="font-size: 0.9em; display: block; margin-bottom: 0.3em;">Container Padding:</label>
                <input type="text"
                  style="width: 100%; box-sizing: border-box;"
                  .value=${this._config.style?.container_padding || ''}
                  @input=${this._styleChanged('container_padding')}
                  placeholder="8px (default)" />
              </div>

              <div style="margin-bottom: 0.8em;">
                <label style="font-size: 0.9em; display: block; margin-bottom: 0.3em;">Container Gap:</label>
                <input type="text"
                  style="width: 100%; box-sizing: border-box;"
                  .value=${this._config.style?.container_gap || ''}
                  @input=${this._styleChanged('container_gap')}
                  placeholder="12px (default)" />
                <p style="font-size: 0.85em; color: #888; margin: 0.2em 0 0 0;">Space between avatar and content</p>
              </div>

              <div style="margin-bottom: 0.8em;">
                <label style="font-size: 0.9em; display: block; margin-bottom: 0.3em;">Border Width:</label>
                <input type="text"
                  style="width: 100%; box-sizing: border-box;"
                  .value=${this._config.style?.border_width || ''}
                  @input=${this._styleChanged('border_width')}
                  placeholder="3px (default)" />
              </div>

              <div style="margin-bottom: 0.8em;">
                <label style="font-size: 0.9em; display: block; margin-bottom: 0.3em;">Border Style:</label>
                <select
                  style="width: 100%; box-sizing: border-box;"
                  .value=${this._config.style?.border_style || ''}
                  @change=${this._styleChanged('border_style')}>
                  <option value="">Default (solid)</option>
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                  <option value="double">Double</option>
                  <option value="none">None</option>
                </select>
              </div>

              <div style="margin-bottom: 0.8em;">
                <label style="font-size: 0.9em; display: block; margin-bottom: 0.3em;">Border Color:</label>
                <input type="text"
                  style="width: 100%; box-sizing: border-box;"
                  .value=${this._config.style?.border_color || ''}
                  @input=${this._styleChanged('border_color')}
                  placeholder="var(--primary-color) (default)" />
                <p style="font-size: 0.85em; color: #888; margin: 0.2em 0 0 0;">Example: #1976d2, rgb(25, 118, 210), var(--primary-color)</p>
              </div>

              <div style="margin-bottom: 0.8em;">
                <label style="font-size: 0.9em; display: block; margin-bottom: 0.3em;">Avatar Size:</label>
                <input type="text"
                  style="width: 100%; box-sizing: border-box;"
                  .value=${this._config.style?.avatar_size || ''}
                  @input=${this._styleChanged('avatar_size')}
                  placeholder="38px (default)" />
              </div>

              <div style="margin-bottom: 0.8em;">
                <label style="font-size: 0.9em; display: block; margin-bottom: 0.3em;">Location Font Size:</label>
                <input type="text"
                  style="width: 100%; box-sizing: border-box;"
                  .value=${this._config.style?.location_font_size || ''}
                  @input=${this._styleChanged('location_font_size')}
                  placeholder="inherit (default)" />
              </div>

              <div style="margin-bottom: 0.8em;">
                <label style="font-size: 0.9em; display: block; margin-bottom: 0.3em;">Activity Font Size:</label>
                <input type="text"
                  style="width: 100%; box-sizing: border-box;"
                  .value=${this._config.style?.activity_font_size || ''}
                  @input=${this._styleChanged('activity_font_size')}
                  placeholder="inherit (default)" />
              </div>

              <div style="margin-bottom: 0.8em;">
                <label style="font-size: 0.9em; display: block; margin-bottom: 0.3em;">Location Icon Size:</label>
                <input type="text"
                  style="width: 100%; box-sizing: border-box;"
                  .value=${this._config.style?.location_icon_size || ''}
                  @input=${this._styleChanged('location_icon_size')}
                  placeholder="20px (default)" />
              </div>

              <div style="margin-bottom: 0.8em;">
                <label style="font-size: 0.9em; display: block; margin-bottom: 0.3em;">Location Icon Color:</label>
                <input type="text"
                  style="width: 100%; box-sizing: border-box;"
                  .value=${this._config.style?.location_icon_color || ''}
                  @input=${this._styleChanged('location_icon_color')}
                  placeholder="var(--primary-color) (default)" />
              </div>

              <div style="margin-bottom: 0.8em;">
                <label style="font-size: 0.9em; display: block; margin-bottom: 0.3em;">Activity Icon Size:</label>
                <input type="text"
                  style="width: 100%; box-sizing: border-box;"
                  .value=${this._config.style?.activity_icon_size || ''}
                  @input=${this._styleChanged('activity_icon_size')}
                  placeholder="20px (default)" />
              </div>
            </div>
          </details>

        </div>
      </details>

        </div>
      </div>

      <!-- Global datalists for autocomplete -->
      <datalist id="entity-suggestions">
        ${Object.keys(this.hass?.states || {}).map(entityId => html`
          <option value="${entityId}">${this.hass.states[entityId]?.attributes?.friendly_name || entityId}</option>
        `)}
      </datalist>

      <datalist id="icon-suggestions-enhanced">
        ${this.usedIcons.map(icon => html`<option value="${icon}">`)}
        <option value="mdi:account">
        <option value="mdi:home">
        <option value="mdi:office-building">
        <option value="mdi:briefcase">
        <option value="mdi:gamepad">
        <option value="mdi:power-sleep">
        <option value="mdi:bike">
        <option value="mdi:car">
        <option value="mdi:walk">
        <option value="mdi:run">
        <option value="mdi:map-marker">
        <option value="mdi:school">
        <option value="mdi:shopping">
        <option value="mdi:hospital">
        <option value="mdi:food">
        <option value="mdi:coffee">
        <option value="mdi:dumbbell">
        <option value="mdi:airplane">
        <option value="mdi:phone">
        <option value="mdi:laptop">
        <option value="mdi:television">
        <option value="mdi:briefcase-clock">
        <option value="mdi:desktop-classic">
      </datalist>

      <datalist id="activity-condition-suggestions">
        <option value="random">
        <option value="who">
        <option value="where">
        <option value="user">
        <option value="when">
        <option value="is_workday">
        <option value="is_work_hours">
        <option value="is_night">
        <option value="is_morning">
        <option value="is_afternoon">
        <option value="is_evening">
        <option value="day">
        ${this._config.persons.flatMap(person =>
          person.namedSensors ? Object.keys(person.namedSensors).map(sensorName => html`
            <option value="${sensorName}">
          `) : []
        )}
      </datalist>
  `;
}

  _toggleShowTitle(e: Event) {
    const checked = (e.target as HTMLInputElement).checked;
    this._config = { ...this._config, show_title: checked };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _toggleShowAvatars(e: Event) {
    const checked = (e.target as HTMLInputElement).checked;
    this._config = { ...this._config, show_avatars: checked };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _titleChanged(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    this._config = { ...this._config, title: value };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _defaultActivityChanged(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    this._config = { ...this._config, default_activity: value };
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
    const activities = [...(this._config.activities ?? []), { activity: '', conditions: {}, show_preposition: false }];
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

  _moveActivityUp(idx: number) {
    if (idx === 0) return;
    const activities = [...(this._config.activities ?? [])];
    // Swap with previous
    [activities[idx - 1], activities[idx]] = [activities[idx], activities[idx - 1]];
    this._config = { ...this._config, activities };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _moveActivityDown(idx: number) {
    const activities = [...(this._config.activities ?? [])];
    if (idx >= activities.length - 1) return;
    // Swap with next
    [activities[idx], activities[idx + 1]] = [activities[idx + 1], activities[idx]];
    this._config = { ...this._config, activities };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _activityChanged(idx: number, e: Event) {
    const value = (e.target as HTMLInputElement).value;
    const activities = [...(this._config.activities ?? [])];
    activities[idx] = { ...activities[idx], activity: value };
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

  _activityPrepositionChanged(idx: number, e: Event) {
    const value = (e.target as HTMLInputElement).value;
    const activities = [...(this._config.activities ?? [])];
    activities[idx] = { ...activities[idx], preposition: value || undefined };
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
    const activities = [...(this._config.activities ?? [])];
    const conditions = { ...(activities[idx].conditions || {}) };

    // Find a unique key like "condition1", "condition2", etc.
    let counter = 1;
    while (conditions[`condition${counter}`]) {
      counter++;
    }

    conditions[`condition${counter}`] = '';
    activities[idx] = { ...activities[idx], conditions };
    this._config = { ...this._config, activities };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _updateActivityConditionKey(activityIdx: number, oldKey: string, newKey: string) {
    if (!newKey.trim() || newKey === oldKey) return;

    const activities = [...(this._config.activities ?? [])];
    const conditions = { ...(activities[activityIdx].conditions || {}) };

    // Check if new key already exists
    if (conditions[newKey.trim()] && newKey.trim() !== oldKey) {
      alert('A condition with this key already exists');
      return;
    }

    // Move condition to new key
    const value = conditions[oldKey];
    delete conditions[oldKey];
    conditions[newKey.trim()] = value;

    activities[activityIdx] = { ...activities[activityIdx], conditions };
    this._config = { ...this._config, activities };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _updateActivityConditionValue(activityIdx: number, key: string, valueStr: string) {
    const activities = [...(this._config.activities ?? [])];
    const conditions = { ...(activities[activityIdx].conditions || {}) };

    // Parse value - check if comma-separated
    const value = valueStr.includes(',')
      ? valueStr.split(',').map(v => v.trim()).filter(v => v)
      : valueStr.trim();

    conditions[key] = value;
    activities[activityIdx] = { ...activities[activityIdx], conditions };
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
    const groups: ZoneGroup[] = [...(this._config.zone_groups ?? [])];

    // Cycle through three states: undefined (inherit) -> true -> false -> undefined
    const currentValue = groups[gidx].show_preposition;
    let newValue: boolean | undefined;

    if (currentValue === undefined) {
      newValue = true;
    } else if (currentValue === true) {
      newValue = false;
    } else {
      newValue = undefined;
    }

    groups[gidx] = { ...groups[gidx], show_preposition: newValue };
    this._config = { ...this._config, zone_groups: groups };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _zoneGroupOverrideLocationChanged(gidx: number, e: Event) {
    const checked = (e.target as HTMLInputElement).checked;
    const groups: ZoneGroup[] = [...(this._config.zone_groups ?? [])];
    groups[gidx] = { ...groups[gidx], override_location: checked };
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

  _addNamedSensor(personIdx: number) {
    const persons = [...this._config.persons];
    const namedSensors: PersonSensors = persons[personIdx].namedSensors || {};

    // Find a unique name like "sensor1", "sensor2", etc.
    let counter = 1;
    while (namedSensors[`sensor${counter}`]) {
      counter++;
    }

    namedSensors[`sensor${counter}`] = { entity_id: '' };
    persons[personIdx] = { ...persons[personIdx], namedSensors };
    this._config = { ...this._config, persons };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _updateNamedSensorName(personIdx: number, oldName: string, newName: string) {
    if (!newName.trim() || newName === oldName) return;

    const persons = [...this._config.persons];
    const namedSensors: PersonSensors = persons[personIdx].namedSensors || {};

    // Check if new name already exists
    if (namedSensors[newName.trim()] && newName.trim() !== oldName) {
      alert('A sensor with this name already exists');
      return;
    }

    // Move sensor to new name
    const sensor = namedSensors[oldName];
    delete namedSensors[oldName];
    namedSensors[newName.trim()] = sensor;

    persons[personIdx] = { ...persons[personIdx], namedSensors };
    this._config = { ...this._config, persons };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _updateNamedSensorEntity(personIdx: number, sensorName: string, value: string) {
    const persons = [...this._config.persons];
    const namedSensors: PersonSensors = persons[personIdx].namedSensors || {};

    // Parse entity_id - support comma-separated for multiple
    const entityIds = value.includes(',')
      ? value.split(',').map(id => id.trim()).filter(id => id)
      : value.trim();

    namedSensors[sensorName] = { entity_id: entityIds };
    persons[personIdx] = { ...persons[personIdx], namedSensors };
    this._config = { ...this._config, persons };
    this.requestUpdate();
    this._emitConfigChanged();
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
    const persons = [...this._config.persons];
    const hideIf = { ...(persons[personIdx].hideIf || {}) };

    // Find a unique key like "condition1", "condition2", etc.
    let counter = 1;
    while (hideIf[`condition${counter}`]) {
      counter++;
    }

    hideIf[`condition${counter}`] = '';
    persons[personIdx] = { ...persons[personIdx], hideIf };
    this._config = { ...this._config, persons };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _updateHideIfConditionKey(personIdx: number, oldKey: string, newKey: string) {
    if (!newKey.trim() || newKey === oldKey) return;

    const persons = [...this._config.persons];
    const hideIf = { ...(persons[personIdx].hideIf || {}) };

    // Check if new key already exists
    if (hideIf[newKey.trim()] && newKey.trim() !== oldKey) {
      alert('A condition with this key already exists');
      return;
    }

    // Move condition to new key
    const value = hideIf[oldKey];
    delete hideIf[oldKey];
    hideIf[newKey.trim()] = value;

    persons[personIdx] = { ...persons[personIdx], hideIf };
    this._config = { ...this._config, persons };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _updateHideIfConditionValue(personIdx: number, key: string, valueStr: string) {
    const persons = [...this._config.persons];
    const hideIf = { ...(persons[personIdx].hideIf || {}) };

    // Parse value - check if comma-separated
    const value = valueStr.includes(',')
      ? valueStr.split(',').map(v => v.trim()).filter(v => v)
      : valueStr.trim();

    hideIf[key] = value;
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

  _styleChanged(key: string) {
    return (e: Event) => {
      const value = (e.target as HTMLInputElement | HTMLSelectElement).value.trim();
      const style = { ...this._config.style };
      if (value === '') {
        delete style[key as keyof typeof style];
      } else {
        style[key as keyof typeof style] = value;
      }
      // Remove style object if empty
      if (Object.keys(style).length === 0) {
        const { style: _, ...rest } = this._config;
        this._config = rest;
      } else {
        this._config = { ...this._config, style };
      }
      this.requestUpdate();
      this._emitConfigChanged();
    };
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

    /* Tristate checkbox styling */
    .tristate-checkbox {
      appearance: none;
      -webkit-appearance: none;
      width: 18px;
      height: 18px;
      border: 2px solid #ccc;
      border-radius: 3px;
      cursor: pointer;
      position: relative;
      vertical-align: middle;
      margin-right: 8px;
    }

    /* Indeterminate state (undefined) - gray dash */
    .tristate-checkbox:indeterminate {
      background-color: #888;
      border-color: #888;
    }
    .tristate-checkbox:indeterminate::after {
      content: '';
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 10px;
      height: 2px;
      background-color: white;
    }

    /* Checked state (true) - blue checkmark */
    .tristate-checkbox:checked {
      background-color: var(--primary-color, #0984e3);
      border-color: var(--primary-color, #0984e3);
    }
    .tristate-checkbox:checked::after {
      content: '✓';
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      color: white;
      font-size: 14px;
      font-weight: bold;
      line-height: 1;
    }

    /* Unchecked state (false) - red X */
    .tristate-checkbox:not(:checked):not(:indeterminate) {
      background-color: #d63031;
      border-color: #d63031;
    }
    .tristate-checkbox:not(:checked):not(:indeterminate)::after {
      content: '✕';
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      color: white;
      font-size: 14px;
      font-weight: bold;
      line-height: 1;
    }
  `;
}

customElements.define('whereabouts-card-editor', WhereaboutsCardEditor);
