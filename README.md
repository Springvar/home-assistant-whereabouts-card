# Home Assistant Whereabouts Card

Custom Lovelace card for Home Assistant to display person locations with contextual activities and customizable presentation.

<!-- Placeholder for preview image -->
<!-- <img src="https://raw.githubusercontent.com/Springvar/home-assistant-whereabouts-card/main/card.png" width="35%"> -->

## Table of Contents

1. [Introduction](#introduction)
2. [Installation](#installation)
3. [Configuration](#configuration)
    - [Basic Configuration](#basic-configuration)
    - [Advanced Configuration](#advanced-configuration)
        - [Persons](#persons-configuration)
        - [Activities](#activities-configuration)
        - [Zone Groups](#zone-groups-configuration)
        - [Template](#template-configuration)
4. [Usage](#usage)
    - [Features](#features)
    - [Examples](#examples)
5. [Support](#support)

## Introduction

The **Whereabouts Card** displays person locations in Home Assistant with rich contextual information. It shows where people are, what they're doing, and presents this information in a customizable format.

**Key Features:**
- **Person Tracking**: Display multiple persons with their current zones
- **Activity Detection**: Show contextual activities based on sensor states and conditions
- **Named Sensors**: Define custom sensor mappings per person
- **Zone Groups**: Group zones together with custom names and icons
- **Conditional Display**: Show or hide persons based on sensor values
- **Flexible Templates**: Customize the display format to match different languages and preferences
- **Icon Precedence**: Control icon display with activity > zone group > zone hierarchy

## Installation

### Prerequisites

This card is designed to work with Home Assistant's person entities and zone tracking.

### HACS (Recommended)

If you use [HACS](https://hacs.xyz/) to manage Home Assistant custom cards:

[![Install quickly via a HACS link](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Springvar&repository=home-assistant-whereabouts-card&category=plugin)

1. Go to **HACS** → **Frontend**.
2. Add this repository: `https://github.com/Springvar/home-assistant-whereabouts-card` as a [custom repository](https://hacs.xyz/docs/faq/custom_repositories/).
3. Download and install the card, then restart Home Assistant.

### Manual

1. **Download the Card**:
   - Download the latest release from the [GitHub repository](https://github.com/Springvar/home-assistant-whereabouts-card/releases).

2. **Add to Home Assistant**:
   - Copy the file into your `www/whereabouts-card` directory under your Home Assistant config.

3. **Reference the Card in Lovelace Resources**:
   ```yaml
   resources:
     - url: /local/whereabouts-card/home-assistant-whereabouts-card.js
       type: module
   ```

## Configuration

### Basic Configuration

Minimal configuration to get started:

```yaml
type: custom:whereabouts-card
persons:
  - entity_id: person.john
  - entity_id: person.jane
```

| Name | Description | Default Value | Constraints |
| ---- | ----------- | ------------- | ----------- |
| `persons` | List of person configurations | `[]` | Array of person objects (see below) |
| `show_title` | Show card title header | `true` | Boolean |
| `title` | Card title text | `Whereabouts` | String |
| `show_avatars` | Show person avatars in a separate column | `false` | Boolean |
| `default_verb` | Default verb for location display (e.g., "is", "are") | `is` | String |
| `default_preposition` | Default preposition for locations (e.g., "in", "at") | `in` | String |

### Advanced Configuration

#### Persons Configuration

Each person in the `persons` array can have these properties:

```yaml
persons:
  - entity_id: person.john
    name: John Smith
    namedSensors:
      activity:
        entity_id: sensor.john_activity
      charging:
        entity_id: binary_sensor.john_phone_charging
    hideIf:
      visibility: "hidden"
```

| Name | Description | Default Value | Constraints |
| ---- | ----------- | ------------- | ----------- |
| `entity_id` | Person entity ID | **Required** | Must be a valid person entity ID |
| `name` | Display name (overrides entity friendly name) | Entity's friendly name | String |
| `namedSensors` | Map of sensor names to entity IDs | `{}` | Object with sensor definitions (see below) |
| `hideIf` | Conditions to hide this person | `undefined` | Object with condition key-value pairs |

**Named Sensors:**

Named sensors allow you to reference sensors by semantic names in activity conditions. Each sensor definition has:

```yaml
namedSensors:
  activity:
    entity_id: sensor.john_activity
  visibility:
    entity_id: sensor.john_visibility
  location_status:
    entity_id:
      - sensor.john_gps
      - sensor.john_wifi  # Multiple sensors = OR logic
```

| Property | Description | Constraints |
| -------- | ----------- | ----------- |
| `entity_id` | Single entity ID or array for OR logic | String or array of strings |

**Hide If Conditions:**

The `hideIf` property hides a person when conditions match:

```yaml
hideIf:
  visibility: "hidden"           # Simple equality
  confidence: ">90"              # Numeric comparison
  status: ["away", "vacation"]   # Match any value in array
```

Supported operators: `>`, `<`, `>=`, `<=`, `=`, `<>`

#### Activities Configuration

Activities detect contextual states and display custom verbs and icons:

```yaml
activities:
  - verb: "is working"
    icon: "mdi:briefcase"
    location_override: "-"
    conditions:
      activity: "working"
      where: "work"
  - verb: "is gaming"
    icon: "mdi:gamepad"
    show_preposition: true
    conditions:
      activity: "gaming"
      where: "home"
```

| Name | Description | Default Value | Constraints |
| ---- | ----------- | ------------- | ----------- |
| `verb` | Activity verb to display. Supports sensor placeholders like `{sensorName}` | **Required** | String |
| `conditions` | Conditions that must match | **Required** | Object with condition key-value pairs |
| `icon` | Icon override for this activity | `undefined` | String (mdi:icon-name) |
| `location_override` | Custom location text, or "-" to hide location | `undefined` | String |
| `show_preposition` | Override zone group's show_preposition setting | `undefined` | Boolean |

**Activity Conditions:**

Conditions are evaluated against the person's named sensors. All conditions must match (AND logic).

```yaml
conditions:
  activity: "working"              # Match sensor value
  confidence: ">80"                # Numeric comparison
  status: ["active", "busy"]       # Match any in array
  who: ["person.john", "John"]     # Special: match person
  where: ["work", "zone.office"]   # Special: match zone or zone group
```

**Special Condition Keys:**
- `who`: Matches against person entity ID, name, or entity ID without "person." prefix
- `where`: Matches against zone entity ID, zone name, zone friendly name, or zone group name
- `user`: Matches against the current Home Assistant user (by user ID, user name, or associated person entity)

Supported operators: `>`, `<`, `>=`, `<=`, `=`, `<>`

**Activities are evaluated top-to-bottom** and the first matching activity is used.

**Sensor Placeholders in Activity Verbs:**

You can use `{sensorName}` placeholders in activity verbs to dynamically set the displayed text from a sensor value:

```yaml
persons:
  - entity_id: person.john
    namedSensors:
      activity:
        entity_id: sensor.john_activity_override
      override:
        entity_id: sensor.john_activity_timer
activities:
  - verb: "{activity}"
    conditions:
      override: ">0"
```

When the condition matches, the verb will be replaced with the current state of the `activity` sensor. For example, if `sensor.john_activity_override` has state "is exercising", that text will be displayed instead of the placeholder.

#### Zone Groups Configuration

Group multiple zones together with a common name and settings:

```yaml
zone_groups:
  - name: "work"
    zones:
      - zone.office
      - zone.laboratory
    icon: "mdi:office-building"
    preposition: "at"
    show_preposition: true
  - name: "home"
    zones:
      - zone.home
    icon: "mdi:home"
    preposition: "at"
    show_preposition: false
```

| Name | Description | Default Value | Constraints |
| ---- | ----------- | ------------- | ----------- |
| `zones` | List of zone entity IDs | **Required** | Array of strings |
| `name` | Display name for the group | `undefined` | String |
| `icon` | Icon for zones in this group | `undefined` | String (mdi:icon-name) |
| `preposition` | Custom preposition for this group | Card's default_preposition | String |
| `show_preposition` | Show preposition before location | `true` | Boolean |
| `override_location` | Replace zone name with group name | `true` | Boolean |

**Note:** Set `override_location: false` to keep the original zone names while still applying the group's preposition and icon. This is useful when you want to group zones for preposition/icon consistency without losing the specific zone names (e.g., "Office", "Laboratory" both use "at" preposition and work icon, but keep their individual names).

**Icon Precedence:**
1. Activity icon (if activity detected)
2. Zone group icon (if zone is in a group)
3. Zone's native icon (from zone entity attributes)
4. Default icon (`mdi:map-marker`)

#### Template Configuration

Customize the display format using template placeholders:

```yaml
template: "{name} {verb} {-preposition} {-location} <right {icon}>"
```

| Name | Description | Default Value |
| ---- | ----------- | ------------- |
| `template` | Display template with placeholders | `{name} {verb} {-preposition} {-location} <right {icon}>` |

**Available Placeholders:**
- `{name}` - Person's display name
- `{verb}` - Activity verb or default verb
- `{preposition}` - Preposition (respects show_preposition setting)
- `{location}` - Zone or zone group name (respects location_override)
- `{icon}` - Icon element

**Special Syntax:**
- `{-placeholder}` - Omits preceding whitespace if value is empty
- `<right ...>` - Floats content to the right side

**Example Templates:**

```yaml
# Default (Norwegian word order)
template: "{name} {verb} {-preposition} {-location} <right {icon}>"

# No icon, location first
template: "{location}: {name} {verb}"

# Icon on left
template: "{icon} {name} {verb} {-preposition} {-location}"
```

## Usage

### Features

**Person Location Display:**
- Shows each person's current zone with friendly names
- Supports zone groups for semantic grouping (e.g., all work locations)
- Hides persons conditionally based on sensor values

**Activity Detection:**
- Evaluates sensor conditions to detect contextual activities
- Customizable verbs and icons per activity
- Can override or hide location information
- Activities evaluated in order (first match wins)

**Flexible Presentation:**
- Template system for different languages and word orders
- Icon positioning control with `<right>` directive
- Conditional whitespace removal with `{-placeholder}`
- Icon precedence system for visual hierarchy

### Examples

**Basic Configuration:**

```yaml
type: custom:whereabouts-card
persons:
  - entity_id: person.john
  - entity_id: person.jane
show_title: true
title: Family Status
```

**With Activities:**

```yaml
type: custom:whereabouts-card
persons:
  - entity_id: person.john
    namedSensors:
      activity:
        entity_id: sensor.john_activity
  - entity_id: person.jane
    namedSensors:
      activity:
        entity_id: sensor.jane_activity
activities:
  - verb: "is working"
    icon: "mdi:briefcase"
    location_override: "-"
    conditions:
      activity: "working"
  - verb: "is sleeping"
    icon: "mdi:power-sleep"
    conditions:
      activity: "sleeping"
      where: "home"
default_verb: "is"
default_preposition: "at"
```

**With Zone Groups:**

```yaml
type: custom:whereabouts-card
persons:
  - entity_id: person.john
  - entity_id: person.jane
zone_groups:
  - name: "work"
    zones:
      - zone.office
      - zone.laboratory
    icon: "mdi:office-building"
    show_preposition: true
  - name: "home"
    zones:
      - zone.home
    icon: "mdi:home"
    show_preposition: false
```

**With Conditional Visibility:**

```yaml
type: custom:whereabouts-card
persons:
  - entity_id: person.john
    namedSensors:
      visibility:
        entity_id: sensor.john_sharing_location
    hideIf:
      visibility: "off"
```

**With User-Specific Activities:**

```yaml
type: custom:whereabouts-card
persons:
  - entity_id: person.john
    namedSensors:
      activity:
        entity_id: sensor.john_activity
  - entity_id: person.jane
    namedSensors:
      activity:
        entity_id: sensor.jane_activity
activities:
  # Show "You are..." for the current user
  - verb: "are working"
    icon: "mdi:briefcase"
    conditions:
      user: "person.john"  # Or user ID or name
      activity: "working"
  # Show "is working" for others
  - verb: "is working"
    icon: "mdi:briefcase"
    conditions:
      activity: "working"
```

**Custom Template (Norwegian):**

```yaml
type: custom:whereabouts-card
persons:
  - entity_id: person.john
  - entity_id: person.jane
default_verb: "er"
default_preposition: "på"
template: "{name} {verb} {-preposition} {-location} <right {icon}>"
```

## Support

For support, you can:
- Open an issue in the [GitHub repository](https://github.com/Springvar/home-assistant-whereabouts-card/issues)
- Join the Home Assistant community forums for further help

Your suggestions and feedback are welcome!
