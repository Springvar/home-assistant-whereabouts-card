import { LitElement, html, css } from 'lit';
import { property } from 'lit/decorators.js';
import './whereabouts-card-editor';
import type { WhereaboutsCardEditor } from './whereabouts-card-editor';
import { ActivityCalculator } from './activity-calculator';
import { ActivityEvaluator, type EvaluatedActivity } from './activity-evaluator';
import { matchConditions } from './condition-matcher';
import type { CalculatedActivity, PersonConfig as PersonConfigType, Activity } from './types';

// Use extended PersonConfig from types.ts
type PersonConfig = PersonConfigType;

export interface ZoneGroup {
    name?: string;
    zones: string[];
    preposition?: string;
    show_preposition?: boolean;
    override_location?: boolean;
    icon?: string;
}

export interface WhereaboutsCardConfig {
    persons: PersonConfig[];
    show_title?: boolean;
    title?: string;
    show_avatars?: boolean;
    default_activity?: string;
    default_verb?: string; // Deprecated: use default_activity
    default_preposition?: string;
    activities?: Activity[];
    zone_groups?: ZoneGroup[];
    template?: string; // Template for display (default: "{name} {activity} {-preposition} {-location} <right {icon}>")
    // Style customization
    style?: {
        container_margin?: string;
        container_padding?: string;
        container_gap?: string;
        border_width?: string;
        border_style?: string;
        border_color?: string;
        avatar_size?: string;
        location_font_size?: string;
        activity_font_size?: string;
        location_icon_size?: string;
        location_icon_color?: string;
        activity_icon_size?: string;
        activity_icon_color?: string;
    };
}

class WhereaboutsCard extends LitElement {
    @property({ type: Array })
    declare persons: PersonConfig[];

    @property({ type: Boolean })
    declare show_title: boolean;

    @property({ type: String })
    declare title: string;

    @property({ type: Boolean })
    declare show_avatars: boolean;

    @property({ type: String })
    declare default_activity: string;

    @property({ type: String })
    declare default_preposition: string;

    @property({ type: Array })
    declare activities: Activity[];

    @property({ type: Array })
    declare zone_groups: ZoneGroup[];

    @property({ type: String })
    declare template: string;

    @property({ type: Object })
    declare config: WhereaboutsCardConfig;

    @property({ attribute: false })
    declare hass: any;

    static async getConfigElement(config: WhereaboutsCardConfig) {
        await import('./whereabouts-card-editor');
        const el = document.createElement('whereabouts-card-editor') as WhereaboutsCardEditor;
        el.setConfig(config);
        return el;
    }

    static getConfigElementStatic(config: WhereaboutsCardConfig) {
        const el = document.createElement('whereabouts-card-editor') as WhereaboutsCardEditor;
        el.setConfig(config);
        return el;
    }

    static getStubConfig(hass: any) {
        const persons = Object.keys(hass.states)
            .filter((eid) => eid.startsWith('person.'))
            .slice(0, 1)
            .map((eid) => ({ entity_id: eid }));
        return {
            persons,
            show_title: true,
            title: 'Whereabouts',
            default_activity: 'is',
            default_preposition: 'in',
            zone_groups: []
        };
    }

    static get properties() {
        return {
            hass: {},
            persons: {},
            show_title: {},
            title: {},
            default_activity: {},
            default_preposition: {},
            zone_groups: {}
        };
    }

    setConfig(config: WhereaboutsCardConfig) {
        // Store the full config
        this.config = config;

        // Initialize with defaults if not set
        if (!this.persons) this.persons = [];
        if (this.show_title === undefined) this.show_title = true;
        if (!this.title) this.title = 'Whereabouts';
        if (this.show_avatars === undefined) this.show_avatars = false;
        if (!this.default_activity) this.default_activity = 'is';
        if (!this.default_preposition) this.default_preposition = 'in';
        if (!this.activities) this.activities = [];
        if (!this.zone_groups) this.zone_groups = [];

        // Apply config (support both new and legacy field names)
        this.persons = config.persons || [];
        this.show_title = config.show_title !== undefined ? config.show_title : true;
        this.title = config.title || 'Whereabouts';
        this.show_avatars = config.show_avatars !== undefined ? config.show_avatars : false;
        this.default_activity = config.default_activity || config.default_verb || 'is';
        this.default_preposition = config.default_preposition || 'in';
        this.activities = config.activities || [];
        this.zone_groups = (config.zone_groups || []).map((z) => ({ ...z, show_preposition: z.show_preposition !== false }));
        this.template = config.template || '{name} {activity} {-preposition} {-location} <right {icon}>';
    }

