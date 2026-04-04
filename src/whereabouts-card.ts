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
    icon?: string;
}

export interface WhereaboutsCardConfig {
    persons: PersonConfig[];
    show_title?: boolean;
    title?: string;
    show_avatars?: boolean;
    default_verb?: string;
    default_preposition?: string;
    activities?: Activity[];
    zone_groups?: ZoneGroup[];
    template?: string; // Template for display (default: "{name} {verb} {-preposition} {-location} <right {icon}>")
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
    declare default_verb: string;

    @property({ type: String })
    declare default_preposition: string;

    @property({ type: Array })
    declare activities: Activity[];

    @property({ type: Array })
    declare zone_groups: ZoneGroup[];

    @property({ type: String })
    declare template: string;

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
            default_verb: 'is',
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
            default_verb: {},
            default_preposition: {},
            zone_groups: {}
        };
    }

    setConfig(config: WhereaboutsCardConfig) {
        // Initialize with defaults if not set
        if (!this.persons) this.persons = [];
        if (this.show_title === undefined) this.show_title = true;
        if (!this.title) this.title = 'Whereabouts';
        if (this.show_avatars === undefined) this.show_avatars = false;
        if (!this.default_verb) this.default_verb = 'is';
        if (!this.default_preposition) this.default_preposition = 'in';
        if (!this.activities) this.activities = [];
        if (!this.zone_groups) this.zone_groups = [];

        // Apply config
        this.persons = config.persons || [];
        this.show_title = config.show_title !== undefined ? config.show_title : true;
        this.title = config.title || 'Whereabouts';
        this.show_avatars = config.show_avatars !== undefined ? config.show_avatars : false;
        this.default_verb = config.default_verb || 'is';
        this.default_preposition = config.default_preposition || 'in';
        this.activities = config.activities || [];
        this.zone_groups = (config.zone_groups || []).map((z) => ({ ...z, show_preposition: z.show_preposition !== false }));
        this.template = config.template || '{name} {verb} {-preposition} {-location} <right {icon}>';
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
                                    if (group.name) zoneNameOverride = group.name;
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
                        if (evaluatedActivity?.location_override === '-') {
                            locationText = '';
                        } else if (evaluatedActivity?.location_override) {
                            locationText = evaluatedActivity.location_override;
                        }

                        // Determine effective show_preposition
                        const effectiveShowPreposition = evaluatedActivity?.show_preposition !== undefined
                            ? evaluatedActivity.show_preposition
                            : showPreposition;

                        // Prepare template variables
                        const templateVars = {
                            name,
                            verb: evaluatedActivity?.verb || this.default_verb,
                            preposition: effectiveShowPreposition ? usedPreposition : '',
                            location: locationText,
                            icon: displayIcon
                        };

                        // Render template
                        const rendered = this.renderTemplate(this.template, templateVars);

                        const avatarUrl = entity.attributes?.entity_picture || '';

                        return html`
                            <div class="person-container">
                                ${this.show_avatars && avatarUrl ? html`
                                    <div class="person-avatar-column">
                                        <img src="${avatarUrl}" class="person-avatar" />
                                    </div>
                                ` : ''}
                                <div class="person-content">
                                    <div class="person-location">
                                        ${rendered}
                                    </div>
                                    ${calculatedActivity
                                        ? html`
                                              <div class="person-activity">
                                                  <ha-icon icon="${calculatedActivity.icon}"></ha-icon>
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

                // Add the icon element
                rendered.push(html`<ha-icon icon="${variables.icon}"></ha-icon>`);
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
            align-items: flex-start;
            gap: 12px;
        }
        .person-avatar-column {
            flex-shrink: 0;
        }
        .person-avatar {
            width: 48px;
            height: 48px;
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
