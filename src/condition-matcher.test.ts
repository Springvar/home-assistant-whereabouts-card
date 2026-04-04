import { describe, test, expect } from 'vitest';
import { matchConditions } from './condition-matcher';
import type { PersonConfig } from './types';

describe('matchConditions', () => {
    const createHass = (states: any) => ({ states });

    test('returns true when no conditions (vacuous truth)', () => {
        const hass = createHass({});
        const person: PersonConfig = { entity_id: 'person.john' };

        // Empty conditions = all conditions match (vacuous truth in AND logic)
        expect(matchConditions(hass, person, {})).toBe(true);
    });

    test('matches simple string condition', () => {
        const hass = createHass({
            'sensor.visibility': { state: 'hidden' }
        });
        const person: PersonConfig = {
            entity_id: 'person.john',
            namedSensors: {
                visibility: { entity_id: 'sensor.visibility' }
            }
        };

        expect(matchConditions(hass, person, { visibility: 'hidden' })).toBe(true);
        expect(matchConditions(hass, person, { visibility: 'visible' })).toBe(false);
    });

    test('matches array values with OR logic', () => {
        const hass = createHass({
            'sensor.status': { state: 'busy' }
        });
        const person: PersonConfig = {
            entity_id: 'person.john',
            namedSensors: {
                status: { entity_id: 'sensor.status' }
            }
        };

        expect(matchConditions(hass, person, { status: ['busy', 'working'] })).toBe(true);
        expect(matchConditions(hass, person, { status: ['free', 'available'] })).toBe(false);
    });

    test('matches with > operator', () => {
        const hass = createHass({
            'sensor.value': { state: '95' }
        });
        const person: PersonConfig = {
            entity_id: 'person.john',
            namedSensors: {
                value: { entity_id: 'sensor.value' }
            }
        };

        expect(matchConditions(hass, person, { value: '>90' })).toBe(true);
        expect(matchConditions(hass, person, { value: '>100' })).toBe(false);
    });

    test('matches with < operator', () => {
        const hass = createHass({
            'sensor.value': { state: '50' }
        });
        const person: PersonConfig = {
            entity_id: 'person.john',
            namedSensors: {
                value: { entity_id: 'sensor.value' }
            }
        };

        expect(matchConditions(hass, person, { value: '<60' })).toBe(true);
        expect(matchConditions(hass, person, { value: '<40' })).toBe(false);
    });

    test('matches with >= operator', () => {
        const hass = createHass({
            'sensor.value': { state: '90' }
        });
        const person: PersonConfig = {
            entity_id: 'person.john',
            namedSensors: {
                value: { entity_id: 'sensor.value' }
            }
        };

        expect(matchConditions(hass, person, { value: '>=90' })).toBe(true);
        expect(matchConditions(hass, person, { value: '>=91' })).toBe(false);
    });

    test('matches with <= operator', () => {
        const hass = createHass({
            'sensor.value': { state: '90' }
        });
        const person: PersonConfig = {
            entity_id: 'person.john',
            namedSensors: {
                value: { entity_id: 'sensor.value' }
            }
        };

        expect(matchConditions(hass, person, { value: '<=90' })).toBe(true);
        expect(matchConditions(hass, person, { value: '<=89' })).toBe(false);
    });

    test('matches with = operator', () => {
        const hass = createHass({
            'sensor.value': { state: '50' }
        });
        const person: PersonConfig = {
            entity_id: 'person.john',
            namedSensors: {
                value: { entity_id: 'sensor.value' }
            }
        };

        expect(matchConditions(hass, person, { value: '=50' })).toBe(true);
        expect(matchConditions(hass, person, { value: '=60' })).toBe(false);
    });

    test('matches with <> operator', () => {
        const hass = createHass({
            'sensor.value': { state: '50' }
        });
        const person: PersonConfig = {
            entity_id: 'person.john',
            namedSensors: {
                value: { entity_id: 'sensor.value' }
            }
        };

        expect(matchConditions(hass, person, { value: '<>60' })).toBe(true);
        expect(matchConditions(hass, person, { value: '<>50' })).toBe(false);
    });

    test('performs string comparison when values are not numeric', () => {
        const hass = createHass({
            'sensor.text': { state: 'beta' }
        });
        const person: PersonConfig = {
            entity_id: 'person.john',
            namedSensors: {
                text: { entity_id: 'sensor.text' }
            }
        };

        expect(matchConditions(hass, person, { text: '>alpha' })).toBe(true);
        expect(matchConditions(hass, person, { text: '<gamma' })).toBe(true);
    });

    test('requires all conditions to match (AND logic)', () => {
        const hass = createHass({
            'sensor.status': { state: 'active' },
            'sensor.level': { state: '80' }
        });
        const person: PersonConfig = {
            entity_id: 'person.john',
            namedSensors: {
                status: { entity_id: 'sensor.status' },
                level: { entity_id: 'sensor.level' }
            }
        };

        expect(matchConditions(hass, person, { status: 'active', level: '>70' })).toBe(true);
        expect(matchConditions(hass, person, { status: 'active', level: '>90' })).toBe(false);
        expect(matchConditions(hass, person, { status: 'inactive', level: '>70' })).toBe(false);
    });

    test('returns false when sensor entity does not exist', () => {
        const hass = createHass({});
        const person: PersonConfig = {
            entity_id: 'person.john',
            namedSensors: {
                missing: { entity_id: 'sensor.missing' }
            }
        };

        expect(matchConditions(hass, person, { missing: 'value' })).toBe(false);
    });

    test('returns false when named sensor is not defined for person', () => {
        const hass = createHass({
            'sensor.value': { state: 'test' }
        });
        const person: PersonConfig = {
            entity_id: 'person.john'
        };

        expect(matchConditions(hass, person, { value: 'test' })).toBe(false);
    });

    test('handles multiple entity IDs with OR logic', () => {
        const hass = createHass({
            'sensor.gps': { state: 'active' },
            'sensor.wifi': { state: 'inactive' }
        });
        const person: PersonConfig = {
            entity_id: 'person.john',
            namedSensors: {
                location: { entity_id: ['sensor.gps', 'sensor.wifi'] }
            }
        };

        expect(matchConditions(hass, person, { location: 'active' })).toBe(true);
    });

    test('handles multiple entity IDs where all are inactive', () => {
        const hass = createHass({
            'sensor.gps': { state: 'inactive' },
            'sensor.wifi': { state: 'inactive' }
        });
        const person: PersonConfig = {
            entity_id: 'person.john',
            namedSensors: {
                location: { entity_id: ['sensor.gps', 'sensor.wifi'] }
            }
        };

        expect(matchConditions(hass, person, { location: 'active' })).toBe(false);
    });

    test('handles array condition values with operators', () => {
        const hass = createHass({
            'sensor.value': { state: '95' }
        });
        const person: PersonConfig = {
            entity_id: 'person.john',
            namedSensors: {
                value: { entity_id: 'sensor.value' }
            }
        };

        expect(matchConditions(hass, person, { value: ['>90', '<100'] })).toBe(true);
    });

    test('returns false for empty sensor name', () => {
        const hass = createHass({});
        const person: PersonConfig = { entity_id: 'person.john' };

        expect(matchConditions(hass, person, { '': 'value' })).toBe(false);
    });

    test('matches "user" condition with user ID', () => {
        const hass = createHass({
            'person.john': { state: 'home', attributes: { user_id: 'user123' } }
        });
        hass.user = { id: 'user123', name: 'John Doe' };
        const person: PersonConfig = { entity_id: 'person.john' };

        expect(matchConditions(hass, person, { user: 'user123' })).toBe(true);
        expect(matchConditions(hass, person, { user: 'user456' })).toBe(false);
    });

    test('matches "user" condition with user name', () => {
        const hass = createHass({
            'person.john': { state: 'home', attributes: { user_id: 'user123' } }
        });
        hass.user = { id: 'user123', name: 'John Doe' };
        const person: PersonConfig = { entity_id: 'person.john' };

        expect(matchConditions(hass, person, { user: 'John Doe' })).toBe(true);
        expect(matchConditions(hass, person, { user: 'Jane Doe' })).toBe(false);
    });

    test('matches "user" condition with person entity_id', () => {
        const hass = createHass({
            'person.john': { state: 'home', attributes: { user_id: 'user123' } }
        });
        hass.user = { id: 'user123', name: 'John Doe' };
        const person: PersonConfig = { entity_id: 'person.john' };

        expect(matchConditions(hass, person, { user: 'person.john' })).toBe(true);
        expect(matchConditions(hass, person, { user: 'john' })).toBe(true);
    });

    test('matches "user" condition with array', () => {
        const hass = createHass({
            'person.john': { state: 'home', attributes: { user_id: 'user123' } }
        });
        hass.user = { id: 'user123', name: 'John Doe' };
        const person: PersonConfig = { entity_id: 'person.john' };

        expect(matchConditions(hass, person, { user: ['user456', 'user123'] })).toBe(true);
        expect(matchConditions(hass, person, { user: ['user789', 'user456'] })).toBe(false);
    });

    test('returns false for "user" condition when no user logged in', () => {
        const hass = createHass({
            'person.john': { state: 'home' }
        });
        // No hass.user
        const person: PersonConfig = { entity_id: 'person.john' };

        expect(matchConditions(hass, person, { user: 'user123' })).toBe(false);
    });
});