    render() {
        if (!this.hass || this.persons.length === 0) {
            return html`<div>No persons configured</div>`;
        }

        return html`
            <ha-card>
                ${this.show_title ? html`<div class="card-header">${this.title}</div>` : ''}
                <div>
                    ${this.persons.map((person) => {
                        const entity = this.hass.states[person.entity_id];
                        if (!entity) return html`<div>${person.entity_id} – unavailable</div>`;

                        // Check hideIf condition
                        if (person.hideIf && matchConditions(this.hass, person, person.hideIf)) {
                            return html``; // Hide this person
                        }

                        const name = person.name || entity.attributes.friendly_name || person.entity_id;
                        const personState = entity.state; // zone name without "zone." prefix

                        // Evaluate general activities first
                        let evaluatedActivity: EvaluatedActivity | null = null;
                        if (this.activities && this.activities.length > 0) {
                            const evaluator = new ActivityEvaluator(this.hass, person, this.activities, this.zone_groups);
                            evaluatedActivity = evaluator.evaluate();

                            // Resolve sensor placeholders in activity
                            if (evaluatedActivity) {
                                evaluatedActivity.activity = this.resolveSensorPlaceholders(evaluatedActivity.activity, person);
                            }
                        }

                        // Fall back to person-specific activity rules if no general activity matched
                        let calculatedActivity: CalculatedActivity | null = null;
                        if (!evaluatedActivity && person.showActivity !== false && person.activityRules) {
                            const calculator = new ActivityCalculator(this.hass, person);
                            calculatedActivity = calculator.calculate();
                        }

                        // Construct full zone entity ID from person state
                        // Person state can be the zone name (e.g., "office", "Office") or a friendly name
                        let zoneEntityId = personState.startsWith('zone.')
                            ? personState
                            : `zone.${personState.toLowerCase().replace(/\s+/g, '_')}`;
                        let zoneEntity = this.hass.states[zoneEntityId];

                        // If zone not found by entity ID, try to find by friendly name
                        if (!zoneEntity) {
                            const foundZoneId = Object.keys(this.hass.states).find(
                                (eid: string) => eid.startsWith('zone.') &&
                                this.hass.states[eid]?.attributes?.friendly_name === personState
                            );
                            if (foundZoneId) {
                                zoneEntityId = foundZoneId;
                                zoneEntity = this.hass.states[zoneEntityId];
                            }
                        }

                        const zoneFriendlyName = zoneEntity?.attributes?.friendly_name || personState;
                        let usedPreposition = this.default_preposition;
                        let showPreposition = true;
                        let zoneNameOverride: string | undefined;
                        let zoneGroupIcon: string | undefined;

                        // Check if zone is in any zone group (match by entity ID or friendly name)
                        if (Array.isArray(this.zone_groups)) {
                            for (const group of this.zone_groups) {
                                if (group.zones.includes(zoneEntityId) || group.zones.includes(personState)) {
                                    showPreposition = group.show_preposition !== false;
                                    if (group.preposition) usedPreposition = group.preposition;
                                    if (group.name && group.override_location !== false) zoneNameOverride = group.name;
                                    if (group.icon) zoneGroupIcon = group.icon;
                                    break;
                                }
                            }
                        }

                        const zoneDisplay = zoneNameOverride ?? zoneFriendlyName;

                        // Determine icon with precedence: Activity icon > Zone group icon > Zone icon
                        const zoneDefaultIcon = zoneEntity?.attributes?.icon || 'mdi:map-marker';
                        const displayIcon = evaluatedActivity?.icon || zoneGroupIcon || zoneDefaultIcon;

                        // Determine location text
                        let locationText = zoneDisplay;
                        if (evaluatedActivity?.show_location === false) {
                            // Explicitly hide location
                            locationText = '';
                        } else if (evaluatedActivity?.location_override) {
                            // Use custom location text
                            locationText = evaluatedActivity.location_override;
                        }
                        // If show_location is undefined or true, use default zoneDisplay

                        // Determine effective preposition with precedence: Activity > Zone group > Default
                        let effectivePreposition = usedPreposition;
                        if (evaluatedActivity?.preposition !== undefined) {
                            effectivePreposition = evaluatedActivity.preposition;
                        }

                        // Determine effective show_preposition
                        // If activity specifies a preposition, show it by default unless explicitly disabled
                        let effectiveShowPreposition = showPreposition;
                        if (evaluatedActivity?.show_preposition !== undefined) {
                            effectiveShowPreposition = evaluatedActivity.show_preposition;
                        } else if (evaluatedActivity?.preposition !== undefined) {
                            // Activity has a preposition override, so show it
                            effectiveShowPreposition = true;
                        }

                        // Prepare template variables
                        const activityText = evaluatedActivity?.activity || this.default_activity;
                        const templateVars = {
                            name,
                            activity: activityText,
                            verb: activityText, // Backward compatibility: support legacy {verb} in templates
                            preposition: effectiveShowPreposition ? effectivePreposition : '',
                            location: locationText,
                            icon: displayIcon
                        };

                        // Render template
                        const rendered = this.renderTemplate(this.template, templateVars);

                        const avatarUrl = entity.attributes?.entity_picture || '';

                        // Apply custom styles
                        const containerStyle = this.config.style ? [
                            this.config.style.container_margin && `margin: ${this.config.style.container_margin}`,
                            this.config.style.container_padding && `padding: ${this.config.style.container_padding}`,
                            this.config.style.container_gap && `gap: ${this.config.style.container_gap}`,
                            this.config.style.border_width && `border-left-width: ${this.config.style.border_width}`,
                            this.config.style.border_style && `border-left-style: ${this.config.style.border_style}`,
                            this.config.style.border_color && `border-left-color: ${this.config.style.border_color}`,
                        ].filter(Boolean).join('; ') : '';

                        const avatarStyle = this.config.style?.avatar_size
                            ? `width: ${this.config.style.avatar_size}; height: ${this.config.style.avatar_size};`
                            : '';

                        const locationStyle = this.config.style?.location_font_size
                            ? `font-size: ${this.config.style.location_font_size};`
                            : '';

                        const activityStyle = this.config.style?.activity_font_size
                            ? `font-size: ${this.config.style.activity_font_size};`
                            : '';

                        const activityIconStyle = this.config.style?.activity_icon_size
                            ? `--mdc-icon-size: ${this.config.style.activity_icon_size};`
                            : '';

                        return html`
                            <div class="person-container" style="${containerStyle}">
                                ${this.show_avatars && avatarUrl ? html`
                                    <div class="person-avatar-column">
                                        <img src="${avatarUrl}" class="person-avatar" style="${avatarStyle}" />
                                    </div>
                                ` : ''}
                                <div class="person-content">
                                    <div class="person-location" style="${locationStyle}">
                                        ${rendered}
                                    </div>
                                    ${calculatedActivity
                                        ? html`
                                              <div class="person-activity" style="${activityStyle}">
                                                  <ha-icon icon="${calculatedActivity.icon}" style="${activityIconStyle}"></ha-icon>
                                                  <span>${calculatedActivity.text}</span>
                                              </div>
                                          `
                                        : ''}
                                </div>
                            </div>
                        `;
                    })}
                </div>
            </ha-card>
        `;
    }

