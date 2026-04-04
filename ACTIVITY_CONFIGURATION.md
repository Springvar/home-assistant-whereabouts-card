# Activity Calculation Configuration Guide

This guide explains how to configure dynamic activity calculation for the whereabouts card.

## Overview

The activity calculation feature allows you to define custom activity strings based on multiple sensor inputs, time context, and conditions. The default display format is:

**`{name} {verb} {preposition} {location}`**

For example: "John is at Home"

Activities are **optional** enhancements displayed on top of this base format.

## Configuration Structure

### Custom Named Sensors

Instead of hard-coded sensor types, you define **custom sensor names** that you can reference in activity rules:

```yaml
namedSensors:
  myActivitySensor:                    # Custom name you choose
    entity_id: sensor.john_activity    # Single entity
  charging:                            # Another custom name
    entity_id: binary_sensor.john_charging
    type: status                       # Optional category for organization
  gaming:                              # Example with multiple entities (OR logic)
    entity_id:
      - sensor.john_steam
      - sensor.john_discord
    type: entertainment
```

**Key Points:**
- Sensor names are completely custom (you choose them)
- Use `entity_id` for single sensor or array for multiple (OR logic)
- Optional `type` field for categorizing sensors
- Reference these names in activity rule conditions

## Example Configuration

```yaml
type: custom:whereabouts-card
persons:
  - entity_id: person.ivar
    name: Ivar                         # Optional custom display name
    showActivity: true                 # Enable activity calculation
    
    # Define custom sensors with names you choose
    namedSensors:
      activity:                        # Name used in conditions below
        entity_id: sensor.ivar_detected_activity
        type: motion
      charging:
        entity_id: binary_sensor.ivar_is_charging
        type: status
      sleepConfidence:
        entity_id: sensor.ivar_sleep_confidence
        type: health
      gaming:                          # Multiple entities = OR logic
        entity_id:
          - sensor.ivar_steam
          - sensor.ivar_discord
        type: entertainment
      homeOffice:
        entity_id: timer.ivar_hjemmekontor
    
    # Activity rules evaluated by priority (highest first)
    activityRules:
      - id: sleeping
        priority: 100
        conditions:
          - sensor: sleepConfidence    # References namedSensors key
            operator: gt
            value: 90
          - personState: home          # Person entity state
          - timeOfDay: night           # Time context
        output:
          text:
            - "Sover hjemme"           # Random selection from array
            - "Hviler godt"
            - "Drømmer søtt"
          icon: mdi:power-sleep
      
      - id: gaming
        priority: 80
        conditions:
          - sensor: gaming             # Matches if ANY gaming sensor is "playing"
            state: playing
        output:
          text: "Spiller"
          icon: mdi:desktop-classic
      
      - id: cycling_to_school
        priority: 70
        conditions:
          - sensor: activity
            state: on_bicycle
          - dayType: schoolday
          - timeOfDay: morning
        output:
          text: "Sykler til skolen"
          icon: mdi:bike
      
      - id: charging_at_home
        priority: 60
        conditions:
          - sensor: charging
            state: "on"
          - personState: home
        output:
          text: "Lader telefonen"
          icon: mdi:battery-charging
    
    # Fallback when no rules match
    fallbackActivity: "Oppholder seg"
    fallbackIcon: "mdi:account"

# Card-level settings (optional)
show_title: true
title: Whereabouts
default_verb: is
default_preposition: in

# Zone groups (optional)
zone_groups:
  - name: work
    zones:
      - zone.office
    preposition: at
```

## Condition Types

### Sensor Conditions

Reference your custom named sensors:

```yaml
- sensor: myCustomSensorName    # Your custom name from namedSensors
  state: expected_value         # Expected state (supports arrays for OR)
  operator: eq                  # Optional: eq, ne, gt, lt, gte, lte, contains
  value: 90                     # Value to compare (for numeric operators)
  attribute: nested.path        # Optional: check nested attribute instead of state
```

**Operators:**
- `eq` (default): Equals - supports arrays for OR logic
- `ne`: Not equals
- `gt`, `lt`, `gte`, `lte`: Numeric comparisons
- `contains`: String contains (case-insensitive)

**Examples:**
```yaml
# Simple state check
- sensor: activity
  state: walking

# Multiple acceptable values (OR logic)
- sensor: activity
  state: [walking, running, cycling]

# Numeric comparison
- sensor: sleepConfidence
  operator: gt
  value: 90

# Nested attribute
- sensor: gaming
  attribute: game
  value: Counter-Strike

# String contains
- sensor: message
  operator: contains
  value: "hello"
```

