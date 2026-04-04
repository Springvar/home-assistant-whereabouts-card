import { PersonConfig, ActivityRule, CalculatedActivity } from './types';
import { ConditionEvaluator } from './condition-evaluator';
import { TimeContextProvider } from './time-context-provider';
import { selectRandom } from './utils/random-selector';

export class ActivityCalculator {
    private sensorStates: Map<string, any> = new Map();
    private timeProvider: TimeContextProvider;

    constructor(
        private hass: any,
        private personConfig: PersonConfig
    ) {
        this.timeProvider = new TimeContextProvider();
    }

    calculate(): CalculatedActivity | null {
        // Skip if feature disabled or no rules
        if (this.personConfig.showActivity === false || !this.personConfig.activityRules) {
            return null;
        }

        // Collect sensor states
        this.collectSensorStates();

        // Get person entity
        const personEntity = this.hass.states[this.personConfig.entity_id];
        if (!personEntity) return this.getFallback();

        // Sort rules by priority (descending)
        const sortedRules = this.getSortedRules();

        // Evaluate rules until one matches
        for (const rule of sortedRules) {
            if (rule.enabled === false) continue;

            if (this.evaluateRule(rule, personEntity)) {
                return this.generateOutput(rule);
            }
        }

        // No match - return fallback
        return this.getFallback();
    }

    private collectSensorStates(): void {
        if (!this.personConfig.namedSensors) return;

        for (const [key, sensor] of Object.entries(this.personConfig.namedSensors)) {
            if (!sensor || !sensor.entity_id) continue;

            const entityIds = sensor.entity_id;

            if (Array.isArray(entityIds)) {
                entityIds.forEach((id) => {
                    const entity = this.hass.states[id];
                    if (entity) this.sensorStates.set(id, entity);
                });
            } else {
                const entity = this.hass.states[entityIds];
                if (entity) this.sensorStates.set(entityIds, entity);
            }
        }
    }

    private getSortedRules(): ActivityRule[] {
        const rules = this.personConfig.activityRules || [];
        return [...rules].sort((a, b) => b.priority - a.priority);
    }

    private evaluateRule(rule: ActivityRule, personEntity: any): boolean {
        const evaluator = new ConditionEvaluator(
            this.sensorStates,
            personEntity.state,
            this.personConfig.namedSensors || {},
            this.timeProvider
        );

        return evaluator.evaluateAll(rule.conditions);
    }

    private generateOutput(rule: ActivityRule): CalculatedActivity {
        return {
            text: selectRandom(rule.output.text),
            icon: selectRandom(rule.output.icon || 'mdi:account'),
            matchedRuleId: rule.id
        };
    }

    private getFallback(): CalculatedActivity | null {
        if (this.personConfig.fallbackActivity) {
            return {
                text: this.personConfig.fallbackActivity,
                icon: this.personConfig.fallbackIcon || 'mdi:account'
            };
        }
        return null;
    }
}