    private resolveSensorPlaceholders(text: string, person: PersonConfig): string {
        if (!text || !person.namedSensors) return text;

        // Find all {placeholder} patterns
        return text.replace(/\{(\w+)\}/g, (match, sensorName) => {
            const sensor = person.namedSensors?.[sensorName];
            if (!sensor) return match; // Keep placeholder if sensor not found

            // Get the first entity_id (if array, use first one)
            const entityId = Array.isArray(sensor.entity_id) ? sensor.entity_id[0] : sensor.entity_id;
            const entity = this.hass.states[entityId];

            if (!entity) return match; // Keep placeholder if entity not found

            return entity.state || match;
        });
    }

    private renderTemplate(template: string, variables: { [key: string]: string }) {
        // Handle {-placeholder} - replace with value or remove preceding space if empty
        let processed = template.replace(/(\s*)\{-(\w+)\}/g, (match, space, key) => {
            const value = variables[key] || '';
            return value ? space + value : '';
        });

        // Extract <right ...> content if present
        const rightMatch = processed.match(/<right\s+([^>]+)>/);
        let leftContent = processed;
        let rightContent = '';

        if (rightMatch) {
            leftContent = processed.substring(0, rightMatch.index);
            rightContent = rightMatch[1];
        }

        // Function to render a string part with placeholder replacements
        const renderPart = (part: string) => {
            const rendered = [];
            let current = part;

            // Process the string, replacing {icon} with elements
            while (current) {
                const iconIndex = current.indexOf('{icon}');

                if (iconIndex === -1) {
                    // No more {icon} placeholders - replace regular placeholders and finish
                    let textPart = current;
                    for (const [key, value] of Object.entries(variables)) {
                        if (key !== 'icon') {
                            textPart = textPart.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
                        }
                    }
                    rendered.push(html`${textPart}`);
                    break;
                }

                // Add text before the {icon} placeholder
                let beforeText = current.substring(0, iconIndex);
                for (const [key, value] of Object.entries(variables)) {
                    if (key !== 'icon') {
                        beforeText = beforeText.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
                    }
                }
                if (beforeText) {
                    rendered.push(html`${beforeText}`);
                }

                // Add the icon element with custom styling
                const locationIconStyle = [
                    this.config.style?.location_icon_size && `--mdc-icon-size: ${this.config.style.location_icon_size}`,
                    this.config.style?.location_icon_color && `color: ${this.config.style.location_icon_color}`,
                ].filter(Boolean).join('; ');
                rendered.push(html`<ha-icon icon="${variables.icon}" style="${locationIconStyle}"></ha-icon>`);
                current = current.substring(iconIndex + 6); // length of '{icon}'
            }

            return rendered;
        };

        if (!rightMatch) {
            // No <right> directive
            return renderPart(leftContent);
        }

        // Has <right> directive - render left and right parts
        return html`
            <span>${renderPart(leftContent)}</span>
            <span style="margin-left: auto;">${renderPart(rightContent)}</span>
        `;
    }

