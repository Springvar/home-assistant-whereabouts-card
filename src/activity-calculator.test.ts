import { describe, it, expect } from 'vitest';
import { ActivityCalculator } from './activity-calculator';
import type { PersonConfig } from './types';

// Mock hass object
function createMockHass(states: Record<string, any> = {}) {
    const hassStates: Record<string, any> = {};
    for (const [key, value] of Object.entries(states)) {
        if (typeof value === 'string') {
            hassStates[key] = {
                entity_id: key,
                state: value,
                attributes: {}
            };
        } else {
            hassStates[key] = {
                entity_id: key,
                state: value.state || 'unknown',
                attributes: value.attributes || {}
            };
        }
    }
    return {
        states: hassStates,
        config: {},
        connection: {
            subscribeEvents: () => {}
        }
    };
}

describe('ActivityCalculator', () => {
    describe('calculate', () => {
        it('returns null when showActivity is false', () => {
            const mockHass = createMockHass({
                'person.john': { state: 'home' }
            });

            const config: PersonConfig = {
                entity_id: 'person.john',
                showActivity: false,
                namedSensors: {},
                activityRules: [
                    {
                        id: 'test',
                        priority: 100,
                        conditions: [],
                        output: { text: 'Test', icon: 'mdi:account' }
                    }
                ]
            };

            const calculator = new ActivityCalculator(mockHass, config);
            const result = calculator.calculate();

            expect(result).toBeNull();
        });

        it('returns null when no activity rules configured', () => {
            const mockHass = createMockHass({
                'person.john': { state: 'home' }
            });

            const config: PersonConfig = {
                entity_id: 'person.john',
                namedSensors: {}
            };

            const calculator = new ActivityCalculator(mockHass, config);
            const result = calculator.calculate();

            expect(result).toBeNull();
        });

        it('returns fallback when no rules match', () => {
            const mockHass = createMockHass({
                'person.john': { state: 'home' },
                'sensor.john_activity': { state: 'walking' }
            });

            const config: PersonConfig = {
                entity_id: 'person.john',
                namedSensors: { activity: { entity_id: 'sensor.john_activity' } },
                activityRules: [
                    {
                        id: 'sleeping',
                        priority: 100,
                        conditions: [{ sensor: 'activity', state: 'still' }],
                        output: { text: 'Sleeping', icon: 'mdi:power-sleep' }
                    }
                ],
                fallbackActivity: 'Unknown activity',
                fallbackIcon: 'mdi:help'
            };

            const calculator = new ActivityCalculator(mockHass, config);
            const result = calculator.calculate();

            expect(result).toEqual({
                text: 'Unknown activity',
                icon: 'mdi:help'
            });
        });

        it('returns null when no rules match and no fallback configured', () => {
            const mockHass = createMockHass({
                'person.john': { state: 'home' },
                'sensor.john_activity': { state: 'walking' }
            });

            const config: PersonConfig = {
                entity_id: 'person.john',
                namedSensors: { activity: { entity_id: 'sensor.john_activity' } },
                activityRules: [
                    {
                        id: 'sleeping',
                        priority: 100,
                        conditions: [{ sensor: 'activity', state: 'still' }],
                        output: { text: 'Sleeping', icon: 'mdi:power-sleep' }
                    }
                ]
            };

            const calculator = new ActivityCalculator(mockHass, config);
            const result = calculator.calculate();

            expect(result).toBeNull();
        });

        it('returns first matching rule based on priority', () => {
            const mockHass = createMockHass({
                'person.john': { state: 'home' },
                'sensor.john_activity': { state: 'still' }
            });

            const config: PersonConfig = {
                entity_id: 'person.john',
                namedSensors: { activity: { entity_id: 'sensor.john_activity' } },
                activityRules: [
                    {
                        id: 'low-priority',
                        priority: 50,
                        conditions: [{ sensor: 'activity', state: 'still' }],
                        output: { text: 'Sitting still', icon: 'mdi:account' }
                    },
                    {
                        id: 'high-priority',
                        priority: 100,
                        conditions: [{ sensor: 'activity', state: 'still' }],
                        output: { text: 'Resting', icon: 'mdi:sleep' }
                    }
                ]
            };

            const calculator = new ActivityCalculator(mockHass, config);
            const result = calculator.calculate();

            expect(result?.matchedRuleId).toBe('high-priority');
            expect(result?.text).toBe('Resting');
            expect(result?.icon).toBe('mdi:sleep');
        });

        it('skips disabled rules', () => {
            const mockHass = createMockHass({
                'person.john': { state: 'home' },
                'sensor.john_activity': { state: 'still' }
            });

            const config: PersonConfig = {
                entity_id: 'person.john',
                namedSensors: { activity: { entity_id: 'sensor.john_activity' } },
                activityRules: [
                    {
                        id: 'disabled-rule',
                        priority: 100,
                        enabled: false,
                        conditions: [{ sensor: 'activity', state: 'still' }],
                        output: { text: 'Disabled activity', icon: 'mdi:cancel' }
                    },
                    {
                        id: 'enabled-rule',
                        priority: 50,
                        conditions: [{ sensor: 'activity', state: 'still' }],
                        output: { text: 'Enabled activity', icon: 'mdi:check' }
                    }
                ]
            };

            const calculator = new ActivityCalculator(mockHass, config);
            const result = calculator.calculate();

            expect(result?.matchedRuleId).toBe('enabled-rule');
            expect(result?.text).toBe('Enabled activity');
        });

        it('evaluates complex conditions correctly', () => {
            const mockHass = createMockHass({
                'person.john': { state: 'home' },
                'sensor.john_activity': { state: 'still' },
                'sensor.john_sleep_confidence': { state: '95' }
            });

            const config: PersonConfig = {
                entity_id: 'person.john',
                namedSensors: {
                    activity: { entity_id: 'sensor.john_activity' },
                    sleepConfidence: { entity_id: 'sensor.john_sleep_confidence' }
                },
                activityRules: [
                    {
                        id: 'sleeping',
                        priority: 100,
                        conditions: [
                            { sensor: 'sleepConfidence', operator: 'gt', value: 90 },
                            { sensor: 'activity', state: 'still' },
                            { personState: 'home' }
                        ],
                        output: { text: 'Sleeping at home', icon: 'mdi:power-sleep' }
                    }
                ]
            };

            const calculator = new ActivityCalculator(mockHass, config);
            const result = calculator.calculate();

            expect(result).toEqual({
                text: 'Sleeping at home',
                icon: 'mdi:power-sleep',
                matchedRuleId: 'sleeping'
            });
        });

        it('handles missing person entity gracefully', () => {
            const mockHass = createMockHass({
                'sensor.john_activity': { state: 'walking' }
            });

            const config: PersonConfig = {
                entity_id: 'person.john', // Person entity doesn't exist
                namedSensors: { activity: { entity_id: 'sensor.john_activity' } },
                activityRules: [
                    {
                        id: 'walking',
                        priority: 100,
                        conditions: [{ sensor: 'activity', state: 'walking' }],
                        output: { text: 'Walking', icon: 'mdi:walk' }
                    }
                ],
                fallbackActivity: 'Unknown'
            };

            const calculator = new ActivityCalculator(mockHass, config);
            const result = calculator.calculate();

            expect(result).toEqual({
                text: 'Unknown',
                icon: 'mdi:account'
            });
        });

        it('uses default icon when output icon is not specified', () => {
            const mockHass = createMockHass({
                'person.john': { state: 'home' }
            });

            const config: PersonConfig = {
                entity_id: 'person.john',
                activityRules: [
                    {
                        id: 'no-icon',
                        priority: 100,
                        conditions: [{ personState: 'home' }],
                        output: { text: 'At home' } // No icon specified
                    }
                ]
            };

            const calculator = new ActivityCalculator(mockHass, config);
            const result = calculator.calculate();

            expect(result?.icon).toBe('mdi:account');
        });
    });

    describe('randomization', () => {
        it('selects from array of text options', () => {
            const mockHass = createMockHass({
                'person.john': { state: 'home' }
            });

            const config: PersonConfig = {
                entity_id: 'person.john',
                activityRules: [
                    {
                        id: 'sleeping',
                        priority: 100,
                        conditions: [{ personState: 'home' }],
                        output: {
                            text: ['Sleeping', 'Resting', 'Dozing'],
                            icon: 'mdi:power-sleep'
                        }
                    }
                ]
            };

            const calculator = new ActivityCalculator(mockHass, config);
            const result = calculator.calculate();

            expect(['Sleeping', 'Resting', 'Dozing']).toContain(result?.text);
            expect(result?.icon).toBe('mdi:power-sleep');
        });

        it('selects from array of icon options', () => {
            const mockHass = createMockHass({
                'person.john': { state: 'home' }
            });

            const config: PersonConfig = {
                entity_id: 'person.john',
                activityRules: [
                    {
                        id: 'home',
                        priority: 100,
                        conditions: [{ personState: 'home' }],
                        output: {
                            text: 'At home',
                            icon: ['mdi:home', 'mdi:sofa', 'mdi:television']
                        }
                    }
                ]
            };

            const calculator = new ActivityCalculator(mockHass, config);
            const result = calculator.calculate();

            expect(result?.text).toBe('At home');
            expect(['mdi:home', 'mdi:sofa', 'mdi:television']).toContain(result?.icon);
        });
    });

    describe('sensor state collection', () => {
        it('collects states from named sensors', () => {
            const mockHass = createMockHass({
                'person.john': { state: 'home' },
                'sensor.john_activity': { state: 'walking' },
                'binary_sensor.john_charging': { state: 'on' }
            });

            const config: PersonConfig = {
                entity_id: 'person.john',
                namedSensors: {
                    activity: { entity_id: 'sensor.john_activity' },
                    charging: { entity_id: 'binary_sensor.john_charging' }
                },
                activityRules: [
                    {
                        id: 'walking-and-charging',
                        priority: 100,
                        conditions: [
                            { sensor: 'activity', state: 'walking' },
                            { sensor: 'charging', state: 'on' }
                        ],
                        output: { text: 'Walking while charging', icon: 'mdi:walk' }
                    }
                ]
            };

            const calculator = new ActivityCalculator(mockHass, config);
            const result = calculator.calculate();

            expect(result?.text).toBe('Walking while charging');
        });

        it('handles array of sensors (gaming example)', () => {
            const mockHass = createMockHass({
                'person.john': { state: 'home' },
                'sensor.john_steam': { state: 'idle' },
                'sensor.john_discord': { state: 'playing', attributes: { game: 'Minecraft' } }
            });

            const config: PersonConfig = {
                entity_id: 'person.john',
                namedSensors: {
                    gaming: { entity_id: ['sensor.john_steam', 'sensor.john_discord'] }
                },
                activityRules: [
                    {
                        id: 'gaming',
                        priority: 100,
                        conditions: [{ sensor: 'gaming', state: 'playing' }],
                        output: { text: 'Gaming', icon: 'mdi:gamepad' }
                    }
                ]
            };

            const calculator = new ActivityCalculator(mockHass, config);
            const result = calculator.calculate();

            expect(result?.text).toBe('Gaming');
        });
    });
});
