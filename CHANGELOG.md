# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

## [0.2.1] - 2026-09-07

### Added

- **Data staleness (`data_age`) condition** - Match on how long ago a person's location was last updated.
  - Supported in `hideIf` (e.g. `hideIf: { data_age: ">24" }`) to hide stale/outdated entries.
  - Supported in activity `conditions` (e.g. `data_age: ">24"`) to show a fallback activity for stale presence.
  - A missing entity or timestamp is treated as always stale.
- **`data_age` editor support** - `data_age` is now selectable in the card editor condition dropdowns (hideIf, activities, zone group conditions, and zone group activities), rendered as a numeric operator + hours field.
- **`debug` flag** - Set `debug: true` on the card to dump each person's available (entity state, `last_changed`/`last_updated`, computed `data_age_hours`, `data_age_basis`, per-tracker diagnostics, `hours_at_location`, source attribution chain, resolved named-sensor values) and calculated (zone group, activity, location, icon, `hideIf` matching) values to the browser console. See the README.
- Zone group ordering and conditional activity application
- Activity overrides with conditions on zone groups
- Zone group membership filtering and visual distinction
- Multi-value selection UI for `oneOf` conditions

### Changed

- Reworked the visual editor's box-model layout and responsiveness
- Require named sensors for custom condition keys
- Deduplicate named sensors and add attribute field support

### Fixed

- **`data_age` reflects actual position freshness** - For `person.*` entities the age is now measured from the newest update among the person's attached **position** device trackers (those with `tracking_type: position` or GPS coordinates), instead of the person entity's own `last_updated`/`last_changed`. The person entity's timestamp churns on unrelated updates — presence pings from connection trackers or source-tracker switches — which falsely reset the age. Falls back to the entity's own timestamp when no position trackers exist. Debug output includes `data_age_basis` (which timestamp the age is based on and why) and `data_age_trackers` (how each attached tracker was classified and which one was selected).

## [0.2.0] - 2026-04-11

### Added

- Per-person avatar show/hide override
- Comprehensive style customization
- Show/hide location property with tristate checkbox for activities

### Changed

- Improved state tracking and reactivity for reliable sensor updates
- Disabled code splitting to bundle the editor inline for HACS distribution
- Moved default settings into their respective editor sections