# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

## [0.2.2-pre] - 2026-09-06

### Added

- **Data staleness (`data_age`) condition** - Match on how long ago a person's location was last updated.
  - Supported in `hideIf` (e.g. `hideIf: { data_age: ">24" }`) to hide stale/outdated entries.
  - Supported in activity `conditions` (e.g. `data_age: ">24"`) to show a fallback activity for stale presence.
  - The age is computed in hours from the entity's `last_updated`/`last_changed`; a missing entity or timestamp is treated as always stale.

## [0.2.1-pre] - 2026-04-21

### Added

- Zone group ordering and conditional activity application
- Activity overrides with conditions on zone groups
- Zone group membership filtering and visual distinction
- Multi-value selection UI for `oneOf` conditions

### Changed

- Reworked the visual editor's box-model layout and responsiveness
- Require named sensors for custom condition keys
- Deduplicate named sensors and add attribute field support

## [0.2.0] - 2026-04-11

### Added

- Per-person avatar show/hide override
- Comprehensive style customization
- Show/hide location property with tristate checkbox for activities

### Changed

- Improved state tracking and reactivity for reliable sensor updates
- Disabled code splitting to bundle the editor inline for HACS distribution
- Moved default settings into their respective editor sections