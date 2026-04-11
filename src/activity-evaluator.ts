import type { Activity, PersonConfig } from './types';
import type { ZoneGroup } from './whereabouts-card';

/**
 * Temporal condition helpers
 */
function getCurrentTime(): Date {
    return new Date();
}

function isWorkday(): boolean {
    const day = getCurrentTime().getDay(); // 0 = Sunday, 6 = Saturday
    return day >= 1 && day <= 5; // Monday-Friday
}

function isWorkHours(): boolean {
    if (!isWorkday()) return false;
    const hour = getCurrentTime().getHours();
    return hour >= 8 && hour < 16;
}

function isNight(): boolean {
    const hour = getCurrentTime().getHours();
    return hour >= 0 && hour < 6;
}

function isMorning(): boolean {
    const hour = getCurrentTime().getHours();
    return hour >= 6 && hour < 12;
}

function isAfternoon(): boolean {
    const hour = getCurrentTime().getHours();
    return hour >= 12 && hour < 18;
}

function isEvening(): boolean {
    const hour = getCurrentTime().getHours();
    return hour >= 18 && hour < 24;
}

function getCurrentDay(): string {
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    return days[getCurrentTime().getDay()];
}

/**
 * Get nested attribute value from object using dot notation
 */
function getNestedAttribute(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Check if current time matches a "when" period (night, morning, weekday, etc.)
 */
function matchesWhenPeriod(period: string): boolean {
    const lowerPeriod = period.toLowerCase();
    const hour = getCurrentTime().getHours();
    const day = getCurrentTime().getDay();

    switch (lowerPeriod) {
        case 'night':
            return hour >= 0 && hour < 6;
        case 'morning':
            return hour >= 6 && hour < 12;
        case 'afternoon':
            return hour >= 12 && hour < 18;
        case 'evening':
            return hour >= 18 && hour < 24;
        case 'weekday':
        case 'schoolday':
            return day >= 1 && day <= 5;
        case 'weekend':
            return day === 0 || day === 6;
        case 'afterschool':
            // After school hours on weekdays (14:00-18:00)
            return day >= 1 && day <= 5 && hour >= 14 && hour < 18;
        default:
            return false;
    }
}

export interface EvaluatedActivity {
    activity: string;
    location_override?: string;
    show_location?: boolean;
    preposition?: string;
    show_preposition?: boolean;
    icon?: string;
}

export class ActivityEvaluator {
    private hass: any;
    private person: PersonConfig;
    private activities: Activity[];
    private zoneGroups: ZoneGroup[];

    constructor(hass: any, person: PersonConfig, activities: Activity[], zoneGroups: ZoneGroup[] = []) {
        this.hass = hass;
        this.person = person;
        this.activities = activities;
        this.zoneGroups = zoneGroups;
    }

    /**
     * Evaluates activities top-to-bottom and returns the first matching activity
     * Priority: 1) Zone Group activities (if in group), 2) Card-level activities
     * Returns null if no activity matches
     */
    evaluate(): EvaluatedActivity | null {
        // First, check if person is in a zone group and evaluate zone group activities
        const zoneGroup = this.getCurrentZoneGroup();
        if (zoneGroup?.activities && zoneGroup.activities.length > 0) {
            const result = this.evaluateActivities(zoneGroup.activities);
            if (result) {
                return result;
            }
        }

        // Fall back to card-level activities
        return this.evaluateActivities(this.activities);
    }

    /**
     * Get the zone group that the person is currently in (if any)
     * Returns the first zone group where:
     * 1. Person's current zone is in the group's zones list
     * 2. Zone group conditions match (if any are defined)
     */
    private getCurrentZoneGroup(): ZoneGroup | null {
        const personEntity = this.hass.states[this.person.entity_id];
        if (!personEntity) return null;

        const personState = personEntity.state; // e.g., "office", "home"

        // Construct full zone entity ID
        let zoneEntityId = personState.startsWith('zone.')
            ? personState
            : `zone.${personState.toLowerCase().replace(/\s+/g, '_')}`;

        // Check each zone group in order (priority matters)
        for (const group of this.zoneGroups) {
            // Check if person is in this zone group
            if (group.zones.includes(zoneEntityId) || group.zones.includes(personState)) {
                // Check if zone group conditions match (if any)
                if (group.conditions && Object.keys(group.conditions).length > 0) {
                    // Evaluate all conditions (AND logic)
                    let allConditionsMatch = true;
                    for (const [key, expectedValue] of Object.entries(group.conditions)) {
                        if (!this.evaluateCondition(key, expectedValue)) {
                            allConditionsMatch = false;
                            break;
                        }
                    }
                    // Only return this group if all conditions match
                    if (!allConditionsMatch) {
                        continue; // Try next zone group
                    }
                }
                // Zone matches and conditions match (or no conditions) - return this group
                return group;
            }
        }

        return null;
    }

    /**
     * Evaluate a list of activities and return the first match
     */
    private evaluateActivities(activities: Activity[]): EvaluatedActivity | null {
        for (const activity of activities) {
            if (this.evaluateActivity(activity)) {
                const activityText = activity.activity || activity.verb || '';
                // Backward compatibility: treat location_override: '-' as show_location: false
                let showLocation = activity.show_location;
                let locationOverride = activity.location_override;
                if (locationOverride === '-' && showLocation === undefined) {
                    showLocation = false;
                    locationOverride = undefined;
                }
                return {
                    activity: this.replacePlaceholders(activityText),
                    location_override: locationOverride,
                    show_location: showLocation,
                    preposition: activity.preposition,
                    show_preposition: activity.show_preposition,
                    icon: activity.icon
                };
            }
        }
        return null;
    }

    /**
     * Replace {sensorName} or {sensorName.attribute} placeholders with actual values
     */
    private replacePlaceholders(text: string): string {
        return text.replace(/\{([^}]+)\}/g, (match, key) => {
            // Check if key contains dot notation for attribute access
            let sensorKey = key;
            let attributePath: string | undefined;

            if (key.includes('.')) {
                const parts = key.split('.');
                sensorKey = parts[0];
                attributePath = parts.slice(1).join('.');
            }

            // Look up the sensor
            const sensor = this.person.namedSensors?.[sensorKey];
            if (!sensor) {
                return match; // Keep placeholder if sensor not found
            }

            // Get entity ID (use first if array)
            const entityId = Array.isArray(sensor.entity_id) ? sensor.entity_id[0] : sensor.entity_id;
            const entity = this.hass.states[entityId];
            if (!entity) {
                return match; // Keep placeholder if entity not found
            }

            // Get value from state or attribute
            let value: any;
            if (attributePath) {
                value = getNestedAttribute(entity.attributes, attributePath);
            } else {
                value = entity.state;
            }

            // Return value as string, or keep placeholder if null/undefined
            return value != null ? String(value) : match;
        });
    }

    private evaluateActivity(activity: Activity): boolean {
        const conditions = activity.conditions;

        // All conditions must match (AND logic)
        for (const [key, expectedValue] of Object.entries(conditions)) {
            if (!this.evaluateCondition(key, expectedValue)) {
                return false;
            }
        }

        return true;
    }

    private evaluateCondition(key: string, expectedValue: string | string[]): boolean {
        // Special case: "when" matches array of time periods (OR logic)
        if (key === 'when') {
            const periods = Array.isArray(expectedValue) ? expectedValue : [expectedValue];
            return periods.some(period => matchesWhenPeriod(period));
        }

        // Special case: temporal conditions
        if (key === 'is_workday') {
            return this.matchesValue(isWorkday() ? 'true' : 'false', expectedValue);
        }
        if (key === 'is_work_hours') {
            return this.matchesValue(isWorkHours() ? 'true' : 'false', expectedValue);
        }
        if (key === 'is_night') {
            return this.matchesValue(isNight() ? 'true' : 'false', expectedValue);
        }
        if (key === 'is_morning') {
            return this.matchesValue(isMorning() ? 'true' : 'false', expectedValue);
        }
        if (key === 'is_afternoon') {
            return this.matchesValue(isAfternoon() ? 'true' : 'false', expectedValue);
        }
        if (key === 'is_evening') {
            return this.matchesValue(isEvening() ? 'true' : 'false', expectedValue);
        }
        if (key === 'day') {
            return this.matchesValue(getCurrentDay(), expectedValue);
        }

        // Special case: "who" matches against person entity_id or name
        if (key === 'who') {
            return this.evaluateWho(expectedValue);
        }

        // Special case: "where" matches against zones or zone groups
        if (key === 'where') {
            return this.evaluateWhere(expectedValue);
        }

        // Special case: "user" matches against current Home Assistant user
        if (key === 'user') {
            return this.evaluateUser(expectedValue);
        }

        // Check if key contains dot notation for attribute access (e.g., "discord.game")
        let sensorKey = key;
        let attributePath: string | undefined;

        if (key.includes('.')) {
            const parts = key.split('.');
            sensorKey = parts[0];
            attributePath = parts.slice(1).join('.');
        }

        // Look up the sensor in the person's namedSensors
        const sensor = this.person.namedSensors?.[sensorKey];
        if (!sensor) {
            return false; // Sensor not defined for this person
        }

        // Get the actual sensor state(s)
        const entityIds = Array.isArray(sensor.entity_id) ? sensor.entity_id : [sensor.entity_id];

        // Check if any of the entity states match the expected value
        for (const entityId of entityIds) {
            const entity = this.hass.states[entityId];
            if (!entity) continue;

            // Get value from state or attribute
            let actualValue: any;
            if (attributePath) {
                // Access nested attribute
                actualValue = getNestedAttribute(entity.attributes, attributePath);
            } else {
                actualValue = entity.state;
            }

            // Convert to string for comparison (handle null/undefined)
            const actualValueStr = actualValue == null ? '' : String(actualValue);

            // Evaluate the condition with operator support
            if (this.matchesValue(actualValueStr, expectedValue)) {
                return true;
            }
        }

        return false;
    }

    private evaluateWho(expectedValue: string | string[]): boolean {
        const expectedValues = Array.isArray(expectedValue) ? expectedValue : [expectedValue];
        const personId = this.person.entity_id;
        const personName = this.person.name || this.hass.states[personId]?.attributes?.friendly_name;

        return expectedValues.some(expected =>
            expected === personId ||
            expected === personName ||
            expected === personId.replace('person.', '')
        );
    }

    private evaluateWhere(expectedValue: string | string[]): boolean {
        const expectedValues = Array.isArray(expectedValue) ? expectedValue : [expectedValue];

        // Get person's current zone state
        const personEntity = this.hass.states[this.person.entity_id];
        if (!personEntity) return false;

        const personState = personEntity.state; // e.g., "office", "home"

        // Construct full zone entity ID
        let zoneEntityId = personState.startsWith('zone.')
            ? personState
            : `zone.${personState.toLowerCase().replace(/\s+/g, '_')}`;
        let zoneEntity = this.hass.states[zoneEntityId];

        // If zone not found by entity ID, try to find by friendly name
        if (!zoneEntity) {
            const foundZoneId = Object.keys(this.hass.states).find(
                (eid: string) => eid.startsWith('zone.') &&
                this.hass.states[eid]?.attributes?.friendly_name === personState
            );
            if (foundZoneId) {
                zoneEntityId = foundZoneId;
                zoneEntity = this.hass.states[zoneEntityId];
            }
        }

        const zoneFriendlyName = zoneEntity?.attributes?.friendly_name;

        // Check each expected value
        for (const expected of expectedValues) {
            // Match by zone entity ID
            if (expected === zoneEntityId) return true;

            // Match by person state (raw zone name)
            if (expected === personState || expected.toLowerCase() === personState.toLowerCase()) return true;

            // Match by zone friendly name
            if (zoneFriendlyName && (expected === zoneFriendlyName || expected.toLowerCase() === zoneFriendlyName.toLowerCase())) return true;

            // Match by zone group name
            for (const group of this.zoneGroups) {
                if (group.name && expected.toLowerCase() === group.name.toLowerCase()) {
                    // Check if current zone is in this group
                    if (group.zones.includes(zoneEntityId) || group.zones.includes(personState)) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    private evaluateUser(expectedValue: string | string[]): boolean {
        const expectedValues = Array.isArray(expectedValue) ? expectedValue : [expectedValue];

        // Get current user from hass
        const currentUser = this.hass.user;
        if (!currentUser) return false;

        // Match against user ID, name, or person entity ID
        return expectedValues.some(expected => {
            // Match user ID
            if (expected === currentUser.id) return true;

            // Match user name
            if (expected === currentUser.name) return true;

            // Match person entity_id associated with user
            // Check if the person entity has a user_id attribute matching current user
            const personEntity = this.hass.states[this.person.entity_id];
            if (personEntity?.attributes?.user_id === currentUser.id) {
                // Match against person entity_id or name
                if (expected === this.person.entity_id ||
                    expected === this.person.entity_id.replace('person.', '') ||
                    expected === this.person.name) {
                    return true;
                }
            }

            return false;
        });
    }

    private matchesValue(actualValue: string, expectedValue: string | string[]): boolean {
        // If array, check if actual value matches any in the array
        if (Array.isArray(expectedValue)) {
            return expectedValue.some(val => this.matchesValue(actualValue, val));
        }

        // Check for ! prefix (boolean false check)
        if (expectedValue.startsWith('!')) {
            const checkValue = expectedValue.substring(1).trim();
            if (!checkValue) {
                // Just "!" - check if actualValue is falsy
                return this.isFalsy(actualValue);
            }
            // "!value" - check if actualValue != value
            return actualValue !== checkValue;
        }

        // Parse operator from expected value (now includes !=)
        const operatorMatch = expectedValue.match(/^(>=|<=|!=|<>|>|<|=)(.+)$/);

        if (operatorMatch) {
            const operator = operatorMatch[1];
            const compareValue = operatorMatch[2].trim();

            return this.compareWithOperator(actualValue, operator, compareValue);
        }

        // No operator - direct string comparison
        return actualValue === expectedValue;
    }

    private isFalsy(value: string): boolean {
        const normalized = value.toLowerCase().trim();
        return normalized === '' ||
               normalized === '0' ||
               normalized === 'false' ||
               normalized === 'off' ||
               normalized === 'no' ||
               normalized === 'unavailable' ||
               normalized === 'unknown';
    }

    private compareWithOperator(actualValue: string, operator: string, compareValue: string): boolean {
        // Try numeric comparison first
        const actualNum = parseFloat(actualValue);
        const compareNum = parseFloat(compareValue);

        if (!isNaN(actualNum) && !isNaN(compareNum)) {
            switch (operator) {
                case '>': return actualNum > compareNum;
                case '<': return actualNum < compareNum;
                case '>=': return actualNum >= compareNum;
                case '<=': return actualNum <= compareNum;
                case '=': return actualNum === compareNum;
                case '!=':
                case '<>': return actualNum !== compareNum;
            }
        }

        // Fall back to string comparison
        switch (operator) {
            case '=': return actualValue === compareValue;
            case '!=':
            case '<>': return actualValue !== compareValue;
            case '>': return actualValue > compareValue;
            case '<': return actualValue < compareValue;
            case '>=': return actualValue >= compareValue;
            case '<=': return actualValue <= compareValue;
        }

        return false;
    }
}
