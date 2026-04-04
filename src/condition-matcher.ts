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

    // Parse operator from expected value
    const operatorMatch = expectedValue.match(/^(>=|<=|<>|>|<|=)(.+)$/);

    if (operatorMatch) {
        const operator = operatorMatch[1];
        const compareValue = operatorMatch[2].trim();

        return compareWithOperator(actualValue, operator, compareValue);
    }

    // No operator - direct string comparison
    return actualValue === expectedValue;
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
