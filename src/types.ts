export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';
export type DayType = 'weekday' | 'weekend' | 'schoolday';
export type ConditionOperator = 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains';

export interface PersonSensor {
    entity_id: string | string[]; // Single entity or array for OR logic
}

export interface PersonSensors {
    [sensorName: string]: PersonSensor; // Fully custom sensor names
}

export interface ActivityCondition {
    // Sensor-based condition
    sensor?: string; // Key from PersonSensors
    state?: string | string[]; // Expected state(s)
    attribute?: string; // Nested attribute path (e.g., 'game')
    operator?: ConditionOperator;
    value?: any;

    // Time-based condition
    timeOfDay?: TimeOfDay;
    dayType?: DayType;

    // Location-based condition
    personState?: string | string[]; // Person entity state
}

export interface ActivityRule {
    id: string;
    priority: number; // Higher = evaluated first
    conditions: ActivityCondition[];
    output: {
        text: string | string[]; // Activity string(s) - random if array
        icon?: string | string[]; // Icon(s) - random if array
    };
    enabled?: boolean; // Default: true
    description?: string;
}

export interface CalculatedActivity {
    text: string;
    icon: string;
    matchedRuleId?: string; // For debugging
}

// General activity with simple conditions (card-level)
export interface Activity {
    activity: string;
    verb?: string; // Deprecated: use 'activity' instead
    conditions: ActivityConditions;
    location_override?: string; // Optional custom location text
    show_location?: boolean; // Show/hide location (undefined = inherit, true = show, false = hide)
    preposition?: string; // Optional preposition override
    show_preposition?: boolean; // Override zone group's show_preposition setting
    icon?: string; // Optional icon override
}

export interface ActivityConditions {
    [key: string]: string | string[]; // Key is sensor name or "who", value is single or array of values
}

// PersonConfig with named sensors and activity rules
export interface PersonConfig {
    entity_id: string;
    name?: string;
    show_avatar?: boolean; // Override global show_avatars setting (undefined = inherit, true = show, false = hide)
    namedSensors?: PersonSensors;
    activityRules?: ActivityRule[];
    showActivity?: boolean; // Toggle feature
    fallbackActivity?: string;
    fallbackIcon?: string;
    hideIf?: ActivityConditions; // Hide person if conditions match
}
