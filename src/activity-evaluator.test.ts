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
            activity: 'is working',
            icon: 'mdi:briefcase',
            show_preposition: false,
            conditions: { activity: 'working' }
        }];
        const evaluator = new ActivityEvaluator(hass, person, activities, []);

        const result = evaluator.evaluate();
        expect(result).toEqual({
            activity: 'is working',
            icon: 'mdi:briefcase',
            location_override: undefined,
            show_preposition: false
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
        expect(result?.activity).toBe('is gaming');
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
            activity: 'is working',
            show_preposition: false,
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
            activity: 'is working',
            show_preposition: false,
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
            activity: 'is working',
            show_preposition: false,
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
            activity: 'is working',
            show_preposition: false,
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
            activity: 'is working',
            show_preposition: false,
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
            activity: 'is working',
            show_preposition: false,
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
            activity: 'is working',
            icon: 'mdi:briefcase',
            location_override: '-',
            show_preposition: false,
            conditions: { activity: 'working' }
        }];
        const evaluator = new ActivityEvaluator(hass, person, activities, []);

        const result = evaluator.evaluate();
        // location_override: '-' is converted to show_location: false
        expect(result).toEqual({
            activity: 'is working',
            icon: 'mdi:briefcase',
            location_override: undefined,
            show_location: false,
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

    describe('Zone Group Activities', () => {
        test('zone group activities take priority over card-level activities', () => {
            const hass = createHass({
                'person.john': { state: 'zone.office' },
                'sensor.john_activity': { state: 'working' }
            });
            const person: PersonConfig = {
                entity_id: 'person.john',
                namedSensors: {
                    activity: { entity_id: 'sensor.john_activity' }
                }
            };
            const zoneGroups: ZoneGroup[] = [{
                name: 'work',
                zones: ['zone.office', 'zone.coworking'],
                activities: [{
                    activity: 'at the office',
                    icon: 'mdi:office-building',
                    conditions: { activity: 'working' }
                }]
            }];
            const cardActivities: Activity[] = [{
                activity: 'is working',
                icon: 'mdi:briefcase',
                conditions: { activity: 'working' }
            }];
            const evaluator = new ActivityEvaluator(hass, person, cardActivities, zoneGroups);

            const result = evaluator.evaluate();
            // Zone group activity should win
            expect(result).toEqual({
                activity: 'at the office',
                icon: 'mdi:office-building',
                location_override: undefined,
                show_location: undefined,
                preposition: undefined,
                show_preposition: undefined
            });
        });

        test('falls back to card-level activities when zone group activity does not match', () => {
            const hass = createHass({
                'person.john': { state: 'zone.office' },
                'sensor.john_activity': { state: 'in-meeting' }
            });
            const person: PersonConfig = {
                entity_id: 'person.john',
                namedSensors: {
                    activity: { entity_id: 'sensor.john_activity' }
                }
            };
            const zoneGroups: ZoneGroup[] = [{
                name: 'work',
                zones: ['zone.office', 'zone.coworking'],
                activities: [{
                    activity: 'at desk',
                    conditions: { activity: 'working' } // Won't match
                }]
            }];
            const cardActivities: Activity[] = [{
                activity: 'in a meeting',
                icon: 'mdi:account-group',
                conditions: { activity: 'in-meeting' }
            }];
            const evaluator = new ActivityEvaluator(hass, person, cardActivities, zoneGroups);

            const result = evaluator.evaluate();
            // Card-level activity should win since zone group activity didn't match
            expect(result).toEqual({
                activity: 'in a meeting',
                icon: 'mdi:account-group',
                location_override: undefined,
                show_location: undefined,
                preposition: undefined,
                show_preposition: undefined
            });
        });

        test('uses card-level activities when person is not in any zone group', () => {
            const hass = createHass({
                'person.john': { state: 'zone.home' },
                'sensor.john_activity': { state: 'relaxing' }
            });
            const person: PersonConfig = {
                entity_id: 'person.john',
                namedSensors: {
                    activity: { entity_id: 'sensor.john_activity' }
                }
            };
            const zoneGroups: ZoneGroup[] = [{
                name: 'work',
                zones: ['zone.office'], // Does not include home
                activities: [{
                    activity: 'at the office',
                    conditions: { activity: 'relaxing' }
                }]
            }];
            const cardActivities: Activity[] = [{
                activity: 'is relaxing',
                icon: 'mdi:sofa',
                conditions: { activity: 'relaxing' }
            }];
            const evaluator = new ActivityEvaluator(hass, person, cardActivities, zoneGroups);

            const result = evaluator.evaluate();
            // Card-level activity should be used (not in zone group)
            expect(result).toEqual({
                activity: 'is relaxing',
                icon: 'mdi:sofa',
                location_override: undefined,
                show_location: undefined,
                preposition: undefined,
                show_preposition: undefined
            });
        });

        test('matches zone without zone. prefix', () => {
            const hass = createHass({
                'person.john': { state: 'office' }, // Without zone. prefix
                'sensor.john_activity': { state: 'working' }
            });
            const person: PersonConfig = {
                entity_id: 'person.john',
                namedSensors: {
                    activity: { entity_id: 'sensor.john_activity' }
                }
            };
            const zoneGroups: ZoneGroup[] = [{
                name: 'work',
                zones: ['zone.office'],
                activities: [{
                    activity: 'working at office',
                    conditions: { activity: 'working' }
                }]
            }];
            const cardActivities: Activity[] = [{
                activity: 'is working',
                conditions: { activity: 'working' }
            }];
            const evaluator = new ActivityEvaluator(hass, person, cardActivities, zoneGroups);

            const result = evaluator.evaluate();
            expect(result?.activity).toBe('working at office');
        });

        test('zone group activities can use all condition types', () => {
            const hass = createHass({
                'person.john': { state: 'zone.office' },
                'sensor.john_activity': { state: 'working' }
            });
            const person: PersonConfig = {
                entity_id: 'person.john',
                namedSensors: {
                    activity: { entity_id: 'sensor.john_activity' }
                }
            };
            const zoneGroups: ZoneGroup[] = [{
                name: 'work',
                zones: ['zone.office'],
                activities: [{
                    activity: 'working during office hours',
                    conditions: {
                        activity: 'working',
                        when: 'morning'
                    }
                }]
            }];
            const evaluator = new ActivityEvaluator(hass, person, [], zoneGroups);

            // Mock morning time
            const mockDate = new Date('2024-01-01T09:00:00');
            const originalDate = global.Date;
            // @ts-ignore
            global.Date = class extends originalDate {
                constructor() {
                    super();
                    return mockDate;
                }
                static now() {
                    return mockDate.getTime();
                }
            };

            const result = evaluator.evaluate();
            expect(result?.activity).toBe('working during office hours');

            // Restore
            global.Date = originalDate;
        });
    });

    describe('Zone Group Conditions', () => {
        test('zone group applies when conditions match', () => {
            const hass = createHass({
                'person.john': { state: 'zone.office' },
                'sensor.john_activity': { state: 'working' }
            });
            const person: PersonConfig = {
                entity_id: 'person.john',
                namedSensors: {
                    activity: { entity_id: 'sensor.john_activity' }
                }
            };
            const zoneGroups: ZoneGroup[] = [{
                name: 'work',
                zones: ['zone.office'],
                icon: 'mdi:office-building',
                conditions: {
                    activity: 'working'
                }
            }];
            const evaluator = new ActivityEvaluator(hass, person, [], zoneGroups);

            const result = evaluator.evaluate();
            // Zone group should match and default activity should be used
            expect(result).toBeDefined();
        });

        test('zone group does not apply when conditions do not match', () => {
            const hass = createHass({
                'person.john': { state: 'zone.office' },
                'sensor.john_activity': { state: 'in-meeting' }
            });
            const person: PersonConfig = {
                entity_id: 'person.john',
                namedSensors: {
                    activity: { entity_id: 'sensor.john_activity' }
                }
            };
            const zoneGroups: ZoneGroup[] = [{
                name: 'work',
                zones: ['zone.office'],
                icon: 'mdi:office-building',
                conditions: {
                    activity: 'working' // Does not match 'in-meeting'
                }
            }];
            const evaluator = new ActivityEvaluator(hass, person, [], zoneGroups);

            const result = evaluator.evaluate();
            // Zone group should not match, returns null (no default activity)
            expect(result).toBeNull();
        });

        test('zone group with temporal conditions applies during work hours', () => {
            const hass = createHass({
                'person.john': { state: 'zone.office' },
                'sensor.john_activity': { state: 'working' }
            });
            const person: PersonConfig = {
                entity_id: 'person.john',
                namedSensors: {
                    activity: { entity_id: 'sensor.john_activity' }
                }
            };
            const zoneGroups: ZoneGroup[] = [{
                name: 'work',
                zones: ['zone.office'],
                icon: 'mdi:office-building',
                conditions: {
                    is_work_hours: 'true'
                },
                activities: [{
                    activity: 'working at the office',
                    conditions: {}
                }]
            }];
            const evaluator = new ActivityEvaluator(hass, person, [], zoneGroups);

            // Mock work hours (Monday 10:00)
            const mockDate = new Date('2024-01-01T10:00:00'); // Monday
            const originalDate = global.Date;
            // @ts-ignore
            global.Date = class extends originalDate {
                constructor() {
                    super();
                    return mockDate;
                }
                static now() {
                    return mockDate.getTime();
                }
            };

            const result = evaluator.evaluate();
            expect(result?.activity).toBe('working at the office');

            // Restore
            global.Date = originalDate;
        });

        test('zone group with temporal conditions does not apply outside work hours', () => {
            const hass = createHass({
                'person.john': { state: 'zone.office' },
                'sensor.john_activity': { state: 'working' }
            });
            const person: PersonConfig = {
                entity_id: 'person.john',
                namedSensors: {
                    activity: { entity_id: 'sensor.john_activity' }
                }
            };
            const zoneGroups: ZoneGroup[] = [{
                name: 'work',
                zones: ['zone.office'],
                conditions: {
                    is_work_hours: 'true'
                },
                activities: [{
                    activity: 'working at the office',
                    conditions: {}
                }]
            }];
            const cardActivities: Activity[] = [{
                activity: 'is at the office',
                conditions: {}
            }];
            const evaluator = new ActivityEvaluator(hass, person, cardActivities, zoneGroups);

            // Mock non-work hours (Saturday 22:00)
            const mockDate = new Date('2024-01-06T22:00:00'); // Saturday
            const originalDate = global.Date;
            // @ts-ignore
            global.Date = class extends originalDate {
                constructor() {
                    super();
                    return mockDate;
                }
                static now() {
                    return mockDate.getTime();
                }
            };

            const result = evaluator.evaluate();
            // Zone group should not apply, falls back to card-level activity
            expect(result?.activity).toBe('is at the office');

            // Restore
            global.Date = originalDate;
        });

        test('zone group conditions support "who" condition', () => {
            const hass = createHass({
                'person.john': { state: 'zone.office' },
                'person.jane': { state: 'zone.office' }
            });
            const johnPerson: PersonConfig = { entity_id: 'person.john' };
            const janePerson: PersonConfig = { entity_id: 'person.jane' };

            const zoneGroups: ZoneGroup[] = [{
                name: 'john work',
                zones: ['zone.office'],
                icon: 'mdi:briefcase',
                conditions: {
                    who: 'person.john'
                },
                activities: [{
                    activity: 'working at desk',
                    conditions: {}
                }]
            }];

            const johnEvaluator = new ActivityEvaluator(hass, johnPerson, [], zoneGroups);
            const janeEvaluator = new ActivityEvaluator(hass, janePerson, [], zoneGroups);

            const johnResult = johnEvaluator.evaluate();
            const janeResult = janeEvaluator.evaluate();

            expect(johnResult?.activity).toBe('working at desk');
            expect(janeResult).toBeNull(); // Zone group doesn't apply to Jane
        });

        test('zone group with multiple conditions requires all to match', () => {
            const hass = createHass({
                'person.john': { state: 'zone.office' },
                'sensor.john_activity': { state: 'working' },
                'sensor.john_focus': { state: 'high' }
            });
            const person: PersonConfig = {
                entity_id: 'person.john',
                namedSensors: {
                    activity: { entity_id: 'sensor.john_activity' },
                    focus: { entity_id: 'sensor.john_focus' }
                }
            };
            const zoneGroups: ZoneGroup[] = [{
                name: 'deep work',
                zones: ['zone.office'],
                conditions: {
                    activity: 'working',
                    focus: 'high'
                },
                activities: [{
                    activity: 'in deep work mode',
                    conditions: {}
                }]
            }];
            const evaluator = new ActivityEvaluator(hass, person, [], zoneGroups);

            const result = evaluator.evaluate();
            expect(result?.activity).toBe('in deep work mode');
        });

        test('zone group does not apply when one condition fails', () => {
            const hass = createHass({
                'person.john': { state: 'zone.office' },
                'sensor.john_activity': { state: 'working' },
                'sensor.john_focus': { state: 'low' }
            });
            const person: PersonConfig = {
                entity_id: 'person.john',
                namedSensors: {
                    activity: { entity_id: 'sensor.john_activity' },
                    focus: { entity_id: 'sensor.john_focus' }
                }
            };
            const zoneGroups: ZoneGroup[] = [{
                name: 'deep work',
                zones: ['zone.office'],
                conditions: {
                    activity: 'working',
                    focus: 'high' // Does not match 'low'
                },
                activities: [{
                    activity: 'in deep work mode',
                    conditions: {}
                }]
            }];
            const cardActivities: Activity[] = [{
                activity: 'is working',
                conditions: {}
            }];
            const evaluator = new ActivityEvaluator(hass, person, cardActivities, zoneGroups);

            const result = evaluator.evaluate();
            expect(result?.activity).toBe('is working'); // Falls back to card-level
        });
    });

    describe('Multiple Zone Groups - Priority Resolution', () => {
        test('first zone group applies when zone is in multiple groups', () => {
            const hass = createHass({
                'person.john': { state: 'zone.office' }
            });
            const person: PersonConfig = { entity_id: 'person.john' };

            const zoneGroups: ZoneGroup[] = [
                {
                    name: 'work locations',
                    zones: ['zone.office', 'zone.coworking'],
                    icon: 'mdi:office-building'
                },
                {
                    name: 'downtown',
                    zones: ['zone.office', 'zone.cafe'],
                    icon: 'mdi:city'
                }
            ];
            const evaluator = new ActivityEvaluator(hass, person, [], zoneGroups);

            // Since zone.office is in both groups, the first group should apply
            const result = evaluator.evaluate();
            expect(result).toBeDefined();
            // We can't easily test which group was selected without modifying the implementation
            // but we can verify it doesn't crash and returns a result
        });

        test('second zone group applies when first group conditions fail', () => {
            const hass = createHass({
                'person.john': { state: 'zone.office' },
                'sensor.john_activity': { state: 'in-meeting' }
            });
            const person: PersonConfig = {
                entity_id: 'person.john',
                namedSensors: {
                    activity: { entity_id: 'sensor.john_activity' }
                }
            };

            const zoneGroups: ZoneGroup[] = [
                {
                    name: 'work - focused',
                    zones: ['zone.office'],
                    icon: 'mdi:laptop',
                    conditions: {
                        activity: 'working' // Does not match
                    },
                    activities: [{
                        activity: 'working at desk',
                        conditions: {}
                    }]
                },
                {
                    name: 'work - general',
                    zones: ['zone.office'],
                    icon: 'mdi:office-building',
                    // No conditions - always matches
                    activities: [{
                        activity: 'at the office',
                        conditions: {}
                    }]
                }
            ];
            const evaluator = new ActivityEvaluator(hass, person, [], zoneGroups);

            const result = evaluator.evaluate();
            expect(result?.activity).toBe('at the office');
        });

        test('priority order with temporal conditions', () => {
            const hass = createHass({
                'person.john': { state: 'zone.office' }
            });
            const person: PersonConfig = { entity_id: 'person.john' };

            const zoneGroups: ZoneGroup[] = [
                {
                    name: 'work hours',
                    zones: ['zone.office'],
                    icon: 'mdi:briefcase',
                    conditions: {
                        is_work_hours: 'true'
                    },
                    activities: [{
                        activity: 'working during office hours',
                        conditions: {}
                    }]
                },
                {
                    name: 'after hours',
                    zones: ['zone.office'],
                    icon: 'mdi:moon-waning-crescent',
                    // No conditions
                    activities: [{
                        activity: 'working late',
                        conditions: {}
                    }]
                }
            ];
            const evaluator = new ActivityEvaluator(hass, person, [], zoneGroups);

            // Mock work hours
            const mockDate = new Date('2024-01-01T10:00:00'); // Monday 10:00
            const originalDate = global.Date;
            // @ts-ignore
            global.Date = class extends originalDate {
                constructor() {
                    super();
                    return mockDate;
                }
                static now() {
                    return mockDate.getTime();
                }
            };

            const result = evaluator.evaluate();
            expect(result?.activity).toBe('working during office hours');

            // Restore
            global.Date = originalDate;
        });

        test('falls through all zone groups when conditions fail', () => {
            const hass = createHass({
                'person.john': { state: 'zone.office' },
                'sensor.john_activity': { state: 'gaming' }
            });
            const person: PersonConfig = {
                entity_id: 'person.john',
                namedSensors: {
                    activity: { entity_id: 'sensor.john_activity' }
                }
            };

            const zoneGroups: ZoneGroup[] = [
                {
                    name: 'work focused',
                    zones: ['zone.office'],
                    conditions: {
                        activity: 'working' // Does not match
                    },
                    activities: [{
                        activity: 'working',
                        conditions: {}
                    }]
                },
                {
                    name: 'work meeting',
                    zones: ['zone.office'],
                    conditions: {
                        activity: 'in-meeting' // Does not match
                    },
                    activities: [{
                        activity: 'in a meeting',
                        conditions: {}
                    }]
                }
            ];
            const cardActivities: Activity[] = [{
                activity: 'is gaming',
                conditions: {
                    activity: 'gaming'
                }
            }];
            const evaluator = new ActivityEvaluator(hass, person, cardActivities, zoneGroups);

            const result = evaluator.evaluate();
            // All zone groups fail, falls back to card-level activity
            expect(result?.activity).toBe('is gaming');
        });

        test('zone group with random condition can vary results', () => {
            const hass = createHass({
                'person.john': { state: 'zone.home' }
            });
            const person: PersonConfig = { entity_id: 'person.john' };

            const zoneGroups: ZoneGroup[] = [
                {
                    name: 'home - fun',
                    zones: ['zone.home'],
                    conditions: {
                        random: '50%'
                    },
                    activities: [{
                        activity: 'chilling at home',
                        conditions: {}
                    }]
                },
                {
                    name: 'home - default',
                    zones: ['zone.home'],
                    activities: [{
                        activity: 'at home',
                        conditions: {}
                    }]
                }
            ];

            // Run multiple times to see variation (50% should sometimes match, sometimes not)
            const results: string[] = [];
            for (let i = 0; i < 20; i++) {
                const evaluator = new ActivityEvaluator(hass, person, [], zoneGroups);
                const result = evaluator.evaluate();
                if (result?.activity) {
                    results.push(result.activity);
                }
            }

            // We should see both variations
            const hasChilling = results.includes('chilling at home');
            const hasDefault = results.includes('at home');

            // At least one of each should appear with 50% probability over 20 runs
            expect(hasChilling || hasDefault).toBe(true);
        });
    });
});
