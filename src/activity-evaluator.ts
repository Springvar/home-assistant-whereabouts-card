import type { Activity, PersonConfig } from './types';
import type { ZoneGroup } from './whereabouts-card';

export interface EvaluatedActivity {
    verb: string;
    location_override?: string;
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
     * Returns null if no activity matches
     */
    evaluate(): EvaluatedActivity | null {
        for (const activity of this.activities) {
            if (this.evaluateActivity(activity)) {
                return {
                    verb: activity.verb,
                    location_override: activity.location_override,
                    show_preposition: activity.show_preposition,
                    icon: activity.icon
                };
            }
        }
        return null;
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

        // Look up the sensor in the person's namedSensors
        const sensor = this.person.namedSensors?.[key];
        if (!sensor) {
            return false; // Sensor not defined for this person
        }

        // Get the actual sensor state(s)
        const entityIds = Array.isArray(sensor.entity_id) ? sensor.entity_id : [sensor.entity_id];

        // Check if any of the entity states match the expected value
        for (const entityId of entityIds) {
            const entity = this.hass.states[entityId];
            if (!entity) continue;

            const actualValue = entity.state;

            // Evaluate the condition with operator support
            if (this.matchesValue(actualValue, expectedValue)) {
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

        // Parse operator from expected value
        const operatorMatch = expectedValue.match(/^(>=|<=|<>|>|<|=)(.+)$/);

        if (operatorMatch) {
            const operator = operatorMatch[1];
            const compareValue = operatorMatch[2].trim();

            return this.compareWithOperator(actualValue, operator, compareValue);
        }

        // No operator - direct string comparison
        return actualValue === expectedValue;
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
                case '<>': return actualNum !== compareNum;
            }
        }

        // Fall back to string comparison
        switch (operator) {
            case '=': return actualValue === compareValue;
            case '<>': return actualValue !== compareValue;
            case '>': return actualValue > compareValue;
            case '<': return actualValue < compareValue;
            case '>=': return actualValue >= compareValue;
            case '<=': return actualValue <= compareValue;
        }

        return false;
    }
}
