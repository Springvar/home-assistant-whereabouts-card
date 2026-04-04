import { describe, test, expect } from 'vitest';
import { ActivityEvaluator } from './activity-evaluator';
import type { Activity, PersonConfig } from './types';
import type { ZoneGroup } from './whereabouts-card';

describe('ActivityEvaluator', () => {
    const createHass = (states: any) => ({ states });

    test('returns null when no activities are configured', () => {
        const hass = createHass({
            'person.john': { state: 'home' }
        });
        const person: PersonConfig = { entity_id: 'person.john' };
        const evaluator = new ActivityEvaluator(hass, person, [], []);

        expect(evaluator.evaluate()).toBeNull();
    });

    test('matches activity with simple sensor condition', () => {
        const hass = createHass({
            'person.john': { state: 'home' },
            'sensor.john_activity': { state: 'working' }
        });
        const person: PersonConfig = {
            entity_id: 'person.john',
            namedSensors: {
                activity: { entity_id: 'sensor.john_activity' }
            }
        };
        const activities: Activity[] = [{
            verb: 'is working',
            icon: 'mdi:briefcase',
            conditions: { activity: 'working' }
        }];
        const evaluator = new ActivityEvaluator(hass, person, activities, []);

        const result = evaluator.evaluate();
        expect(result).toEqual({
            verb: 'is working',
            icon: 'mdi:briefcase',
            location_override: undefined,
            show_preposition: undefined
        });
    });

    test('returns first matching activity when multiple match', () => {
        const hass = createHass({
            'person.john': { state: 'home' },
            'sensor.john_activity': { state: 'gaming' }
        });
        const person: PersonConfig = {
            entity_id: 'person.john',
            namedSensors: {
                activity: { entity_id: 'sensor.john_activity' }
            }
        };
        const activities: Activity[] = [
            {
                verb: 'is gaming',
                icon: 'mdi:gamepad',
                conditions: { activity: 'gaming' }
            },
            {
                verb: 'is also gaming',
                conditions: { activity: 'gaming' }
            }
        ];
        const evaluator = new ActivityEvaluator(hass, person, activities, []);

        const result = evaluator.evaluate();
        expect(result?.verb).toBe('is gaming');
        expect(result?.icon).toBe('mdi:gamepad');
    });

    test('evaluates "who" condition with entity_id', () => {
        const hass = createHass({
            'person.john': { state: 'home', attributes: { friendly_name: 'John Doe' } }
        });
        const person: PersonConfig = { entity_id: 'person.john' };
        const activities: Activity[] = [{
            verb: 'is special',
            conditions: { who: 'person.john' }
        }];
        const evaluator = new ActivityEvaluator(hass, person, activities, []);

        expect(evaluator.evaluate()).not.toBeNull();
    });

    test('evaluates "who" condition with name', () => {
        const hass = createHass({
            'person.john': { state: 'home', attributes: { friendly_name: 'John Doe' } }
        });
        const person: PersonConfig = {
            entity_id: 'person.john',
            name: 'John Doe'
        };
        const activities: Activity[] = [{
            verb: 'is special',
            conditions: { who: 'John Doe' }
        }];
        const evaluator = new ActivityEvaluator(hass, person, activities, []);

        expect(evaluator.evaluate()).not.toBeNull();
    });

    test('evaluates "who" condition with entity_id without prefix', () => {
        const hass = createHass({
            'person.john': { state: 'home', attributes: { friendly_name: 'John Doe' } }
        });
        const person: PersonConfig = { entity_id: 'person.john' };
        const activities: Activity[] = [{
            verb: 'is special',
            conditions: { who: 'john' }
        }];
        const evaluator = new ActivityEvaluator(hass, person, activities, []);

        expect(evaluator.evaluate()).not.toBeNull();
    });

    test('evaluates "who" condition with array', () => {
        const hass = createHass({
            'person.jane': { state: 'home', attributes: { friendly_name: 'Jane Doe' } }
        });
        const person: PersonConfig = { entity_id: 'person.jane' };
        const activities: Activity[] = [{
            verb: 'is in group',
            conditions: { who: ['person.john', 'person.jane'] }
        }];
        const evaluator = new ActivityEvaluator(hass, person, activities, []);

        expect(evaluator.evaluate()).not.toBeNull();
    });

    test('evaluates "where" condition with zone entity ID', () => {
        const hass = createHass({
            'person.john': { state: 'office' },
            'zone.office': { state: '', attributes: { friendly_name: 'Office' } }
        });
        const person: PersonConfig = { entity_id: 'person.john' };
        const activities: Activity[] = [{
            verb: 'is working',
            conditions: { where: 'zone.office' }
        }];
        const evaluator = new ActivityEvaluator(hass, person, activities, []);

        expect(evaluator.evaluate()).not.toBeNull();
    });

    test('evaluates "where" condition with zone name', () => {
        const hass = createHass({
            'person.john': { state: 'office' },
            'zone.office': { state: '', attributes: { friendly_name: 'Office' } }
        });
        const person: PersonConfig = { entity_id: 'person.john' };
        const activities: Activity[] = [{
            verb: 'is working',
            conditions: { where: 'office' }
        }];
        const evaluator = new ActivityEvaluator(hass, person, activities, []);

        expect(evaluator.evaluate()).not.toBeNull();
    });

    test('evaluates "where" condition with zone friendly name', () => {
        const hass = createHass({
            'person.john': { state: 'office' },
            'zone.office': { state: '', attributes: { friendly_name: 'Office' } }
        });
        const person: PersonConfig = { entity_id: 'person.john' };
        const activities: Activity[] = [{
            verb: 'is working',
            conditions: { where: 'Office' }
        }];
        const evaluator = new ActivityEvaluator(hass, person, activities, []);

        expect(evaluator.evaluate()).not.toBeNull();
    });

    test('evaluates "where" condition with zone group name', () => {
        const hass = createHass({
            'person.john': { state: 'office' },
            'zone.office': { state: '', attributes: { friendly_name: 'Office' } }
        });
        const person: PersonConfig = { entity_id: 'person.john' };
        const zoneGroups: ZoneGroup[] = [{
            name: 'work',
            zones: ['zone.office', 'zone.laboratory']
        }];
        const activities: Activity[] = [{
            verb: 'is working',
            conditions: { where: 'work' }
        }];
        const evaluator = new ActivityEvaluator(hass, person, activities, zoneGroups);

        expect(evaluator.evaluate()).not.toBeNull();
    });

    test('evaluates "where" condition with array', () => {
        const hass = createHass({
            'person.john': { state: 'office' },
            'zone.office': { state: '', attributes: { friendly_name: 'Office' } }
        });
        const person: PersonConfig = { entity_id: 'person.john' };
        const activities: Activity[] = [{
            verb: 'is at location',
            conditions: { where: ['zone.home', 'zone.office'] }
        }];
        const evaluator = new ActivityEvaluator(hass, person, activities, []);

        expect(evaluator.evaluate()).not.toBeNull();
    });

    test('uses numeric comparison operators', () => {
        const hass = createHass({
            'person.john': { state: 'home' },
            'sensor.john_confidence': { state: '95' }
        });
        const person: PersonConfig = {
            entity_id: 'person.john',
            namedSensors: {
                confidence: { entity_id: 'sensor.john_confidence' }
            }
        };
        const activities: Activity[] = [{
            verb: 'is confident',
            conditions: { confidence: '>90' }
        }];
        const evaluator = new ActivityEvaluator(hass, person, activities, []);

        expect(evaluator.evaluate()).not.toBeNull();
    });

    test('supports all comparison operators', () => {
        const hass = createHass({
            'person.john': { state: 'home' },
            'sensor.value': { state: '50' }
        });
        const person: PersonConfig = {
            entity_id: 'person.john',
            namedSensors: {
                value: { entity_id: 'sensor.value' }
            }
        };

        // Test with value = 50
        const testCases = [
            { condition: '>40', expected: true },
            { condition: '<60', expected: true },
            { condition: '>=50', expected: true },
            { condition: '<=50', expected: true },
            { condition: '=50', expected: true },
            { condition: '<>60', expected: true },
            { condition: '>50', expected: false },
            { condition: '<50', expected: false },
            { condition: '>=51', expected: false },
            { condition: '<=49', expected: false },
            { condition: '=60', expected: false },
            { condition: '<>50', expected: false }
        ];

        for (const { condition, expected } of testCases) {
            const activities: Activity[] = [{
                verb: 'matches',
                conditions: { value: condition }
            }];
            const evaluator = new ActivityEvaluator(hass, person, activities, []);
            const result = evaluator.evaluate();
            expect(result !== null).toBe(expected);
        }
    });

    test('matches array values with OR logic', () => {
        const hass = createHass({
            'person.john': { state: 'home' },
            'sensor.john_status': { state: 'busy' }
        });
        const person: PersonConfig = {
            entity_id: 'person.john',
            namedSensors: {
                status: { entity_id: 'sensor.john_status' }
            }
        };
        const activities: Activity[] = [{
            verb: 'is occupied',
            conditions: { status: ['busy', 'working'] }
        }];
        const evaluator = new ActivityEvaluator(hass, person, activities, []);

        expect(evaluator.evaluate()).not.toBeNull();
    });

    test('returns null when sensor not found', () => {
        const hass = createHass({
            'person.john': { state: 'home' }
        });
        const person: PersonConfig = {
            entity_id: 'person.john',
            namedSensors: {
                activity: { entity_id: 'sensor.john_activity' }
            }
        };
        const activities: Activity[] = [{
            verb: 'is working',
            conditions: { activity: 'working' }
        }];
        const evaluator = new ActivityEvaluator(hass, person, activities, []);

        expect(evaluator.evaluate()).toBeNull();
    });

    test('returns null when named sensor not defined', () => {
        const hass = createHass({
            'person.john': { state: 'home' }
        });
        const person: PersonConfig = { entity_id: 'person.john' };
        const activities: Activity[] = [{
            verb: 'is working',
            conditions: { activity: 'working' }
        }];
        const evaluator = new ActivityEvaluator(hass, person, activities, []);

        expect(evaluator.evaluate()).toBeNull();
    });

    test('returns all activity properties including location_override and show_preposition', () => {
        const hass = createHass({
            'person.john': { state: 'office' },
            'sensor.john_activity': { state: 'working' }
        });
        const person: PersonConfig = {
            entity_id: 'person.john',
            namedSensors: {
                activity: { entity_id: 'sensor.john_activity' }
            }
        };
        const activities: Activity[] = [{
            verb: 'is working',
            icon: 'mdi:briefcase',
            location_override: '-',
            show_preposition: false,
            conditions: { activity: 'working' }
        }];
        const evaluator = new ActivityEvaluator(hass, person, activities, []);

        const result = evaluator.evaluate();
        expect(result).toEqual({
            verb: 'is working',
            icon: 'mdi:briefcase',
            location_override: '-',
            show_preposition: false
        });
    });

    test('evaluates "user" condition with user ID', () => {
        const hass = createHass({
            'person.john': { state: 'home', attributes: { user_id: 'user123' } }
        });
        hass.user = { id: 'user123', name: 'John Doe' };
        const person: PersonConfig = { entity_id: 'person.john' };
        const activities: Activity[] = [{
            verb: 'is you',
            conditions: { user: 'user123' }
        }];
        const evaluator = new ActivityEvaluator(hass, person, activities, []);

        expect(evaluator.evaluate()).not.toBeNull();
    });

    test('evaluates "user" condition with user name', () => {
        const hass = createHass({
            'person.john': { state: 'home', attributes: { user_id: 'user123' } }
        });
        hass.user = { id: 'user123', name: 'John Doe' };
        const person: PersonConfig = { entity_id: 'person.john' };
        const activities: Activity[] = [{
            verb: 'is you',
            conditions: { user: 'John Doe' }
        }];
        const evaluator = new ActivityEvaluator(hass, person, activities, []);

        expect(evaluator.evaluate()).not.toBeNull();
    });

    test('evaluates "user" condition with person entity_id', () => {
        const hass = createHass({
            'person.john': { state: 'home', attributes: { user_id: 'user123' } }
        });
        hass.user = { id: 'user123', name: 'John Doe' };
        const person: PersonConfig = { entity_id: 'person.john' };
        const activities: Activity[] = [{
            verb: 'is you',
            conditions: { user: 'person.john' }
        }];
        const evaluator = new ActivityEvaluator(hass, person, activities, []);

        expect(evaluator.evaluate()).not.toBeNull();
    });

    test('evaluates "user" condition with array', () => {
        const hass = createHass({
            'person.john': { state: 'home', attributes: { user_id: 'user123' } }
        });
        hass.user = { id: 'user123', name: 'John Doe' };
        const person: PersonConfig = { entity_id: 'person.john' };
        const activities: Activity[] = [{
            verb: 'is admin',
            conditions: { user: ['user456', 'user123'] }
        }];
        const evaluator = new ActivityEvaluator(hass, person, activities, []);

        expect(evaluator.evaluate()).not.toBeNull();
    });

    test('returns null when "user" does not match', () => {
        const hass = createHass({
            'person.john': { state: 'home', attributes: { user_id: 'user123' } }
        });
        hass.user = { id: 'user456', name: 'Jane Doe' };
        const person: PersonConfig = { entity_id: 'person.john' };
        const activities: Activity[] = [{
            verb: 'is you',
            conditions: { user: 'user123' }
        }];
        const evaluator = new ActivityEvaluator(hass, person, activities, []);

        expect(evaluator.evaluate()).toBeNull();
    });

    test('returns null when no user is logged in', () => {
        const hass = createHass({
            'person.john': { state: 'home' }
        });
        // No hass.user
        const person: PersonConfig = { entity_id: 'person.john' };
        const activities: Activity[] = [{
            verb: 'is you',
            conditions: { user: 'user123' }
        }];
        const evaluator = new ActivityEvaluator(hass, person, activities, []);

        expect(evaluator.evaluate()).toBeNull();
    });

    test('evaluates multiple conditions with AND logic', () => {
        const hass = createHass({
            'person.john': { state: 'office' },
            'sensor.john_activity': { state: 'working' },
            'sensor.john_confidence': { state: '95' }
        });
        const person: PersonConfig = {
            entity_id: 'person.john',
            namedSensors: {
                activity: { entity_id: 'sensor.john_activity' },
                confidence: { entity_id: 'sensor.john_confidence' }
            }
        };
        const activities: Activity[] = [{
            verb: 'is definitely working',
            conditions: {
                activity: 'working',
                confidence: '>90'
            }
        }];
        const evaluator = new ActivityEvaluator(hass, person, activities, []);

        expect(evaluator.evaluate()).not.toBeNull();
    });

    test('returns null when one condition fails in AND logic', () => {
        const hass = createHass({
            'person.john': { state: 'office' },
            'sensor.john_activity': { state: 'working' },
            'sensor.john_confidence': { state: '85' }
        });
        const person: PersonConfig = {
            entity_id: 'person.john',
            namedSensors: {
                activity: { entity_id: 'sensor.john_activity' },
                confidence: { entity_id: 'sensor.john_confidence' }
            }
        };
        const activities: Activity[] = [{
            verb: 'is definitely working',
            conditions: {
                activity: 'working',
                confidence: '>90'
            }
        }];
        const evaluator = new ActivityEvaluator(hass, person, activities, []);

        expect(evaluator.evaluate()).toBeNull();
    });
});
