import { LitElement, html, css } from 'lit';
import { property, state } from 'lit/decorators.js';
import { WhereaboutsCardConfig, ZoneGroup } from './whereabouts-card';
import type { PersonSensors } from './types';

export class WhereaboutsCardEditor extends LitElement {
  @property({ attribute: false }) public hass: any;
  @state() private _config: WhereaboutsCardConfig = { persons: [], zone_groups: [] };
  @state() private _showUsedZones: { [groupIndex: number]: boolean } = {};
  @state() private _zoneFilter: { [groupIndex: number]: string } = {};
  @state() private _addSensorMode: { [personIndex: number]: 'dropdown' | 'text' } = {};

  get availablePersons(): string[] {
    if (!this.hass) return [];
    return Object.keys(this.hass.states)
      .filter(eid => eid.startsWith('person.'))
      .filter(eid => !this._config.persons?.some(p => p.entity_id === eid));
  }

  getAvailableSensorNames(personIdx: number): string[] {
    const currentPerson = this._config.persons[personIdx];
    const currentSensors = new Set(Object.keys(currentPerson?.namedSensors || {}));
    const allSensorNames = new Set<string>();

    // Collect sensor names from all other persons
    this._config.persons.forEach((person, idx) => {
      if (idx !== personIdx && person.namedSensors) {
        Object.keys(person.namedSensors).forEach(name => {
          if (!currentSensors.has(name)) {
            allSensorNames.add(name);
          }
        });
      }
    });

    return Array.from(allSensorNames).sort();
  }

  getAvailableAttributes(entityId: string | string[]): Array<{ key: string, value: any }> {
    if (!this.hass) return [];

    // If array, use first entity
    const firstEntityId = Array.isArray(entityId) ? entityId[0] : entityId;
    if (!firstEntityId) return [];

    const entity = this.hass.states[firstEntityId];
    if (!entity || !entity.attributes) return [];

    // Extract all attribute keys with their current values
    return Object.entries(entity.attributes)
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => a.key.localeCompare(b.key));
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

  get uniqueNamedSensors(): string[] {
    const sensorNames = new Set<string>();
    // Collect unique sensor names from all persons
    for (const person of this._config.persons || []) {
      if (person.namedSensors) {
        Object.keys(person.namedSensors).forEach(name => sensorNames.add(name));
      }
    }
    return Array.from(sensorNames).sort();
  }

