import { ActivityCondition, PersonSensors, ConditionOperator } from './types';
import { TimeContextProvider } from './time-context-provider';

export class ConditionEvaluator {
    constructor(
        private sensorStates: Map<string, any>, // HassEntity
        private personState: string,
        private namedSensors: PersonSensors,
        private timeProvider: TimeContextProvider
    ) {}

    evaluateAll(conditions: ActivityCondition[]): boolean {
        // All conditions must match (AND logic)
        return conditions.every((condition) => this.evaluate(condition));
    }

    private evaluate(condition: ActivityCondition): boolean {
        // Sensor-based condition
        if (condition.sensor) {
            return this.evaluateSensor(condition);
        }

        // Time-based condition
        if (condition.timeOfDay) {
            return this.timeProvider.matches(condition.timeOfDay);
        }
        if (condition.dayType) {
            return this.timeProvider.matches(condition.dayType);
        }

        // Person state condition
        if (condition.personState !== undefined) {
            const expected = Array.isArray(condition.personState) ? condition.personState : [condition.personState];
            return expected.includes(this.personState);
        }

        return true;
    }

    private evaluateSensor(condition: ActivityCondition): boolean {
        const sensorKey = condition.sensor!;
        const sensor = this.namedSensors[sensorKey];

        if (!sensor) return false;

        const entityIds = sensor.entity_id;

        // Handle array of sensors (e.g., gaming - Steam OR Discord)
        if (Array.isArray(entityIds)) {
            return entityIds.some((entityId) => this.evaluateSingleSensor(entityId, condition));
        }

        return this.evaluateSingleSensor(entityIds, condition);
    }

    private evaluateSingleSensor(entityId: string, condition: ActivityCondition): boolean {
        const entity = this.sensorStates.get(entityId);
        if (!entity) return false;

        // Get actual value (state or nested attribute)
        let actualValue = entity.state;
        if (condition.attribute) {
            actualValue = this.getNestedValue(entity.attributes, condition.attribute);
        }

        // Get expected value
        const expectedValue = condition.value ?? condition.state;
        const operator = condition.operator || 'eq';

        return this.compare(actualValue, expectedValue, operator);
    }

    private getNestedValue(obj: any, path: string): any {
        return path.split('.').reduce((acc, part) => acc?.[part], obj);
    }

    private compare(actual: any, expected: any, operator: ConditionOperator): boolean {
        switch (operator) {
            case 'eq':
                // Support array of expected values (OR logic)
                return Array.isArray(expected) ? expected.includes(actual) : actual === expected;
            case 'ne':
                return actual !== expected;
            case 'gt':
                return Number(actual) > Number(expected);
            case 'lt':
                return Number(actual) < Number(expected);
            case 'gte':
                return Number(actual) >= Number(expected);
            case 'lte':
                return Number(actual) <= Number(expected);
            case 'contains':
                return String(actual).toLowerCase().includes(String(expected).toLowerCase());
            default:
                return false;
        }
    }
}
