import type { ActivityConditions, PersonConfig } from './types';

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

    // Look up the sensor in the person's namedSensors
    const sensor = person.namedSensors?.[key];
    if (!sensor) {
        return false; // Sensor not defined for this person
    }

    // Get the actual sensor state(s)
    const entityIds = Array.isArray(sensor.entity_id) ? sensor.entity_id : [sensor.entity_id];

    // Check if any of the entity states match the expected value
    for (const entityId of entityIds) {
        const entity = hass.states[entityId];
        if (!entity) continue;

        const actualValue = entity.state;

        // Evaluate the condition with operator support
        if (matchesValue(actualValue, expectedValue)) {
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