  get trackedEntities(): string[] {
    const tracked = new Set<string>();

    // Track all person entities
    for (const person of this._config.persons) {
      tracked.add(person.entity_id);

      // Track all named sensors for this person
      if (person.namedSensors) {
        for (const sensor of Object.values(person.namedSensors)) {
          if (sensor && sensor.entity_id) {
            if (Array.isArray(sensor.entity_id)) {
              sensor.entity_id.forEach(id => tracked.add(id));
            } else {
              tracked.add(sensor.entity_id);
            }
          }
        }
      }
    }

    // Track all zone entities
    if (this.hass) {
      Object.keys(this.hass.states).forEach(entityId => {
        if (entityId.startsWith('zone.')) {
          tracked.add(entityId);
        }
      });
    }

    return Array.from(tracked).sort();
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

  getZonesForGroup(groupIndex: number): { zone: string; isUsed: boolean }[] {
    if (!this.hass) return [];

    // Get all zones
    let allZones = Object.keys(this.hass.states).filter(eid => eid.startsWith('zone.'));
    const homeZonePresent = allZones.includes('zone.home');
    if (!homeZonePresent) {
      allZones = ['home', ...allZones];
    }

    // Get zones used in OTHER groups
    const currentGroup = (this._config.zone_groups ?? [])[groupIndex];
    const zonesInCurrentGroup = new Set(currentGroup?.zones || []);
    const zonesInOtherGroups = new Set(
      (this._config.zone_groups ?? [])
        .filter((_, idx) => idx !== groupIndex)
        .flatMap((g: ZoneGroup) => g.zones)
    );

    // Get filter text for this group
    const filterText = (this._zoneFilter[groupIndex] || '').toLowerCase().trim();
    const showUsed = this._showUsedZones[groupIndex] || filterText.length > 0;

    // Filter zones
    let zones = allZones
      .filter(zid => !zonesInCurrentGroup.has(zid)) // Exclude zones already in this group
      .filter(zid => {
        // If we have a filter, apply it
        if (filterText) {
          const zoneName = (this.hass.states[zid]?.attributes?.friendly_name || (zid === 'home' ? 'Home' : zid)).toLowerCase();
          return zoneName.includes(filterText) || zid.toLowerCase().includes(filterText);
        }
        // If no filter and not showing used zones, only show unused zones
        if (!showUsed) {
          return !zonesInOtherGroups.has(zid);
        }
        // Otherwise show all zones
        return true;
      });

    // Map to objects with usage info
    const zoneObjects = zones.map(zid => ({
      zone: zid,
      isUsed: zonesInOtherGroups.has(zid)
    }));

    // Sort: unused zones first, then used zones; alphabetically within each group
    return zoneObjects.sort((a, b) => {
      if (a.isUsed !== b.isUsed) {
        return a.isUsed ? 1 : -1; // Unused first
      }
      const aname = this.hass.states[a.zone]?.attributes?.friendly_name || (a.zone === 'home' ? 'Home' : a.zone);
      const bname = this.hass.states[b.zone]?.attributes?.friendly_name || (b.zone === 'home' ? 'Home' : b.zone);
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

  /**
   * Get the appropriate input type for a condition value field
   */
  getConditionValueInputType(key: string): 'select' | 'number' | 'text' {
    if (key === 'who' || key === 'when' || key === 'where') {
      return 'select';
    }
    if (key === 'random') {
      return 'number';
    }
    if (key === 'user') {
      return 'text'; // Users not available in frontend
    }

    // Check if it's a named sensor
    if (this.uniqueNamedSensors.includes(key)) {
      // Try to determine sensor type from first person that has this sensor
      for (const person of this._config.persons || []) {
        if (person.namedSensors?.[key]) {
          const entityIds = Array.isArray(person.namedSensors[key].entity_id)
            ? person.namedSensors[key].entity_id
            : [person.namedSensors[key].entity_id];

          const firstEntityId = entityIds[0];
          if (!firstEntityId) continue;

          const entity = this.hass?.states[firstEntityId];
          if (!entity) continue;

          const domain = firstEntityId.split('.')[0];

          // Binary sensors can use select with on/off
          if (domain === 'binary_sensor') {
            return 'select';
          }

          // Numeric sensors
          if (domain === 'sensor') {
            const state = entity.state;
            if (!isNaN(parseFloat(state)) && state !== 'unknown' && state !== 'unavailable') {
              return 'number';
            }
          }

          // Check if entity has a defined set of states (like input_select)
          if (domain === 'input_select' && entity.attributes?.options) {
            return 'select';
          }

          break;
        }
      }
    }

    return 'text';
  }

  /**
   * Get available options for select-type condition values
   */
  getConditionValueOptions(key: string): string[] {
    if (key === 'who') {
      return (this._config.persons || []).map(p => p.entity_id);
    }

    if (key === 'when') {
      return ['night', 'morning', 'afternoon', 'evening', 'weekday', 'weekend', 'afterschool'];
    }

    if (key === 'where') {
      // Get all zones
      const zones = this.hass ? Object.keys(this.hass.states).filter(id => id.startsWith('zone.')) : [];

      // Get zone group names
      const zoneGroupNames = (this._config.zone_groups || [])
        .filter(g => g.name)
        .map(g => g.name as string);

      return [...zones, ...zoneGroupNames];
    }

    // Check if it's a named sensor
    if (this.uniqueNamedSensors.includes(key)) {
      // Try to get possible values from sensor
      for (const person of this._config.persons || []) {
        if (person.namedSensors?.[key]) {
          const entityIds = Array.isArray(person.namedSensors[key].entity_id)
            ? person.namedSensors[key].entity_id
            : [person.namedSensors[key].entity_id];

          const firstEntityId = entityIds[0];
          if (!firstEntityId) continue;

          const entity = this.hass?.states[firstEntityId];
          if (!entity) continue;

          const domain = firstEntityId.split('.')[0];

          // Binary sensors have on/off
          if (domain === 'binary_sensor') {
            return ['on', 'off'];
          }

          // Input select has defined options
          if (domain === 'input_select' && entity.attributes?.options) {
            return entity.attributes.options;
          }

          break;
        }
      }
    }

    return [];
  }

  validateConditionValue(key: string, value: string | string[]): { valid: boolean; error?: string } {
    const val = Array.isArray(value) ? value.join(', ') : value;

    // Strip operator prefix before validation
    const inputType = this.getConditionValueInputType(key);
    const parsed = this.parseConditionOperator(val, inputType);
    const valueWithoutOperator = parsed.value;

    if (key === 'random') {
      return this.validateRandomValue(valueWithoutOperator);
    } else if (key === 'when') {
      return this.validateWhenValue(valueWithoutOperator);
    } else if (key === 'who') {
      return this.validateWhoValue(valueWithoutOperator);
    } else if (key === 'where') {
      return this.validateWhereValue(valueWithoutOperator);
    }

    return { valid: true };
  }

  validateRandomValue(value: string): { valid: boolean; error?: string } {
    if (!value.trim()) return { valid: false, error: 'Value required' };

    const trimmed = value.trim();

    // Check percentage format with % suffix
    if (trimmed.endsWith('%')) {
      const num = parseFloat(trimmed.slice(0, -1));
      if (isNaN(num) || num < 0 || num > 100) {
        return { valid: false, error: 'Must be 0-100%' };
      }
      return { valid: true };
    }

    // Accept both 0-100 (percentage) and 0-1 (decimal) formats without % suffix
    const num = parseFloat(trimmed);
    if (isNaN(num) || num < 0 || num > 100) {
      return { valid: false, error: 'Must be 0-100 or 0-1' };
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
      const matchesName = this._config.persons?.some(p =>
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

  /**
   * Parse operator from condition value (e.g., "!value" -> {operator: "!", value: "value"})
   */
  parseConditionOperator(value: string, inputType: 'select' | 'number' | 'text'): { operator: string; value: string } {
    const valueStr = value.trim();

    if (inputType === 'number') {
      // Check if value contains comma (indicates oneOf / multiple values)
      if (valueStr.includes(',')) {
        return { operator: 'oneOf', value: valueStr };
      }
      // Check for numeric operators: >=, <=, !=, <>, >, <, =
      const match = valueStr.match(/^(>=|<=|!=|<>|>|<|=)(.*)$/);
      if (match) {
        return { operator: match[1], value: match[2].trim() };
      }
      return { operator: '=', value: valueStr };
    }

    // For select and text: check for ! prefix
    if (valueStr.startsWith('!')) {
      return { operator: '!', value: valueStr.substring(1) };
    }

    // Check if value contains comma (indicates oneOf / multiple values)
    if (valueStr.includes(',')) {
      return { operator: 'oneOf', value: valueStr };
    }

    return { operator: '=', value: valueStr };
  }

  /**
   * Render the appropriate input for a condition value based on the key
   */
  renderConditionValueInput(key: string, value: string | string[], onChangeCallback: (newValue: string) => void, validation: { valid: boolean; error?: string }) {
    const inputType = this.getConditionValueInputType(key);
    const valueStr = Array.isArray(value) ? value.join(', ') : value;
    const parsed = this.parseConditionOperator(valueStr, inputType);

    if (inputType === 'select') {
      const options = this.getConditionValueOptions(key);
      return html`
        <select
          .value="${parsed.operator}"
          style="width: 70px; ${!validation.valid ? 'border-color: #ff9800;' : ''}"
          @change=${(e: Event) => {
            const operator = (e.target as HTMLSelectElement).value;
            let newValue = parsed.value;
            if (operator === '!') {
              newValue = `!${parsed.value}`;
            } else if (operator === 'oneOf') {
              // Keep comma-separated value as-is
              newValue = parsed.value;
            } else {
              // operator === '=' (equals)
              newValue = parsed.value;
            }
            onChangeCallback(newValue);
          }}
        >
          <option value="=">=</option>
          <option value="!">≠ (not)</option>
          <option value="oneOf">oneOf</option>
        </select>
        ${parsed.operator === 'oneOf'
          ? html`
              <input
                type="text"
                .value="${parsed.value}"
                placeholder="value1, value2, value3"
                style="flex: 1; ${!validation.valid ? 'border-color: #ff9800;' : ''}"
                @blur=${(e: Event) => {
                  const textValue = (e.target as HTMLInputElement).value;
                  onChangeCallback(textValue);
                }}
              />
            `
          : html`
              <select
                .value="${parsed.value}"
                style="flex: 1; ${!validation.valid ? 'border-color: #ff9800;' : ''}"
                @change=${(e: Event) => {
                  const selectValue = (e.target as HTMLSelectElement).value;
                  const newValue = parsed.operator === '!' ? `!${selectValue}` : selectValue;
                  onChangeCallback(newValue);
                }}
              >
                <option value="">Select...</option>
                ${options.map(option => html`
                  <option value="${option}">
                    ${key === 'who'
                      ? (this._config.persons?.find(p => p.entity_id === option)?.name || this.hass?.states[option]?.attributes?.friendly_name || option)
                      : option}
                  </option>
                `)}
              </select>
            `}
      `;
    }

    if (inputType === 'number') {
      return html`
        <select
          .value="${parsed.operator}"
          style="width: 70px; ${!validation.valid ? 'border-color: #ff9800;' : ''}"
          @change=${(e: Event) => {
            const operator = (e.target as HTMLSelectElement).value;
            let newValue = parsed.value;
            if (operator === 'oneOf') {
              // Keep comma-separated value as-is
              newValue = parsed.value;
            } else if (operator === '=') {
              newValue = parsed.value;
            } else {
              newValue = `${operator}${parsed.value}`;
            }
            onChangeCallback(newValue);
          }}
        >
          <option value="=">=</option>
          <option value="!=">≠</option>
          <option value=">">></option>
          <option value="<"><</option>
          <option value=">=">≥</option>
          <option value="<=">≤</option>
          <option value="oneOf">oneOf</option>
        </select>
        ${parsed.operator === 'oneOf'
          ? html`
              <input
                type="text"
                .value="${parsed.value}"
                placeholder="10, 20, 30"
                style="flex: 1; ${!validation.valid ? 'border-color: #ff9800;' : ''}"
                @blur=${(e: Event) => {
                  const textValue = (e.target as HTMLInputElement).value;
                  onChangeCallback(textValue);
                }}
              />
            `
          : html`
              <input
                type="number"
                .value="${parsed.value}"
                placeholder="${key === 'random' ? '0-100' : 'value'}"
                min="${key === 'random' ? '0' : ''}"
                max="${key === 'random' ? '100' : ''}"
                step="${key === 'random' ? '1' : 'any'}"
                style="flex: 1; ${!validation.valid ? 'border-color: #ff9800;' : ''}"
                @blur=${(e: Event) => {
                  const numValue = (e.target as HTMLInputElement).value;
                  const newValue = parsed.operator === '=' ? numValue : `${parsed.operator}${numValue}`;
                  onChangeCallback(newValue);
                }}
              />
            `}
      `;
    }

    // Default: text input with operator selection
    return html`
      <select
        .value="${parsed.operator}"
        style="width: 80px; ${!validation.valid ? 'border-color: #ff9800;' : ''}"
        @change=${(e: Event) => {
          const operator = (e.target as HTMLSelectElement).value;
          let newValue = parsed.value;
          if (operator === '!') {
            newValue = `!${parsed.value}`;
          } else if (operator === 'oneOf') {
            // Keep comma-separated value as-is
            newValue = parsed.value;
          } else {
            // operator === '=' (equals)
            newValue = parsed.value;
          }
          onChangeCallback(newValue);
        }}
      >
        <option value="=">=</option>
        <option value="!">≠ (not)</option>
        <option value="oneOf">oneOf</option>
      </select>
      <input
        type="text"
        .value="${parsed.value}"
        placeholder="${parsed.operator === 'oneOf' ? 'value1, value2, value3' : 'value'}"
        style="flex: 1; ${!validation.valid ? 'border-color: #ff9800;' : ''}"
        @blur=${(e: Event) => {
          const textValue = (e.target as HTMLInputElement).value;
          let newValue = textValue;
          if (parsed.operator === '!') {
            newValue = `!${textValue}`;
          } else if (parsed.operator === 'oneOf') {
            // Keep comma-separated value as-is
            newValue = textValue;
          }
          onChangeCallback(newValue);
        }}
      />
    `;
  }

  setConfig(config: WhereaboutsCardConfig) {
    this._config = { ...config };

    // Migrate zone groups
    this._config.zone_groups = (this._config.zone_groups || []).map((zg) => ({
      ...zg,
      show_preposition: zg.show_preposition !== false
    })) as ZoneGroup[];

    // Migrate activities: convert old '-' location_override to show_location: false
    this._config.activities = (this._config.activities || []).map((activity) => {
      if (activity.location_override === '-') {
        return {
          ...activity,
          location_override: undefined,
          show_location: false
        };
      }
      return activity;
    });

    this.requestUpdate();
  }

  updated(changedProperties: Map<string, any>) {
    super.updated(changedProperties);

    // Update all card-level activity tristate checkboxes (without zone-group-idx)
    this.shadowRoot?.querySelectorAll('.tristate-checkbox[data-activity-idx]:not([data-zone-group-idx])').forEach((checkbox) => {
      const cb = checkbox as HTMLInputElement;
      const idx = parseInt(cb.getAttribute('data-activity-idx') || '-1');
      const field = cb.getAttribute('data-tristate-field');

      if (idx >= 0 && field && this._config.activities?.[idx]) {
        const activity = this._config.activities[idx];
        const value = field === 'show_location' ? activity.show_location : activity.show_preposition;

        if (value === undefined) {
          cb.checked = false;
          cb.indeterminate = true;
        } else if (value === true) {
          cb.indeterminate = false;
          cb.checked = true;
        } else {
          cb.indeterminate = false;
          cb.checked = false;
        }
      }
    });

    // Update all zone group activity tristate checkboxes
    this.shadowRoot?.querySelectorAll('.tristate-checkbox[data-zone-group-idx][data-activity-idx]').forEach((checkbox) => {
      const cb = checkbox as HTMLInputElement;
      const gidx = parseInt(cb.getAttribute('data-zone-group-idx') || '-1');
      const aidx = parseInt(cb.getAttribute('data-activity-idx') || '-1');
      const field = cb.getAttribute('data-tristate-field');

      if (gidx >= 0 && aidx >= 0 && field && this._config.zone_groups?.[gidx]?.activities?.[aidx]) {
        const activity = this._config.zone_groups[gidx].activities![aidx];
        const value = field === 'show_location' ? activity.show_location : activity.show_preposition;

        if (value === undefined) {
          cb.checked = false;
          cb.indeterminate = true;
        } else if (value === true) {
          cb.indeterminate = false;
          cb.checked = true;
        } else {
          cb.indeterminate = false;
          cb.checked = false;
        }
      }
    });

    // Update all person tristate checkboxes
    this.shadowRoot?.querySelectorAll('.tristate-checkbox[data-person-idx]').forEach((checkbox) => {
      const cb = checkbox as HTMLInputElement;
      const idx = parseInt(cb.getAttribute('data-person-idx') || '-1');
      const field = cb.getAttribute('data-tristate-field');

      if (idx >= 0 && field && this._config.persons?.[idx]) {
        const person = this._config.persons[idx];
        const value = person.show_avatar;

        if (value === undefined) {
          cb.checked = false;
          cb.indeterminate = true;
        } else if (value === true) {
          cb.indeterminate = false;
          cb.checked = true;
        } else {
          cb.indeterminate = false;
          cb.checked = false;
        }
      }
    });
  }

  private _parseSpacing(value: string | undefined): [string, string, string, string] {
    if (!value) return ['', '', '', ''];
    const parts = value.trim().split(/\s+/);

    if (parts.length === 1) {
      // Single value: all sides
      return [parts[0], parts[0], parts[0], parts[0]];
    } else if (parts.length === 2) {
      // Two values: top/bottom left/right
      return [parts[0], parts[1], parts[0], parts[1]];
    } else if (parts.length === 3) {
      // Three values: top left/right bottom
      return [parts[0], parts[1], parts[2], parts[1]];
    } else {
      // Four values: top right bottom left
      return [parts[0], parts[1], parts[2], parts[3]];
    }
  }

  private _buildSpacing(top: string, right: string, bottom: string, left: string): string {
    // Normalize empty strings to '0'
    const t = top.trim() || '0';
    const r = right.trim() || '0';
    const b = bottom.trim() || '0';
    const l = left.trim() || '0';

    // If all are empty or zero, return empty
    if (!top && !right && !bottom && !left) return '';

    // Optimize output
    if (t === r && r === b && b === l) {
      // All same
      return t;
    } else if (t === b && r === l) {
      // top/bottom same, left/right same
      return `${t} ${r}`;
    } else if (r === l) {
      // left/right same
      return `${t} ${r} ${b}`;
    } else {
      // All different
      return `${t} ${r} ${b} ${l}`;
    }
  }

  private _renderSpacingInputs(key: string, value: string | undefined, placeholder: string, content: any) {
    const [top, right, bottom, left] = this._parseSpacing(value);

    const updateSpacing = (side: 'top' | 'right' | 'bottom' | 'left') => (e: Event) => {
      const newValue = (e.target as HTMLInputElement).value;
      const [t, r, b, l] = this._parseSpacing(value);

      let updatedTop = t, updatedRight = r, updatedBottom = b, updatedLeft = l;
      if (side === 'top') updatedTop = newValue;
      else if (side === 'right') updatedRight = newValue;
      else if (side === 'bottom') updatedBottom = newValue;
      else if (side === 'left') updatedLeft = newValue;

      const combined = this._buildSpacing(updatedTop, updatedRight, updatedBottom, updatedLeft);

      const style = { ...this._config.style };
      if (combined === '') {
        delete style[key as keyof typeof style];
      } else {
        style[key as keyof typeof style] = combined;
      }

      if (Object.keys(style).length === 0) {
        const { style: _, ...rest } = this._config;
        this._config = rest;
      } else {
        this._config = { ...this._config, style };
      }

      this.requestUpdate();
      this._emitConfigChanged();
    };

    const placeholderParts = placeholder.split(/\s+/);

    return html`
      <div class="spacing-grid">
        <div></div>
        <input type="text"
          class="spacing-input"
          .value=${top}
          @input=${updateSpacing('top')}
          placeholder=${placeholderParts[0]}
          title="Top" />
        <div></div>

        <input type="text"
          class="spacing-input"
          .value=${left}
          @input=${updateSpacing('left')}
          placeholder=${placeholderParts[1] || placeholderParts[0]}
          title="Left" />
        <div class="spacing-content">
          ${content}
        </div>
        <input type="text"
          class="spacing-input"
          .value=${right}
          @input=${updateSpacing('right')}
          placeholder=${placeholderParts[1] || placeholderParts[0]}
          title="Right" />

        <div></div>
        <input type="text"
          class="spacing-input"
          .value=${bottom}
          @input=${updateSpacing('bottom')}
          placeholder=${placeholderParts[0]}
          title="Bottom" />
        <div></div>
      </div>
    `;
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

      <!-- PERSONS SECTION -->
      <details ?open=${!this._config.persons || this._config.persons.length === 0}>
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
        ${(this._config.persons || []).map((person, idx) =>
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
              <div>
                <label>
                  <input
                    type="checkbox"
                    class="tristate-checkbox"
                    data-person-idx="${idx}"
                    data-tristate-field="show_avatar"
                    @click=${(e: Event) => this._personShowAvatarChanged(idx, e)}
                  />
                  Show avatar
                </label>
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
                            @input=${() => this.requestUpdate()}
                          />
                          ${(() => {
                            const availableAttrs = sensor.entity_id ? this.getAvailableAttributes(sensor.entity_id) : [];
                            const currentAttr = sensor.attribute || '';
                            const isArray = Array.isArray(sensor.entity_id);
                            const firstEntityId = isArray ? sensor.entity_id[0] : sensor.entity_id;

                            // Check if current attribute is in the list
                            const isCustomAttr = currentAttr && !availableAttrs.some(a => a.key === currentAttr);

                            const title = !sensor.entity_id
                              ? 'Set entity_id first'
                              : isArray
                                ? `Attributes from: ${firstEntityId}`
                                : 'Select attribute or use state';

                            return html`
                              <select
                                style="width: 150px;"
                                .value="${currentAttr}"
                                ?disabled="${!sensor.entity_id}"
                                title="${title}"
                                @change=${(e: Event) => {
                                  const value = (e.target as HTMLSelectElement).value;
                                  this._updateNamedSensorAttribute(idx, name, value);
                                }}
                              >
                                <option value="">(use state)</option>
                                ${availableAttrs.map(attr => html`
                                  <option value="${attr.key}">${attr.key}</option>
                                `)}
                                ${isCustomAttr ? html`
                                  <option value="${currentAttr}" selected>${currentAttr} (custom)</option>
                                ` : ''}
                              </select>
                            `;
                          })()}
                          <button class="icon-button" @click=${() => this._removeNamedSensor(idx, name)} title="Remove">🗑️</button>
                        </div>
                        ${sensor.entity_id ? html`
                          <div style="margin-left: 160px; font-size: 0.85em; color: #666; margin-bottom: 0.5em;">
                            ${this.getSensorFriendlyName(sensor.entity_id)}: <strong>${this.getSensorState(sensor.entity_id)}</strong>
                            ${sensor.attribute ? (() => {
                              const isArray = Array.isArray(sensor.entity_id);
                              const firstEntityId = isArray ? sensor.entity_id[0] : sensor.entity_id;
                              const entity = this.hass?.states[firstEntityId];
                              const attrValue = entity?.attributes?.[sensor.attribute];
                              return html`
                                <span style="color: #999;">
                                  → ${sensor.attribute}${isArray ? ' (from first)' : ''}: <strong style="color: #666;">${attrValue !== undefined ? JSON.stringify(attrValue) : 'undefined'}</strong>
                                </span>
                              `;
                            })() : ''}
                          </div>
                        ` : ''}
                      `)
                    : ''}
                </div>

                ${(() => {
                  const availableSensorNames = this.getAvailableSensorNames(idx);
                  const mode = this._addSensorMode[idx] || 'dropdown';

                  // If no available sensors or in text mode, show text input
                  if (availableSensorNames.length === 0 || mode === 'text') {
                    return html`
                      <div style="display: flex; gap: 0.5em; margin-top: 0.5em; align-items: center;">
                        <input
                          type="text"
                          id="new-sensor-name-${idx}"
                          placeholder="Enter sensor name..."
                          style="flex: 1;"
                          @keydown=${(e: KeyboardEvent) => {
                            if (e.key === 'Enter') {
                              this._addNamedSensorFromText(idx);
                            }
                          }}
                        />
                        <button @click=${() => this._addNamedSensorFromText(idx)}>Add</button>
                        ${availableSensorNames.length > 0 ? html`
                          <button @click=${() => {
                            this._addSensorMode = { ...this._addSensorMode, [idx]: 'dropdown' };
                            this.requestUpdate();
                          }}>Cancel</button>
                        ` : ''}
                      </div>
                    `;
                  }

                  // Show dropdown with available sensors
                  return html`
                    <div style="margin-top: 0.5em;">
                      <select
                        style="width: 100%;"
                        @change=${(e: Event) => {
                          const value = (e.target as HTMLSelectElement).value;
                          if (value === '__new__') {
                            this._addSensorMode = { ...this._addSensorMode, [idx]: 'text' };
                            this.requestUpdate();
                            // Focus the text input after render
                            setTimeout(() => {
                              const input = this.shadowRoot?.querySelector(`#new-sensor-name-${idx}`) as HTMLInputElement;
                              input?.focus();
                            }, 0);
                          } else if (value) {
                            this._addNamedSensorFromDropdown(idx, value);
                            (e.target as HTMLSelectElement).value = ''; // Reset dropdown
                          }
                        }}
                      >
                        <option value="">+ Add Sensor...</option>
                        ${availableSensorNames.map(name => html`
                          <option value="${name}">${name}</option>
                        `)}
                        <option value="__new__">Add new...</option>
                      </select>
                    </div>
                  `;
                })()}
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
                          <select
                            .value="${key}"
                            style="width: 120px;"
                            @change=${(e: Event) => this._updateHideIfConditionKey(idx, key, (e.target as HTMLSelectElement).value)}
                          >
                            <option value="">Select...</option>
                            <option value="who">who</option>
                            <option value="where">where</option>
                            <option value="when">when</option>
                            <option value="user">user</option>
                            <option value="random">random</option>
                            ${this.uniqueNamedSensors.map(sensorName => html`
                              <option value="${sensorName}">${sensorName}</option>
                            `)}
                          </select>
                          ${this.renderConditionValueInput(key, value, (newValue) => this._updateHideIfConditionValue(idx, key, newValue), validation)}
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
            <label>Default activity:</label>
            <input
              type="text"
              .value=${this._config.default_activity ?? this._config.default_verb ?? 'is'}
              @input=${this._defaultActivityChanged}
              placeholder="is"
            />
            <p style="font-size: 0.85em; color: #888; margin: 0.3em 0 0.8em 0;">
              Fallback activity when no specific activity matches
            </p>
          </div>
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
                  <label>
                    <input
                      type="checkbox"
                      class="tristate-checkbox"
                      data-activity-idx="${idx}"
                      data-tristate-field="show_location"
                      @click=${(e: Event) => this._activityShowLocationChanged(idx, e)}
                    />
                    Show location
                  </label>
                </div>
                ${activity.show_location !== false ? html`
                <div style="margin-left: 1.5em; margin-top: 0.5em; display: flex; align-items: flex-start; gap: 8px;">
                  <label style="flex-shrink: 0;">Location (override):</label>
                  <input
                    type="text"
                    .value=${activity.location_override || ''}
                    @input=${(e: Event) => this._activityLocationOverrideChanged(idx, e)}
                    placeholder="(optional, custom text)"
                    style="flex: 1; min-width: 150px; box-sizing: border-box;"
                  />
                </div>
                ` : ''}
                <div>
                  <label>
                    <input
                      type="checkbox"
                      class="tristate-checkbox"
                      data-activity-idx="${idx}"
                      data-tristate-field="show_preposition"
                      @click=${(e: Event) => this._activityShowPrepositionChanged(idx, e)}
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
                          <select
                            .value="${key}"
                            style="width: 120px;"
                            @change=${(e: Event) => this._updateActivityConditionKey(idx, key, (e.target as HTMLSelectElement).value)}
                          >
                            <option value="">Select...</option>
                            <option value="who">who</option>
                            <option value="where">where</option>
                            <option value="when">when</option>
                            <option value="user">user</option>
                            <option value="random">random</option>
                            ${this.uniqueNamedSensors.map(sensorName => html`
                              <option value="${sensorName}">${sensorName}</option>
                            `)}
                          </select>
                          ${this.renderConditionValueInput(key, value, (newValue) => this._updateActivityConditionValue(idx, key, newValue), validation)}
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
            <label>Default preposition:</label>
            <input
              type="text"
              .value=${this._config.default_preposition ?? 'in'}
              @input=${this._defaultPrepositionChanged}
              placeholder="in"
            />
            <p style="font-size: 0.85em; color: #888; margin: 0.3em 0 0.8em 0;">
              Fallback preposition for zones without a group override
            </p>
          </div>
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
                ${gidx > 0 ? html`<button @click=${(e: Event) => { e.preventDefault(); e.stopPropagation(); this._moveZoneGroupUp(gidx); }} title="Move Up">↑</button>` : ''}
                ${gidx < (this._config.zone_groups?.length ?? 0) - 1 ? html`<button @click=${(e: Event) => { e.preventDefault(); e.stopPropagation(); this._moveZoneGroupDown(gidx); }} title="Move Down">↓</button>` : ''}
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
                <label style="flex-shrink: 0;">Display as (override):</label>
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
                    .checked=${group.show_preposition !== false}
                    @change=${(e: Event) => this._zoneGroupShowPrepositionChanged(gidx, e)}
                  />
                  Show preposition
                </label>
              </div>
              ${group.show_preposition !== false ? html`
              <div style="margin-left: 1.5em; margin-top: 0.5em; display: flex; align-items: flex-start; gap: 8px;">
                <label style="flex-shrink: 0;">Preposition (override):</label>
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
                <div style="margin-top: 0.5em;">
                  <input
                    type="text"
                    .value=${this._zoneFilter[gidx] || ''}
                    @input=${(e: Event) => this._zoneFilterChanged(gidx, e)}
                    placeholder="Type to filter zones..."
                    style="width: 100%; box-sizing: border-box; margin-bottom: 0.5em; margin-left: 0;"
                  />
                  <div style="display: flex; align-items: center; gap: 0.5em;">
                    <select @change=${(e: Event) => this._addZoneToGroup(gidx, e)} class="zone-select" style="flex: 1;">
                      <option value="">Select a zone...</option>
                      ${this.getZonesForGroup(gidx).map(({ zone: zid, isUsed }) =>
                        html`<option value=${zid} class="${isUsed ? 'used-zone' : ''}">${this.hass.states[zid]?.attributes?.friendly_name || (zid === 'home' ? 'Home' : zid)}${isUsed ? ' (used)' : ''}</option>`
                      )}
                    </select>
                    ${!(this._zoneFilter[gidx] || '').trim() ? html`
                      <label style="display: flex; align-items: center; font-size: 0.9em; color: #666; white-space: nowrap; margin: 0;">
                        <input
                          type="checkbox"
                          .checked=${this._showUsedZones[gidx] || false}
                          @change=${(e: Event) => this._toggleShowUsedZones(gidx, e)}
                          style="margin: 0 0.3em 0 0;"
                        />
                        Show used
                      </label>
                    ` : ''}
                  </div>
                </div>
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

              <!-- Zone Group Conditions -->
              <div>
                <strong>Conditions (Optional)</strong>
                <p style="font-size: 0.9em; color: #666; margin-top: 0.25em; margin-bottom: 0.5em;">
                  Only apply this zone group when all conditions match. If no conditions are set, the group always applies.
                </p>
                <div>
                  ${group.conditions && Object.keys(group.conditions).length > 0
                    ? Object.entries(group.conditions).map(([key, value]) => {
                      const validation = this.validateConditionValue(key, value);
                      return html`
                      <div style="margin-bottom: 0.5em;">
                        <div style="display: flex; gap: 0.5em; align-items: center;">
                          <select
                            .value="${key}"
                            style="width: 120px;"
                            @change=${(e: Event) => this._updateZoneGroupConditionKey(gidx, key, (e.target as HTMLSelectElement).value)}
                          >
                            <option value="">Select...</option>
                            <option value="who">who</option>
                            <option value="where">where</option>
                            <option value="when">when</option>
                            <option value="user">user</option>
                            <option value="random">random</option>
                            ${this.uniqueNamedSensors.map(sensorName => html`
                              <option value="${sensorName}">${sensorName}</option>
                            `)}
                          </select>
                          ${this.renderConditionValueInput(key, value, (newValue) => this._updateZoneGroupConditionValue(gidx, key, newValue), validation)}
                          <button class="icon-button" @click=${() => this._removeZoneGroupCondition(gidx, key)} title="Remove">🗑️</button>
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
                <button @click=${() => this._addZoneGroupCondition(gidx)} style="margin-top: 0.5em;">+ Add Condition</button>
              </div>

              <!-- Zone Group Activities -->
              <details style="margin-top: 1em; border-top: 1px solid #eee; padding-top: 0.5em;">
                <summary style="cursor: pointer; font-weight: bold; color: #555;">
                  Zone specific activities (${(group.activities ?? []).length})
                </summary>
                <p style="font-size: 0.85em; color: #666; margin: 0.5em 0;">
                  Activities defined here only apply when a person is in this zone group and take priority over card-level activities.
                </p>
                <div style="margin-top: 0.5em;">
                  ${(group.activities ?? []).map((activity, aidx) => html`
                    <details style="margin-bottom:1em; border: 1px solid #ccc; padding: 0.5em; border-radius: 4px;">
                      <summary style="cursor: pointer; font-weight: bold;">
                        ${activity.activity || activity.verb || `Activity ${aidx + 1}`}
                        ${aidx > 0 ? html`<button @click=${(e: Event) => { e.preventDefault(); e.stopPropagation(); this._moveZoneGroupActivityUp(gidx, aidx); }} title="Move Up">↑</button>` : ''}
                        ${aidx < (group.activities?.length ?? 0) - 1 ? html`<button @click=${(e: Event) => { e.preventDefault(); e.stopPropagation(); this._moveZoneGroupActivityDown(gidx, aidx); }} title="Move Down">↓</button>` : ''}
                        <button @click=${(e: Event) => { e.preventDefault(); e.stopPropagation(); this._removeZoneGroupActivity(gidx, aidx); }}>Remove</button>
                      </summary>
                      <div style="margin-top: 0.5em;">
                        <div>
                          <label>Activity:</label>
                          <input
                            type="text"
                            .value=${activity.activity || activity.verb || ''}
                            @input=${(e: Event) => this._zoneGroupActivityChanged(gidx, aidx, e)}
                            placeholder="Activity (e.g., in a meeting)"
                          />
                        </div>
                        <div>
                          <label>
                            <input
                              type="checkbox"
                              class="tristate-checkbox"
                              data-zone-group-idx="${gidx}"
                              data-activity-idx="${aidx}"
                              data-tristate-field="show_location"
                              @click=${(e: Event) => this._zoneGroupActivityShowLocationChanged(gidx, aidx, e)}
                            />
                            Show location
                          </label>
                        </div>
                        ${activity.show_location !== false ? html`
                        <div style="margin-left: 1.5em; margin-top: 0.5em; display: flex; align-items: flex-start; gap: 8px;">
                          <label style="flex-shrink: 0;">Location (override):</label>
                          <input
                            type="text"
                            .value=${activity.location_override || ''}
                            @input=${(e: Event) => this._zoneGroupActivityLocationOverrideChanged(gidx, aidx, e)}
                            placeholder="(optional, custom text)"
                            style="flex: 1; min-width: 150px; box-sizing: border-box;"
                          />
                        </div>
                        ` : ''}
                        <div>
                          <label>
                            <input
                              type="checkbox"
                              class="tristate-checkbox"
                              data-zone-group-idx="${gidx}"
                              data-activity-idx="${aidx}"
                              data-tristate-field="show_preposition"
                              @click=${(e: Event) => this._zoneGroupActivityShowPrepositionChanged(gidx, aidx, e)}
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
                            @input=${(e: Event) => this._zoneGroupActivityPrepositionChanged(gidx, aidx, e)}
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
                              'e.g., mdi:account-group',
                              (value) => {
                                const groups = [...(this._config.zone_groups || [])];
                                const activities = [...(groups[gidx].activities || [])];
                                activities[aidx] = { ...activities[aidx], icon: value || undefined };
                                groups[gidx] = { ...groups[gidx], activities };
                                this._config = { ...this._config, zone_groups: groups };
                                this._emitConfigChanged();
                              }
                            )}
                          </div>
                        </div>
                        <div>
                          <strong>Conditions</strong>
                          <p style="font-size: 0.9em; color: #666; margin-top: 0.25em;">
                            All conditions must match for this activity to apply.
                          </p>
                          <div>
                            ${Object.entries(activity.conditions || {}).map(([key, value]) => {
                              const validation = this.validateConditionValue(key, value);
                              return html`
                              <div style="margin-bottom: 0.5em;">
                                <div style="display: flex; gap: 0.5em; align-items: center;">
                                  <select
                                    .value="${key}"
                                    style="width: 100px;"
                                    @change=${(e: Event) => this._updateZoneGroupActivityConditionKey(gidx, aidx, key, (e.target as HTMLSelectElement).value)}
                                  >
                                    <option value="">Select...</option>
                                    <option value="who">who</option>
                                    <option value="where">where</option>
                                    <option value="when">when</option>
                                    <option value="user">user</option>
                                    <option value="random">random</option>
                                    ${this.uniqueNamedSensors.map(sensorName => html`
                                      <option value="${sensorName}">${sensorName}</option>
                                    `)}
                                  </select>
                                  ${this.renderConditionValueInput(key, value, (newValue) => this._updateZoneGroupActivityConditionValue(gidx, aidx, key, newValue), validation)}
                                  <button class="icon-button" @click=${() => this._removeZoneGroupActivityCondition(gidx, aidx, key)} title="Remove">🗑️</button>
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
                          <button @click=${() => this._addZoneGroupActivityCondition(gidx, aidx)} style="margin-top: 0.5em;">+ Add Condition</button>
                        </div>
                      </div>
                    </details>
                  `)}
                </div>
                <button @click=${() => this._addZoneGroupActivity(gidx)} style="margin-top: 0.5em;">Add Activity</button>
              </details>

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

          <!-- Person Container Layout -->
          <div style="margin-bottom: 1.5em; margin-top: 1.5em;">
            <h4 style="font-size: 0.95em; font-weight: 500; margin-bottom: 0.8em; margin-top: 0;">Person Container Layout</h4>
                <div class="box-model">
                  <!-- Margin -->
                  <div class="box-layer box-margin">
                    <div class="box-label">margin</div>
                    ${this._renderSpacingInputs('container_margin', this._config.style?.container_margin, '12px 0', html`
                      <!-- Border -->
                      <div class="box-layer box-border">
                        <div class="box-label">border</div>
                        <div style="display: flex; gap: 2px; margin-bottom: 2px;">
                          <input type="text"
                            class="box-input"
                            style="flex: 0 0 28%;"
                            .value=${this._config.style?.border_width || ''}
                            @input=${this._styleChanged('border_width')}
                            placeholder="3px" />
                          <select
                            class="box-select"
                            style="flex: 0 1 auto; min-width: 0; max-width: 60%;"
                            .value=${this._config.style?.border_style || ''}
                            @change=${this._styleChanged('border_style')}>
                            <option value="">solid</option>
                            <option value="solid">solid</option>
                            <option value="dashed">dashed</option>
                            <option value="dotted">dotted</option>
                            <option value="double">double</option>
                            <option value="none">none</option>
                          </select>
                        </div>
                        <input type="text"
                          class="box-input"
                          .value=${this._config.style?.border_color || ''}
                          @input=${this._styleChanged('border_color')}
                          placeholder="var(--primary-color)" />

                        <!-- Padding -->
                        <div class="box-layer box-padding">
                          <div class="box-label">padding</div>
                          ${this._renderSpacingInputs('container_padding', this._config.style?.container_padding, '8px', html`
                            <!-- Content -->
                            <div class="box-layer box-content">
                              <div class="box-label">content</div>
                              <div style="display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: center; gap: 3px; padding: 5px 2px;">
                                <!-- Avatar column -->
                                <div style="display: flex; flex-direction: column; align-items: center; gap: 1px;">
                                  <div
                                    class="avatar-toggle"
                                    @click=${this._toggleShowAvatarsClick}
                                    style="cursor: pointer; width: 26px; height: 26px; border-radius: 50%; overflow: hidden; border: 2px solid var(--divider-color); transition: all 0.2s; flex-shrink: 0; ${this._config.show_avatars ? '' : 'opacity: 0.3; filter: grayscale(100%);'}"
                                    title="${this._config.show_avatars ? 'Click to hide avatars' : 'Click to show avatars'}"
                                  >
                                    <svg width="26" height="26" viewBox="0 0 48 48">
                                      <circle cx="24" cy="24" r="24" fill="#E3F2FD"/>
                                      <circle cx="24" cy="18" r="8" fill="#2196F3"/>
                                      <path d="M 8 44 Q 8 32 24 32 Q 40 32 40 44 Z" fill="#2196F3"/>
                                    </svg>
                                  </div>
                                  ${this._config.show_avatars ? html`
                                    <div style="display: flex; flex-direction: column; align-items: center;">
                                      <label style="font-size: 0.55em; color: #666; margin-bottom: 1px; white-space: nowrap;">Size</label>
                                      <input type="text"
                                        class="spacing-input"
                                        style="position: static; transform: none; width: 20px;"
                                        .value=${this._config.style?.avatar_size || ''}
                                        @input=${this._styleChanged('avatar_size')}
                                        placeholder="38px" />
                                    </div>
                                  ` : ''}
                                </div>
                                <!-- Gap -->
                                <div style="display: flex; flex-direction: column; align-items: center;">
                                  <label style="font-size: 0.55em; color: #666; margin-bottom: 1px; white-space: nowrap;">Gap</label>
                                  <input type="text"
                                    class="spacing-input"
                                    style="position: static; transform: none; width: 20px; margin-top: 8px;"
                                    .value=${this._config.style?.container_gap || ''}
                                    @input=${this._styleChanged('container_gap')}
                                    placeholder="12px" />
                                </div>
                                <!-- Font Size -->
                                <div style="display: flex; flex-direction: column; align-items: center;">
                                  <label style="font-size: 0.55em; color: #666; margin-bottom: 1px; white-space: nowrap;">Font</label>
                                  <input type="text"
                                    class="spacing-input"
                                    style="position: static; transform: none; width: 20px; margin-top: 8px;"
                                    .value=${this._config.style?.font_size || this._config.style?.location_font_size || ''}
                                    @input=${this._styleChanged('font_size')}
                                    placeholder="1em" />
                                </div>
                                <!-- Icon Size -->
                                <div style="display: flex; flex-direction: column; align-items: center;">
                                  <label style="font-size: 0.55em; color: #666; margin-bottom: 1px; white-space: nowrap;">Icon</label>
                                  <input type="text"
                                    class="spacing-input"
                                    style="position: static; transform: none; width: 20px; margin-top: 8px;"
                                    .value=${this._config.style?.icon_size || this._config.style?.location_icon_size || ''}
                                    @input=${this._styleChanged('icon_size')}
                                    placeholder="20px" />
                                </div>
                                <!-- Icon Color -->
                                <div style="display: flex; flex-direction: column; align-items: center;">
                                  <label style="font-size: 0.55em; color: #666; margin-bottom: 1px; white-space: nowrap;">Color</label>
                                  <input type="text"
                                    class="spacing-input"
                                    style="position: static; transform: none; width: 20px; margin-top: 9px;"
                                    .value=${this._config.style?.icon_color || this._config.style?.location_icon_color || ''}
                                    @input=${this._styleChanged('icon_color')}
                                    placeholder="#333" />
                                </div>
                              </div>
                            </div>
                          `)}
                        </div>
                      </div>
                    `)}
                  </div>
                </div>
              </div>

        </div>
      </details>

      <!-- LISTENING INFO -->
      <h3>Listens to (${this.trackedEntities.filter(eid => !eid.startsWith('zone.')).length} entities)</h3>
      <p style="font-size: 0.9em; color: #666; margin-bottom: 0.5em;">
        The card monitors these entities for state changes:
      </p>
      <div>
        <ul style="list-style: none; padding: 0; margin: 0;">
          ${[...this.trackedEntities].filter(eid => !eid.startsWith('zone.')).sort((a, b) => {
            // Sort: person first, then sensors/inputs/timers
            const domainA = a.split('.')[0];
            const domainB = b.split('.')[0];
            const orderA = domainA === 'person' ? 0 : 1;
            const orderB = domainB === 'person' ? 0 : 1;
            if (orderA !== orderB) return orderA - orderB;
            return a.localeCompare(b); // Alphabetical within same category
          }).map(entityId => {
            const entity = this.hass?.states[entityId];
            const state = entity?.state || 'unavailable';
            const domain = entityId.split('.')[0];

            // Color coding: green=person, blue=sensor, orange=input, brown=timer
            let color = '#ff9800'; // Default orange for inputs
            if (domain === 'person') color = '#4caf50'; // Green
            else if (domain === 'sensor' || domain === 'binary_sensor') color = '#2196f3'; // Blue
            else if (domain === 'timer') color = '#795548'; // Brown

            return html`
              <li style="margin-bottom: 0.25em; padding: 0.25em; display: flex; align-items: center; gap: 0.5em; font-size: 0.9em;">
                <span style="display: inline-block; padding: 0.15em 0.4em; background: ${color}; color: white; border-radius: 3px; font-size: 0.7em; font-weight: bold; min-width: 45px; text-align: center;">${domain}</span>
                <span style="font-family: monospace; font-size: 0.85em;">${entityId}</span>
                <span style="margin-left: auto; color: #666; font-size: 0.85em;">${state}</span>
              </li>
            `;
          })}
        </ul>
      </div>

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

  _toggleShowAvatarsClick() {
    this._config = { ...this._config, show_avatars: !this._config.show_avatars };
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
      !(this._config.persons || []).some(p => p.entity_id === entity_id)
    ) {
      this._config = { ...this._config, persons: [...(this._config.persons || []), { entity_id }] };
      select.value = '';
      this.requestUpdate();
      this._emitConfigChanged();
    }
  }

  _removePerson(idx: number) {
    const newPersons = (this._config.persons || []).filter((_, i) => i !== idx);
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

  _personShowAvatarChanged(idx: number, e: Event) {
    const checkbox = e.target as HTMLInputElement;
    const persons = [...(this._config.persons || [])];

    // Cycle through three states: undefined (inherit) -> true (show) -> false (hide) -> undefined
    const currentValue = persons[idx].show_avatar;
    let newValue: boolean | undefined;

    if (currentValue === undefined) {
      newValue = true;
    } else if (currentValue === true) {
      newValue = false;
    } else {
      newValue = undefined;
    }

    persons[idx] = { ...persons[idx], show_avatar: newValue };
    this._config = { ...this._config, persons };

    // Immediately update checkbox visual state
    if (newValue === undefined) {
      checkbox.checked = false;
      checkbox.indeterminate = true;
    } else if (newValue === true) {
      checkbox.indeterminate = false;
      checkbox.checked = true;
    } else {
      checkbox.indeterminate = false;
      checkbox.checked = false;
    }

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
    // Store value or undefined if empty
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

  _activityShowLocationChanged(idx: number, e: Event) {
    const checkbox = e.target as HTMLInputElement;
    const activities = [...(this._config.activities ?? [])];

    // Cycle through three states: undefined (inherit) -> true (show) -> false (hide) -> undefined
    const currentValue = activities[idx].show_location;
    let newValue: boolean | undefined;

    if (currentValue === undefined) {
      newValue = true;
    } else if (currentValue === true) {
      newValue = false;
    } else {
      newValue = undefined;
    }

    activities[idx] = { ...activities[idx], show_location: newValue };
    this._config = { ...this._config, activities };

    // Immediately update checkbox visual state
    if (newValue === undefined) {
      checkbox.checked = false;
      checkbox.indeterminate = true;
    } else if (newValue === true) {
      checkbox.indeterminate = false;
      checkbox.checked = true;
    } else {
      checkbox.indeterminate = false;
      checkbox.checked = false;
    }

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

    // Immediately update checkbox visual state
    if (newValue === undefined) {
      checkbox.checked = false;
      checkbox.indeterminate = true;
    } else if (newValue === true) {
      checkbox.indeterminate = false;
      checkbox.checked = true;
    } else {
      checkbox.indeterminate = false;
      checkbox.checked = false;
    }

    this.requestUpdate();
    this._emitConfigChanged();
  }

  _addActivityCondition(idx: number) {
    const activities = [...(this._config.activities ?? [])];
    const conditions = { ...(activities[idx].conditions || {}) };

    // Use empty string as key so user can select from dropdown
    conditions[''] = '';
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

  _moveZoneGroupUp(idx: number) {
    if (idx === 0) return;
    const groups = [...(this._config.zone_groups ?? [])];
    [groups[idx - 1], groups[idx]] = [groups[idx], groups[idx - 1]];
    this._config = { ...this._config, zone_groups: groups };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _moveZoneGroupDown(idx: number) {
    const groups = [...(this._config.zone_groups ?? [])];
    if (idx >= groups.length - 1) return;
    [groups[idx], groups[idx + 1]] = [groups[idx + 1], groups[idx]];
    this._config = { ...this._config, zone_groups: groups };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _addZoneGroupCondition(gidx: number) {
    const groups: ZoneGroup[] = [...(this._config.zone_groups ?? [])];
    const conditions = { ...(groups[gidx].conditions || {}) };

    // Use empty string as key so user can select from dropdown
    conditions[''] = '';
    groups[gidx] = { ...groups[gidx], conditions };
    this._config = { ...this._config, zone_groups: groups };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _updateZoneGroupConditionKey(gidx: number, oldKey: string, newKey: string) {
    if (!newKey.trim() || newKey === oldKey) return;

    const groups: ZoneGroup[] = [...(this._config.zone_groups ?? [])];
    const conditions = { ...(groups[gidx].conditions || {}) };

    if (conditions[newKey.trim()] && newKey.trim() !== oldKey) {
      alert('A condition with this key already exists');
      return;
    }

    const value = conditions[oldKey];
    delete conditions[oldKey];
    conditions[newKey.trim()] = value;

    groups[gidx] = { ...groups[gidx], conditions };
    this._config = { ...this._config, zone_groups: groups };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _updateZoneGroupConditionValue(gidx: number, key: string, valueStr: string) {
    const groups: ZoneGroup[] = [...(this._config.zone_groups ?? [])];
    const conditions = { ...(groups[gidx].conditions || {}) };

    const value = valueStr.includes(',')
      ? valueStr.split(',').map(v => v.trim()).filter(v => v)
      : valueStr.trim();

    conditions[key] = value;
    groups[gidx] = { ...groups[gidx], conditions };
    this._config = { ...this._config, zone_groups: groups };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _removeZoneGroupCondition(gidx: number, key: string) {
    const groups: ZoneGroup[] = [...(this._config.zone_groups ?? [])];
    const conditions = { ...(groups[gidx].conditions || {}) };
    delete conditions[key];

    if (Object.keys(conditions).length === 0) {
      groups[gidx] = { ...groups[gidx], conditions: undefined };
    } else {
      groups[gidx] = { ...groups[gidx], conditions };
    }

    this._config = { ...this._config, zone_groups: groups };
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

  _zoneGroupOverrideLocationChanged(gidx: number, e: Event) {
    const checked = (e.target as HTMLInputElement).checked;
    const groups: ZoneGroup[] = [...(this._config.zone_groups ?? [])];
    groups[gidx] = { ...groups[gidx], override_location: checked };
    this._config = { ...this._config, zone_groups: groups };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _zoneFilterChanged(gidx: number, e: Event) {
    const value = (e.target as HTMLInputElement).value;
    this._zoneFilter = { ...this._zoneFilter, [gidx]: value };
    this.requestUpdate();
  }

  _toggleShowUsedZones(gidx: number, e: Event) {
    const checked = (e.target as HTMLInputElement).checked;
    this._showUsedZones = { ...this._showUsedZones, [gidx]: checked };
    this.requestUpdate();
  }

  _addZoneToGroup(gidx: number, e: Event) {
    const select = e.target as HTMLSelectElement;
    const zid = select.value;

    // Check if zone is already in current group
    if (zid && !(this._config.zone_groups ?? [])[gidx].zones.includes(zid)) {
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

  // Zone Group Activity Methods
  _addZoneGroupActivity(gidx: number) {
    const groups: ZoneGroup[] = [...(this._config.zone_groups ?? [])];
    const activities = [...(groups[gidx].activities ?? []), { activity: '', conditions: {}, show_preposition: false }];
    groups[gidx] = { ...groups[gidx], activities };
    this._config = { ...this._config, zone_groups: groups };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _removeZoneGroupActivity(gidx: number, aidx: number) {
    const groups: ZoneGroup[] = [...(this._config.zone_groups ?? [])];
    const activities = (groups[gidx].activities ?? []).filter((_, i) => i !== aidx);
    groups[gidx] = { ...groups[gidx], activities: activities.length > 0 ? activities : undefined };
    this._config = { ...this._config, zone_groups: groups };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _moveZoneGroupActivityUp(gidx: number, aidx: number) {
    if (aidx === 0) return;
    const groups: ZoneGroup[] = [...(this._config.zone_groups ?? [])];
    const activities = [...(groups[gidx].activities ?? [])];
    [activities[aidx - 1], activities[aidx]] = [activities[aidx], activities[aidx - 1]];
    groups[gidx] = { ...groups[gidx], activities };
    this._config = { ...this._config, zone_groups: groups };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _moveZoneGroupActivityDown(gidx: number, aidx: number) {
    const groups: ZoneGroup[] = [...(this._config.zone_groups ?? [])];
    const activities = [...(groups[gidx].activities ?? [])];
    if (aidx >= activities.length - 1) return;
    [activities[aidx], activities[aidx + 1]] = [activities[aidx + 1], activities[aidx]];
    groups[gidx] = { ...groups[gidx], activities };
    this._config = { ...this._config, zone_groups: groups };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _zoneGroupActivityChanged(gidx: number, aidx: number, e: Event) {
    const value = (e.target as HTMLInputElement).value;
    const groups: ZoneGroup[] = [...(this._config.zone_groups ?? [])];
    const activities = [...(groups[gidx].activities ?? [])];
    activities[aidx] = { ...activities[aidx], activity: value };
    groups[gidx] = { ...groups[gidx], activities };
    this._config = { ...this._config, zone_groups: groups };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _zoneGroupActivityLocationOverrideChanged(gidx: number, aidx: number, e: Event) {
    const value = (e.target as HTMLInputElement).value;
    const groups: ZoneGroup[] = [...(this._config.zone_groups ?? [])];
    const activities = [...(groups[gidx].activities ?? [])];
    activities[aidx] = { ...activities[aidx], location_override: value || undefined };
    groups[gidx] = { ...groups[gidx], activities };
    this._config = { ...this._config, zone_groups: groups };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _zoneGroupActivityPrepositionChanged(gidx: number, aidx: number, e: Event) {
    const value = (e.target as HTMLInputElement).value;
    const groups: ZoneGroup[] = [...(this._config.zone_groups ?? [])];
    const activities = [...(groups[gidx].activities ?? [])];
    activities[aidx] = { ...activities[aidx], preposition: value || undefined };
    groups[gidx] = { ...groups[gidx], activities };
    this._config = { ...this._config, zone_groups: groups };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _zoneGroupActivityShowLocationChanged(gidx: number, aidx: number, e: Event) {
    const checkbox = e.target as HTMLInputElement;
    const groups: ZoneGroup[] = [...(this._config.zone_groups ?? [])];
    const activities = [...(groups[gidx].activities ?? [])];

    const currentValue = activities[aidx].show_location;
    let newValue: boolean | undefined;

    if (currentValue === undefined) {
      newValue = true;
    } else if (currentValue === true) {
      newValue = false;
    } else {
      newValue = undefined;
    }

    activities[aidx] = { ...activities[aidx], show_location: newValue };
    groups[gidx] = { ...groups[gidx], activities };
    this._config = { ...this._config, zone_groups: groups };

    if (newValue === undefined) {
      checkbox.checked = false;
      checkbox.indeterminate = true;
    } else if (newValue === true) {
      checkbox.checked = true;
      checkbox.indeterminate = false;
    } else {
      checkbox.indeterminate = false;
      checkbox.checked = false;
    }

    this.requestUpdate();
    this._emitConfigChanged();
  }

  _zoneGroupActivityShowPrepositionChanged(gidx: number, aidx: number, e: Event) {
    const checkbox = e.target as HTMLInputElement;
    const groups: ZoneGroup[] = [...(this._config.zone_groups ?? [])];
    const activities = [...(groups[gidx].activities ?? [])];

    const currentValue = activities[aidx].show_preposition;
    let newValue: boolean | undefined;

    if (currentValue === undefined) {
      newValue = true;
    } else if (currentValue === true) {
      newValue = false;
    } else {
      newValue = undefined;
    }

    activities[aidx] = { ...activities[aidx], show_preposition: newValue };
    groups[gidx] = { ...groups[gidx], activities };
    this._config = { ...this._config, zone_groups: groups };

    if (newValue === undefined) {
      checkbox.checked = false;
      checkbox.indeterminate = true;
    } else if (newValue === true) {
      checkbox.checked = true;
      checkbox.indeterminate = false;
    } else {
      checkbox.indeterminate = false;
      checkbox.checked = false;
    }

    this.requestUpdate();
    this._emitConfigChanged();
  }

  _addZoneGroupActivityCondition(gidx: number, aidx: number) {
    const groups: ZoneGroup[] = [...(this._config.zone_groups ?? [])];
    const activities = [...(groups[gidx].activities ?? [])];
    const conditions = { ...(activities[aidx].conditions || {}) };

    // Use empty string as key so user can select from dropdown
    conditions[''] = '';
    activities[aidx] = { ...activities[aidx], conditions };
    groups[gidx] = { ...groups[gidx], activities };
    this._config = { ...this._config, zone_groups: groups };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _updateZoneGroupActivityConditionKey(gidx: number, aidx: number, oldKey: string, newKey: string) {
    if (!newKey.trim() || newKey === oldKey) return;

    const groups: ZoneGroup[] = [...(this._config.zone_groups ?? [])];
    const activities = [...(groups[gidx].activities ?? [])];
    const conditions = { ...(activities[aidx].conditions || {}) };

    if (conditions[newKey.trim()] && newKey.trim() !== oldKey) {
      alert('A condition with this key already exists');
      return;
    }

    const value = conditions[oldKey];
    delete conditions[oldKey];
    conditions[newKey.trim()] = value;

    activities[aidx] = { ...activities[aidx], conditions };
    groups[gidx] = { ...groups[gidx], activities };
    this._config = { ...this._config, zone_groups: groups };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _updateZoneGroupActivityConditionValue(gidx: number, aidx: number, key: string, valueStr: string) {
    const groups: ZoneGroup[] = [...(this._config.zone_groups ?? [])];
    const activities = [...(groups[gidx].activities ?? [])];
    const conditions = { ...(activities[aidx].conditions || {}) };

    const value = valueStr.includes(',')
      ? valueStr.split(',').map(v => v.trim()).filter(v => v)
      : valueStr.trim();

    conditions[key] = value;
    activities[aidx] = { ...activities[aidx], conditions };
    groups[gidx] = { ...groups[gidx], activities };
    this._config = { ...this._config, zone_groups: groups };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _removeZoneGroupActivityCondition(gidx: number, aidx: number, key: string) {
    const groups: ZoneGroup[] = [...(this._config.zone_groups ?? [])];
    const activities = [...(groups[gidx].activities ?? [])];
    const conditions = { ...(activities[aidx].conditions || {}) };
    delete conditions[key];
    activities[aidx] = { ...activities[aidx], conditions };
    groups[gidx] = { ...groups[gidx], activities };
    this._config = { ...this._config, zone_groups: groups };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _addNamedSensor(personIdx: number, sensorName: string) {
    const persons = [...this._config.persons];
    const namedSensors: PersonSensors = persons[personIdx].namedSensors || {};

    // Check if sensor name already exists
    if (namedSensors[sensorName]) {
      alert('A sensor with this name already exists');
      return;
    }

    namedSensors[sensorName] = { entity_id: '' };
    persons[personIdx] = { ...persons[personIdx], namedSensors };
    this._config = { ...this._config, persons };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _addNamedSensorFromText(personIdx: number) {
    const input = this.shadowRoot?.querySelector(`#new-sensor-name-${personIdx}`) as HTMLInputElement;
    const sensorName = input?.value.trim();

    if (!sensorName) {
      alert('Please enter a sensor name');
      return;
    }

    this._addNamedSensor(personIdx, sensorName);
    input.value = ''; // Clear input

    // Reset mode if there are available sensors
    const availableSensorNames = this.getAvailableSensorNames(personIdx);
    if (availableSensorNames.length > 0) {
      this._addSensorMode = { ...this._addSensorMode, [personIdx]: 'dropdown' };
    }
  }

  _addNamedSensorFromDropdown(personIdx: number, sensorName: string) {
    // Look up the sensor definition from another person
    let sensorTemplate: { entity_id: string | string[], attribute?: string } | null = null;

    for (const person of this._config.persons) {
      if (person.namedSensors && person.namedSensors[sensorName]) {
        sensorTemplate = person.namedSensors[sensorName];
        break;
      }
    }

    const persons = [...this._config.persons];
    const namedSensors: PersonSensors = persons[personIdx].namedSensors || {};

    // Use the template if found, otherwise create empty sensor
    namedSensors[sensorName] = sensorTemplate
      ? { ...sensorTemplate }
      : { entity_id: '' };

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

    // Preserve existing attribute if present
    const existingAttribute = namedSensors[sensorName]?.attribute;
    namedSensors[sensorName] = { entity_id: entityIds };
    if (existingAttribute) {
      namedSensors[sensorName].attribute = existingAttribute;
    }

    persons[personIdx] = { ...persons[personIdx], namedSensors };
    this._config = { ...this._config, persons };
    this.requestUpdate();
    this._emitConfigChanged();
  }

  _updateNamedSensorAttribute(personIdx: number, sensorName: string, value: string) {
    const persons = [...this._config.persons];
    const namedSensors: PersonSensors = persons[personIdx].namedSensors || {};

    if (!namedSensors[sensorName]) return;

    const trimmedValue = value.trim();
    if (trimmedValue) {
      namedSensors[sensorName] = { ...namedSensors[sensorName], attribute: trimmedValue };
    } else {
      // Remove attribute if empty
      const { attribute, ...rest } = namedSensors[sensorName];
      namedSensors[sensorName] = rest;
    }

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

    // Use empty string as key so user can select from dropdown
    hideIf[''] = '';
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

      // Migrate old properties to new unified properties
      if (key === 'icon_size') {
        delete style.location_icon_size;
        delete style.activity_icon_size;
      }
      if (key === 'icon_color') {
        delete style.location_icon_color;
        delete style.activity_icon_color;
      }
      if (key === 'font_size') {
        delete style.location_font_size;
        delete style.activity_font_size;
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
    .sensor-row select {
      width: 150px;
      flex-shrink: 0;
      padding: 0.4em;
      font-size: 0.9em;
      border: 1px solid #ccc;
      border-radius: 3px;
    }
    .sensor-row select:disabled {
      background: #f5f5f5;
      color: #999;
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

    /* Regular checkbox styling */
    input[type="checkbox"]:not(.tristate-checkbox) {
      appearance: none;
      -webkit-appearance: none;
      width: 16px;
      height: 16px;
      border: 1px solid #757575;
      border-radius: 2px;
      cursor: pointer;
      position: relative;
      vertical-align: middle;
      margin-right: 8px;
      background-color: white;
    }

    input[type="checkbox"]:not(.tristate-checkbox):checked {
      background-color: var(--primary-color, #03a9f4);
      border-color: var(--primary-color, #03a9f4);
    }

    input[type="checkbox"]:not(.tristate-checkbox):checked::after {
      content: '✓';
      position: absolute;
      left: 50%;
      top: 48%;
      transform: translate(-50%, -50%);
      color: white;
      font-size: 12px;
      font-weight: bold;
      line-height: 1;
    }

    /* Tristate checkbox styling */
    .tristate-checkbox {
      appearance: none;
      -webkit-appearance: none;
      width: 16px;
      height: 16px;
      border: 1px solid #757575;
      border-radius: 2px;
      cursor: pointer;
      position: relative;
      vertical-align: middle;
      margin-right: 8px;
      background-color: white;
    }

    /* Checked state (true) - blue checkmark */
    .tristate-checkbox:checked {
      background-color: var(--primary-color, #03a9f4);
      border-color: var(--primary-color, #03a9f4);
    }
    .tristate-checkbox:checked::after {
      content: '✓';
      position: absolute;
      left: 50%;
      top: 48%;
      transform: translate(-50%, -50%);
      color: white;
      font-size: 12px;
      font-weight: bold;
      line-height: 1;
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
      width: 8px;
      height: 2px;
      background-color: white;
    }

    /* Unchecked state (false) - red X */
    .tristate-checkbox:not(:checked):not(:indeterminate) {
      background-color: #d32f2f;
      border-color: #d32f2f;
    }
    .tristate-checkbox:not(:checked):not(:indeterminate)::after {
      content: '✕';
      position: absolute;
      left: 50%;
      top: 48%;
      transform: translate(-50%, -50%);
      color: white;
      font-size: 11px;
      font-weight: bold;
      line-height: 1;
    }

    /* Avatar Toggle */
    .avatar-toggle:hover {
      transform: scale(1.05);
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }

    /* Box Model Visualization */
    .box-model {
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 0.85em;
    }

    .box-layer {
      border: 1px solid #ccc;
      border-radius: 3px;
      position: relative;
      box-sizing: border-box;
      max-width: 100%;
    }

    .box-margin {
      background: #fef3e0;
      padding: 4px;
      box-sizing: border-box;
    }

    .box-border {
      background: #ffe4b5;
      padding: 4px;
      margin-top: 10px;
      width: 100%;
      box-sizing: border-box;
    }

    .box-padding {
      background: #d4edda;
      padding: 4px;
      margin-top: 12px;
      width: 100%;
      box-sizing: border-box;
    }

    .box-content {
      background: #cfe2ff;
      min-height: 55px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      margin-top: 12px;
      width: 100%;
      box-sizing: border-box;
    }

    .box-label {
      position: absolute;
      top: -10px;
      left: 8px;
      background: white;
      padding: 0 4px;
      font-size: 0.85em;
      font-weight: 500;
      color: #666;
    }

    .box-input {
      width: 100%;
      box-sizing: border-box;
      padding: 2px 4px;
      margin: 0;
      border: 1px solid #ccc;
      border-radius: 2px;
      font-size: 0.75em;
      font-family: monospace;
      background: white;
    }

    .box-input:focus {
      outline: none;
      border-color: var(--primary-color, #03a9f4);
    }

    .box-select {
      box-sizing: border-box;
      padding: 2px 4px;
      margin: 0;
      border: 1px solid #ccc;
      border-radius: 2px;
      font-size: 0.75em;
      background: white;
      cursor: pointer;
    }

    .box-select:focus {
      outline: none;
      border-color: var(--primary-color, #03a9f4);
    }

    .spacing-grid {
      display: grid;
      grid-template-columns: auto 1fr auto;
      grid-template-rows: auto 1fr auto;
      gap: 2px;
      align-items: center;
      justify-items: center;
    }

    .spacing-content {
      grid-column: 2;
      grid-row: 2;
      width: 100%;
      min-width: 0;
    }

    .spacing-input {
      width: 20px;
      padding: 2px 2px;
      border: 1px solid #ccc;
      border-radius: 2px;
      font-size: 0.65em;
      font-family: monospace;
      background: white;
      text-align: center;
    }

    .spacing-input:focus {
      outline: none;
      border-color: var(--primary-color, #03a9f4);
      z-index: 10;
    }

    /* Zone selection styling */
    .zone-select option.used-zone {
      background-color: #e0e0e0;
      color: #666;
    }
  `;
}

customElements.define('whereabouts-card-editor', WhereaboutsCardEditor);