    static styles = css`
        ha-card {
            padding: 16px;
        }
        .card-header {
            font-weight: bold;
            font-size: 1.2em;
            margin-bottom: 10px;
        }
        .person-container {
            margin: 12px 0;
            padding: 8px;
            border-left: 3px solid var(--primary-color);
            background: var(--card-background-color, #fff);
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .person-avatar-column {
            flex-shrink: 0;
        }
        .person-avatar {
            width: 38px;
            height: 38px;
            border-radius: 50%;
            object-fit: cover;
        }
        .person-content {
            flex: 1;
            min-width: 0;
        }
        .person-location {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 4px;
        }
        .person-location ha-icon {
            --mdc-icon-size: 20px;
            color: var(--primary-color);
        }
        .person-activity {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 6px;
            padding: 6px 8px;
            background: var(--primary-color);
            color: var(--text-primary-color);
            border-radius: 4px;
            font-weight: 500;
        }
        .person-activity ha-icon {
            --mdc-icon-size: 20px;
        }
    `;
}

customElements.define('whereabouts-card', WhereaboutsCard);

if (typeof window !== 'undefined') {
    (window as any).customCards = (window as any).customCards || [];
    (window as any).customCards.push({
        type: 'whereabouts-card',
        name: 'Whereabouts Card',
        preview: false,
        description: "Show one or more person's whereabouts as a simple card."
    });
}
