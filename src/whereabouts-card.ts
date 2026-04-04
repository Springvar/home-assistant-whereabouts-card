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
}

export interface WhereaboutsCardConfig {
    persons: PersonConfig[];
    show_title?: boolean;
    title?: string;
    default_verb?: string;
    default_preposition?: string;
    activities?: Activity[];
    zone_groups?: ZoneGroup[];
}

class WhereaboutsCard extends LitElement {
    @property({ type: Array })
    declare persons: PersonConfig[];

    @property({ type: Boolean })
    declare show_title: boolean;

    @property({ type: String })
    declare title: string;

    @property({ type: String })
    declare default_verb: string;

    @property({ type: String })
    declare default_preposition: string;

    @property({ type: Array })
    declare activities: Activity[];

    @property({ type: Array })
    declare zone_groups: ZoneGroup[];

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
        if (!this.default_verb) this.default_verb = 'is';
        if (!this.default_preposition) this.default_preposition = 'in';
        if (!this.activities) this.activities = [];
        if (!this.zone_groups) this.zone_groups = [];

        // Apply config
        this.persons = config.persons || [];
        this.show_title = config.show_title !== undefined ? config.show_title : true;
        this.title = config.title || 'Whereabouts';
        this.default_verb = config.default_verb || 'is';
        this.default_preposition = config.default_preposition || 'in';
        this.activities = config.activities || [];
        this.zone_groups = (config.zone_groups || []).map((z) => ({ ...z, show_preposition: z.show_preposition !== false }));
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

                        // Check if zone is in any zone group (match by entity ID or friendly name)
                        if (Array.isArray(this.zone_groups)) {
                            for (const group of this.zone_groups) {
                                if (group.zones.includes(zoneEntityId) || group.zones.includes(personState)) {
                                    showPreposition = group.show_preposition !== false;
                                    if (group.preposition) usedPreposition = group.preposition;
                                    if (group.name) zoneNameOverride = group.name;
                                    break;
                                }
                            }
                        }

                        const zoneDisplay = zoneNameOverride ?? zoneFriendlyName;

                        // Build the display text
                        let displayText = '';
                        if (evaluatedActivity) {
                            // Activity detected - use activity verb and handle location override
                            const locationOverride = evaluatedActivity.location_override;

                            // Activity can override zone group's show_preposition setting
                            const effectiveShowPreposition = evaluatedActivity.show_preposition !== undefined
                                ? evaluatedActivity.show_preposition
                                : showPreposition;

                            if (locationOverride === '-') {
                                // Don't show location
                                displayText = `${name} ${evaluatedActivity.verb}`;
                            } else if (locationOverride) {
                                // Use custom location override
                                displayText = `${name} ${evaluatedActivity.verb} ${locationOverride}`;
                            } else {
                                // Show regular zone location
                                displayText = `${name} ${evaluatedActivity.verb} ${effectiveShowPreposition ? usedPreposition + ' ' : ''}${zoneDisplay}`;
                            }
                        } else {
                            // No activity - show default format
                            displayText = `${name} ${this.default_verb} ${showPreposition ? usedPreposition + ' ' : ''}${zoneDisplay}`;
                        }

                        return html`
                            <div class="person-container">
                                <div class="person-location">${displayText}</div>
                                ${calculatedActivity
                                    ? html`
                                          <div class="person-activity">
                                              <ha-icon icon="${calculatedActivity.icon}"></ha-icon>
                                              <span>${calculatedActivity.text}</span>
                                          </div>
                                      `
                                    : ''}
                            </div>
                        `;
                    })}
                </div>
            </ha-card>
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
        }
        .person-location {
            margin-bottom: 4px;
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
