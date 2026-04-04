import { describe, it, expect } from 'vitest';
import { ConditionEvaluator } from './condition-evaluator';
import { TimeContextProvider } from './time-context-provider';
import type { PersonSensors, ActivityCondition } from './types';

describe('ConditionEvaluator', () => {
    function createMockEntity(state: string, attributes: Record<string, any> = {}) {
        return { state, attributes };
    }

    describe('evaluateAll', () => {
        it('returns true when all conditions match', () => {
            const sensorStates = new Map([['sensor.activity', createMockEntity('still')]]);
            const namedSensors: PersonSensors = { activity: { entity_id: 'sensor.activity' } };
            const timeProvider = new TimeContextProvider(new Date('2026-04-03T14:00:00')); // Afternoon, weekday
            const evaluator = new ConditionEvaluator(sensorStates, 'home', namedSensors, timeProvider);

            const conditions: ActivityCondition[] = [
                { sensor: 'activity', state: 'still' },
                { personState: 'home' },
                { timeOfDay: 'afternoon' }
            ];

            expect(evaluator.evaluateAll(conditions)).toBe(true);
        });

        it('returns false when any condition does not match', () => {
            const sensorStates = new Map([['sensor.activity', createMockEntity('walking')]]);
            const namedSensors: PersonSensors = { activity: { entity_id: 'sensor.activity' } };
            const timeProvider = new TimeContextProvider(new Date('2026-04-03T14:00:00'));
            const evaluator = new ConditionEvaluator(sensorStates, 'home', namedSensors, timeProvider);

            const conditions: ActivityCondition[] = [
                { sensor: 'activity', state: 'still' }, // This will not match (walking !== still)
                { personState: 'home' }
            ];

            expect(evaluator.evaluateAll(conditions)).toBe(false);
        });

        it('returns true for empty conditions array', () => {
            const sensorStates = new Map();
            const namedSensors: PersonSensors = {};
            const timeProvider = new TimeContextProvider();
            const evaluator = new ConditionEvaluator(sensorStates, 'home', namedSensors, timeProvider);

            expect(evaluator.evaluateAll([])).toBe(true);
        });
    });

    describe('sensor conditions', () => {
        it('evaluates sensor state equality', () => {
            const sensorStates = new Map([['sensor.activity', createMockEntity('walking')]]);
            const namedSensors: PersonSensors = { activity: { entity_id: 'sensor.activity' } };
            const timeProvider = new TimeContextProvider();
            const evaluator = new ConditionEvaluator(sensorStates, 'home', namedSensors, timeProvider);

            expect(evaluator.evaluateAll([{ sensor: 'activity', state: 'walking' }])).toBe(true);
            expect(evaluator.evaluateAll([{ sensor: 'activity', state: 'running' }])).toBe(false);
        });

        it('evaluates sensor state with array of expected values (OR logic)', () => {
            const sensorStates = new Map([['sensor.activity', createMockEntity('walking')]]);
            const namedSensors: PersonSensors = { activity: { entity_id: 'sensor.activity' } };
            const timeProvider = new TimeContextProvider();
            const evaluator = new ConditionEvaluator(sensorStates, 'home', namedSensors, timeProvider);

            expect(evaluator.evaluateAll([{ sensor: 'activity', state: ['walking', 'running'] }])).toBe(true);
            expect(evaluator.evaluateAll([{ sensor: 'activity', state: ['running', 'cycling'] }])).toBe(false);
        });

        it('evaluates numeric sensor values with operators', () => {
            const sensorStates = new Map([['sensor.sleep_confidence', createMockEntity('95')]]);
            const namedSensors: PersonSensors = { sleepConfidence: { entity_id: 'sensor.sleep_confidence' } };
            const timeProvider = new TimeContextProvider();
            const evaluator = new ConditionEvaluator(sensorStates, 'home', namedSensors, timeProvider);

            expect(evaluator.evaluateAll([{ sensor: 'sleepConfidence', operator: 'gt', value: 90 }])).toBe(true);
            expect(evaluator.evaluateAll([{ sensor: 'sleepConfidence', operator: 'lt', value: 90 }])).toBe(false);
            expect(evaluator.evaluateAll([{ sensor: 'sleepConfidence', operator: 'gte', value: 95 }])).toBe(true);
            expect(evaluator.evaluateAll([{ sensor: 'sleepConfidence', operator: 'lte', value: 95 }])).toBe(true);
        });

        it('evaluates nested attributes', () => {
            const sensorStates = new Map([
                ['sensor.game', createMockEntity('playing', { game: 'Counter-Strike' })]
            ]);
            const namedSensors: PersonSensors = { gaming: { entity_id: 'sensor.game' } };
            const timeProvider = new TimeContextProvider();
            const evaluator = new ConditionEvaluator(sensorStates, 'home', namedSensors, timeProvider);

            expect(
                evaluator.evaluateAll([
                    { sensor: 'gaming', attribute: 'game', operator: 'eq', value: 'Counter-Strike' }
                ])
            ).toBe(true);

            expect(
                evaluator.evaluateAll([{ sensor: 'gaming', attribute: 'game', operator: 'eq', value: 'Minecraft' }])
            ).toBe(false);
        });

        it('evaluates contains operator', () => {
            const sensorStates = new Map([['sensor.message', createMockEntity('Hello World')]]);
            const namedSensors: PersonSensors = { message: { entity_id: 'sensor.message' } };
            const timeProvider = new TimeContextProvider();
            const evaluator = new ConditionEvaluator(sensorStates, 'home', namedSensors, timeProvider);

            expect(evaluator.evaluateAll([{ sensor: 'message', operator: 'contains', value: 'World' }])).toBe(true);
            expect(evaluator.evaluateAll([{ sensor: 'message', operator: 'contains', value: 'world' }])).toBe(true); // Case insensitive
            expect(evaluator.evaluateAll([{ sensor: 'message', operator: 'contains', value: 'Goodbye' }])).toBe(false);
        });

        it('handles array of sensors (OR logic)', () => {
            const sensorStates = new Map([
                ['sensor.steam', createMockEntity('idle')],
                ['sensor.discord', createMockEntity('playing', { game: 'Minecraft' })]
            ]);
            const namedSensors: PersonSensors = { gaming: { entity_id: ['sensor.steam', 'sensor.discord'] } };
            const timeProvider = new TimeContextProvider();
            const evaluator = new ConditionEvaluator(sensorStates, 'home', namedSensors, timeProvider);

            // At least one sensor matches (discord is playing)
            expect(evaluator.evaluateAll([{ sensor: 'gaming', state: 'playing' }])).toBe(true);

            // Neither sensor matches
            expect(evaluator.evaluateAll([{ sensor: 'gaming', state: 'offline' }])).toBe(false);
        });

        it('returns false when sensor entity is missing', () => {
            const sensorStates = new Map(); // No sensors
            const namedSensors: PersonSensors = { activity: { entity_id: 'sensor.activity' } };
            const timeProvider = new TimeContextProvider();
            const evaluator = new ConditionEvaluator(sensorStates, 'home', namedSensors, timeProvider);

            expect(evaluator.evaluateAll([{ sensor: 'activity', state: 'walking' }])).toBe(false);
        });

        it('returns false when sensor key is not in namedSensors', () => {
            const sensorStates = new Map([['sensor.activity', createMockEntity('walking')]]);
            const namedSensors: PersonSensors = {}; // No named sensors
            const timeProvider = new TimeContextProvider();
            const evaluator = new ConditionEvaluator(sensorStates, 'home', namedSensors, timeProvider);

            expect(evaluator.evaluateAll([{ sensor: 'activity', state: 'walking' }])).toBe(false);
        });
    });

    describe('person state conditions', () => {
        it('evaluates person state with single expected value', () => {
            const sensorStates = new Map();
            const namedSensors: PersonSensors = {};
            const timeProvider = new TimeContextProvider();
            const evaluator = new ConditionEvaluator(sensorStates, 'home', namedSensors, timeProvider);

            expect(evaluator.evaluateAll([{ personState: 'home' }])).toBe(true);
            expect(evaluator.evaluateAll([{ personState: 'work' }])).toBe(false);
        });

        it('evaluates person state with array of expected values', () => {
            const sensorStates = new Map();
            const namedSensors: PersonSensors = {};
            const timeProvider = new TimeContextProvider();
            const evaluator = new ConditionEvaluator(sensorStates, 'home', namedSensors, timeProvider);

            expect(evaluator.evaluateAll([{ personState: ['home', 'work'] }])).toBe(true);
            expect(evaluator.evaluateAll([{ personState: ['work', 'school'] }])).toBe(false);
        });
    });

    describe('time-based conditions', () => {
        it('evaluates timeOfDay conditions', () => {
            const sensorStates = new Map();
            const namedSensors: PersonSensors = {};
            const afternoonProvider = new TimeContextProvider(new Date('2026-04-03T14:00:00')); // Afternoon
            const evaluator = new ConditionEvaluator(sensorStates, 'home', namedSensors, afternoonProvider);

            expect(evaluator.evaluateAll([{ timeOfDay: 'afternoon' }])).toBe(true);
            expect(evaluator.evaluateAll([{ timeOfDay: 'morning' }])).toBe(false);
        });

        it('evaluates dayType conditions', () => {
            const sensorStates = new Map();
            const namedSensors: PersonSensors = {};
            // April 3, 2026 is a Friday
            const weekdayProvider = new TimeContextProvider(new Date('2026-04-03T14:00:00'));
            const evaluator = new ConditionEvaluator(sensorStates, 'home', namedSensors, weekdayProvider);

            expect(evaluator.evaluateAll([{ dayType: 'schoolday' }])).toBe(true);
            expect(evaluator.evaluateAll([{ dayType: 'weekend' }])).toBe(false);
        });
    });

    describe('complex condition combinations', () => {
        it('evaluates multiple conditions with AND logic', () => {
            const sensorStates = new Map([
                ['sensor.activity', createMockEntity('still')],
                ['sensor.sleep_confidence', createMockEntity('95')]
            ]);
            const namedSensors: PersonSensors = {
                activity: { entity_id: 'sensor.activity' },
                sleepConfidence: { entity_id: 'sensor.sleep_confidence' }
            };
            const nightProvider = new TimeContextProvider(new Date('2026-04-03T23:00:00')); // Night
            const evaluator = new ConditionEvaluator(sensorStates, 'home', namedSensors, nightProvider);

            const conditions: ActivityCondition[] = [
                { sensor: 'sleepConfidence', operator: 'gt', value: 90 },
                { sensor: 'activity', state: 'still' },
                { personState: 'home' },
                { timeOfDay: 'night' }
            ];

            expect(evaluator.evaluateAll(conditions)).toBe(true);
        });

        it('fails when one condition in complex combination does not match', () => {
            const sensorStates = new Map([
                ['sensor.activity', createMockEntity('still')],
                ['sensor.sleep_confidence', createMockEntity('95')]
            ]);
            const namedSensors: PersonSensors = {
                activity: { entity_id: 'sensor.activity' },
                sleepConfidence: { entity_id: 'sensor.sleep_confidence' }
            };
            const afternoonProvider = new TimeContextProvider(new Date('2026-04-03T14:00:00')); // Afternoon, not night
            const evaluator = new ConditionEvaluator(sensorStates, 'home', namedSensors, afternoonProvider);

            const conditions: ActivityCondition[] = [
                { sensor: 'sleepConfidence', operator: 'gt', value: 90 },
                { sensor: 'activity', state: 'still' },
                { personState: 'home' },
                { timeOfDay: 'night' } // This will fail (afternoon !== night)
            ];

            expect(evaluator.evaluateAll(conditions)).toBe(false);
        });
    });
});