### Time Conditions

```yaml
# Time of day
- timeOfDay: morning    # morning, afternoon, evening, night

# Day type
- dayType: schoolday    # weekday, weekend, schoolday
```

**Time Ranges:**
- Morning: 5:00 - 11:59
- Afternoon: 12:00 - 16:59
- Evening: 17:00 - 21:59
- Night: 22:00 - 4:59

### Person State Conditions

```yaml
# Single state
- personState: home

# Multiple states (OR logic)
- personState: [home, work, school]
```

## Rule Priority

Rules are evaluated from **highest to lowest priority**. The first matching rule wins.

**Recommended priority ranges:**
- 100-90: Critical states (sleeping, emergency)
- 89-70: Important activities (working, gaming, exercising)
- 69-50: Normal activities (charging, eating)
- 49-30: Movement (walking, cycling, driving)
- 29-10: Generic/fallback rules

## Output Options

### Text Variations

Support randomized text for variety:

```yaml
output:
  text: "Single option"
  # OR
  text:
    - "Option 1"
    - "Option 2"
    - "Option 3"
```

### Icon Variations

Icons can also be randomized:

```yaml
output:
  icon: mdi:sleep
  # OR
  icon:
    - mdi:sleep
    - mdi:power-sleep
    - mdi:bed
```

## Multiple Sensors (OR Logic)

When a sensor has multiple entity IDs, **any match** triggers the condition:

```yaml
namedSensors:
  gaming:
    entity_id:
      - sensor.steam
      - sensor.discord

activityRules:
  - conditions:
      - sensor: gaming      # Matches if Steam OR Discord is "playing"
        state: playing
```

## Disabling Rules

Temporarily disable a rule without deleting it:

```yaml
activityRules:
  - id: disabled_rule
    enabled: false          # Rule will be skipped
    conditions: [...]
    output: [...]
```

## Migration from Node-RED

### Sensor Mapping

```javascript
// Node-RED
msg.payload from sensor.detected_activity

// Whereabouts Card
namedSensors:
  activity:
    entity_id: sensor.detected_activity
```

### Condition Mapping

```javascript
// Node-RED switch node
if sleep_confidence > 90 AND location == home

// Whereabouts Card
conditions:
  - sensor: sleepConfidence
    operator: gt
    value: 90
  - personState: home
```

### Randomization Mapping

```javascript
// Node-RED random node with multiple outputs

// Whereabouts Card
output:
  text:
    - "Variant 1"
    - "Variant 2"
    - "Variant 3"
```

## Editor UI

The card editor provides an interface for managing configuration:

1. **Persons Section** (top, primary)
   - Add/remove persons
   - Configure custom name
   - **Named Sensors**: Add custom sensors with your own names
   - Legacy sensors (for backward compatibility)

2. **Card Settings** (optional, collapsible)
   - Title, verb, preposition settings

3. **Zone Groups** (optional, collapsible)
   - Custom zone groupings and prepositions

### Adding Named Sensors in Editor

1. Expand the person's "Named Sensors" section
2. Enter a custom sensor name (e.g., "activity", "charging", "myCustomSensor")
3. Click "Add Sensor" or press Enter
4. Provide the entity ID(s) when prompted
5. Optionally provide a type/category

## Best Practices

1. **Use descriptive sensor names**: Choose names that make sense for your use case
2. **Start with high priorities**: Most important conditions first
3. **Test time conditions**: Verify morning/afternoon/night ranges match your needs
4. **Use fallback**: Always provide a fallback activity
5. **Group related sensors**: Use the optional `type` field to organize sensors
6. **Avoid overlapping rules**: Ensure priority order handles overlaps correctly

## Debugging

### Check Rule Matching

The `matchedRuleId` is included in calculated activities (visible in developer tools):

```javascript
{
  text: "Sleeping",
  icon: "mdi:power-sleep",
  matchedRuleId: "sleeping"  // Which rule matched
}
```

### Common Issues

1. **Rule never matches**: Check condition sensor names match `namedSensors` keys
2. **Wrong rule matches**: Verify priority order
3. **Time conditions fail**: Test at different times of day
4. **Sensor not updating**: Verify entity IDs in Home Assistant
