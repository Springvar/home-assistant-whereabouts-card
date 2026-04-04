import type { ActivityConditions, PersonConfig } from './types';

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
 * Parse random condition value (percentage or decimal)
 * Returns probability as decimal (0-1) or null if invalid
 */
function parseRandomValue(value: string | string[]): number | null {
    const val = Array.isArray(value) ? value[0] : value;
    if (!val) return null;

    const trimmed = String(val).trim();

    // Handle percentage format (e.g., "50%", "75.5%")
    if (trimmed.endsWith('%')) {
        const num = parseFloat(trimmed.slice(0, -1));
        if (isNaN(num) || num < 0 || num > 100) return null;
        return num / 100;
    }

    // Handle decimal format (e.g., "0.5", "0.75")
    const num = parseFloat(trimmed);
    if (isNaN(num) || num < 0 || num > 1) return null;
    return num;
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

/**
 * Evaluates a set of conditions against a person's sensors
 * Returns true if all conditions match (AND logic)
 */
export function matchConditions(
    hass: any,
    person: PersonConfig,
    conditions: ActivityConditions
): boolean {
    // All conditions must match (AND logic)
    for (const [key, expectedValue] of Object.entries(conditions)) {
        if (!matchCondition(hass, person, key, expectedValue)) {
            return false;
        }
    }
    return true;
}

function matchCondition(
    hass: any,
    person: PersonConfig,
    key: string,
    expectedValue: string | string[]
): boolean {
    // Special case: "random" - probability check
    if (key === 'random') {
        const probability = parseRandomValue(expectedValue);
        if (probability === null) return false;
        return Math.random() < probability;
    }

    // Special case: "when" matches array of time periods (OR logic)
    if (key === 'when') {
        const periods = Array.isArray(expectedValue) ? expectedValue : [expectedValue];
        return periods.some(period => matchesWhenPeriod(period));
    }

    // Special case: temporal conditions
    if (key === 'is_workday') {
        return matchesValue(isWorkday() ? 'true' : 'false', expectedValue);
    }
    if (key === 'is_work_hours') {
        return matchesValue(isWorkHours() ? 'true' : 'false', expectedValue);
    }
    if (key === 'is_night') {
        return matchesValue(isNight() ? 'true' : 'false', expectedValue);
    }
    if (key === 'is_morning') {
        return matchesValue(isMorning() ? 'true' : 'false', expectedValue);
    }
    if (key === 'is_afternoon') {
        return matchesValue(isAfternoon() ? 'true' : 'false', expectedValue);
    }
    if (key === 'is_evening') {
        return matchesValue(isEvening() ? 'true' : 'false', expectedValue);
    }
    if (key === 'day') {
        return matchesValue(getCurrentDay(), expectedValue);
    }

    // Special case: "who" matches against person being evaluated
    if (key === 'who') {
        const expectedValues = Array.isArray(expectedValue) ? expectedValue : [expectedValue];
        const currentUser = hass.user;
        const personEntity = hass.states[person.entity_id];

        return expectedValues.some(expected => {
            // Special case: "user" matches if this person is the logged-in user
            if (expected === 'user') {
                if (!currentUser || !personEntity) return false;
                return personEntity.attributes?.user_id === currentUser.id;
            }

            // Match person entity ID
            if (expected === person.entity_id) return true;
            // Match person entity ID without prefix
            if (expected === person.entity_id.replace('person.', '')) return true;
            // Match custom person name
            if (person.name && expected === person.name) return true;
            // Match entity friendly name
            if (personEntity?.attributes?.friendly_name === expected) return true;

            return false;
        });
    }

    // Special case: "user" matches against current Home Assistant user
    if (key === 'user') {
        const expectedValues = Array.isArray(expectedValue) ? expectedValue : [expectedValue];
        const currentUser = hass.user;
        if (!currentUser) return false;

        return expectedValues.some(expected => {
            if (expected === currentUser.id) return true;
            if (expected === currentUser.name) return true;

            const personEntity = hass.states[person.entity_id];
            if (personEntity?.attributes?.user_id === currentUser.id) {
                if (expected === person.entity_id ||
                    expected === person.entity_id.replace('person.', '') ||
                    expected === person.name) {
                    return true;
                }
            }
            return false;
        });
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
    const sensor = person.namedSensors?.[sensorKey];
    if (!sensor) {
        return false; // Sensor not defined for this person
    }

    // Get the actual sensor state(s)
    const entityIds = Array.isArray(sensor.entity_id) ? sensor.entity_id : [sensor.entity_id];

    // Check if any of the entity states match the expected value
    for (const entityId of entityIds) {
        const entity = hass.states[entityId];
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
        if (matchesValue(actualValueStr, expectedValue)) {
            return true;
        }
    }

    return false;
}

function matchesValue(actualValue: string, expectedValue: string | string[]): boolean {
    // If array, check if actual value matches any in the array
    if (Array.isArray(expectedValue)) {
        return expectedValue.some(val => matchesValue(actualValue, val));
    }

    // Check for ! prefix (boolean false check)
    if (expectedValue.startsWith('!')) {
        const checkValue = expectedValue.substring(1).trim();
        if (!checkValue) {
            // Just "!" - check if actualValue is falsy
            return isFalsy(actualValue);
        }
        // "!value" - check if actualValue != value
        return actualValue !== checkValue;
    }

    // Parse operator from expected value (now includes !=)
    const operatorMatch = expectedValue.match(/^(>=|<=|!=|<>|>|<|=)(.+)$/);

    if (operatorMatch) {
        const operator = operatorMatch[1];
        const compareValue = operatorMatch[2].trim();

        return compareWithOperator(actualValue, operator, compareValue);
    }

    // No operator - direct string comparison
    return actualValue === expectedValue;
}

function isFalsy(value: string): boolean {
    const normalized = value.toLowerCase().trim();
    return normalized === '' ||
           normalized === '0' ||
           normalized === 'false' ||
           normalized === 'off' ||
           normalized === 'no' ||
           normalized === 'unavailable' ||
           normalized === 'unknown';
}

function compareWithOperator(actualValue: string, operator: string, compareValue: string): boolean {
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
