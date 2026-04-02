import { describe, it, expect, beforeEach } from 'vitest';
import './whereabouts-card';

// Mock hass object
function createMockHass(states: Record<string, any> = {}) {
    return {
        states,
        config: {},
        connection: {
            subscribeEvents: () => {}
        }
    };
}

describe('WhereaboutsCard', () => {
    let element: any;

    beforeEach(() => {
        element = document.createElement('whereabouts-card');
        document.body.appendChild(element);
    });

    describe('setConfig', () => {
        it('sets persons from config', () => {
            const config = {
                persons: [
                    { entity_id: 'person.john' },
                    { entity_id: 'person.jane', name: 'Jane Doe' }
                ]
            };
            element.setConfig(config);
            expect(element.persons).toEqual(config.persons);
        });

        it('sets show_title to false when explicitly disabled', () => {
            element.setConfig({ persons: [], show_title: false });
            expect(element.show_title).toBe(false);
        });

        it('defaults show_title to true', () => {
            element.setConfig({ persons: [] });
            expect(element.show_title).toBe(true);
        });

        it('sets custom title', () => {
            element.setConfig({ persons: [], title: 'My Locations' });
            expect(element.title).toBe('My Locations');
        });

        it('defaults title to "Whereabouts"', () => {
            element.setConfig({ persons: [] });
            expect(element.title).toBe('Whereabouts');
        });

        it('sets custom default_verb', () => {
            element.setConfig({ persons: [], default_verb: 'are' });
            expect(element.default_verb).toBe('are');
        });

        it('defaults default_verb to "is"', () => {
            element.setConfig({ persons: [] });
            expect(element.default_verb).toBe('is');
        });

        it('sets custom default_preposition', () => {
            element.setConfig({ persons: [], default_preposition: 'at' });
            expect(element.default_preposition).toBe('at');
        });

        it('defaults default_preposition to "in"', () => {
            element.setConfig({ persons: [] });
            expect(element.default_preposition).toBe('in');
        });

        it('sets zone_groups from config', () => {
            const config = {
                persons: [],
                zone_groups: [
                    { name: 'work', zones: ['zone.office'], show_preposition: false }
                ]
            };
            element.setConfig(config);
            expect(element.zone_groups).toEqual(config.zone_groups);
        });

        it('defaults show_preposition to true in zone_groups', () => {
            const config = {
                persons: [],
                zone_groups: [
                    { name: 'work', zones: ['zone.office'] }
                ]
            };
            element.setConfig(config);
            expect(element.zone_groups[0].show_preposition).toBe(true);
        });

        it('handles empty config', () => {
            element.setConfig({} as any);
            expect(element.persons).toEqual([]);
            expect(element.show_title).toBe(true);
        });
    });

    describe('getStubConfig', () => {
        it('returns stub config with first person entity', () => {
            const hass = createMockHass({
                'person.john': { state: 'home' },
                'person.jane': { state: 'work' },
                'sensor.temp': { state: '20' }
            });
            const config = (element.constructor as any).getStubConfig(hass);
            expect(config.persons).toHaveLength(1);
            expect(config.persons[0].entity_id).toBe('person.john');
            expect(config.show_title).toBe(true);
            expect(config.title).toBe('Whereabouts');
        });

        it('returns empty persons array when no person entities exist', () => {
            const hass = createMockHass({
                'sensor.temp': { state: '20' }
            });
            const config = (element.constructor as any).getStubConfig(hass);
            expect(config.persons).toEqual([]);
        });
    });

    describe('getZoneEntityIdByFriendlyName', () => {
        it('finds zone entity by friendly name', () => {
            const hass = createMockHass({
                'zone.home': { attributes: { friendly_name: 'Home' } },
                'zone.office': { attributes: { friendly_name: 'Office' } }
            });
            const result = element.getZoneEntityIdByFriendlyName(hass, 'Office');
            expect(result).toBe('zone.office');
        });

        it('returns undefined when zone not found', () => {
            const hass = createMockHass({
                'zone.home': { attributes: { friendly_name: 'Home' } }
            });
            const result = element.getZoneEntityIdByFriendlyName(hass, 'Office');
            expect(result).toBeUndefined();
        });

        it('returns undefined when no zones exist', () => {
            const hass = createMockHass({});
            const result = element.getZoneEntityIdByFriendlyName(hass, 'Office');
            expect(result).toBeUndefined();
        });
    });

    describe('render', () => {
        it('renders "No persons configured" when persons array is empty', async () => {
            element.setConfig({ persons: [] });
            element.hass = createMockHass();
            await element.updateComplete;
            const content = element.shadowRoot?.textContent || '';
            expect(content).toContain('No persons configured');
        });

        it('renders "No persons configured" when hass is not set', async () => {
            element.setConfig({ persons: [{ entity_id: 'person.john' }] });
            await element.updateComplete;
            const content = element.shadowRoot?.textContent || '';
            expect(content).toContain('No persons configured');
        });

        it('renders person with default settings', async () => {
            const hass = createMockHass({
                'person.john': {
                    state: 'Home',
                    attributes: { friendly_name: 'John Doe' }
                }
            });
            element.setConfig({ persons: [{ entity_id: 'person.john' }] });
            element.hass = hass;
            await element.updateComplete;
            const content = element.shadowRoot?.textContent || '';
            expect(content).toContain('John Doe');
            expect(content).toContain('is');
            expect(content).toContain('in');
            expect(content).toContain('Home');
        });

        it('renders card header when show_title is true', async () => {
            const hass = createMockHass({
                'person.john': { state: 'home', attributes: { friendly_name: 'John' } }
            });
            element.setConfig({ persons: [{ entity_id: 'person.john' }], show_title: true, title: 'Locations' });
            element.hass = hass;
            await element.updateComplete;
            const header = element.shadowRoot?.querySelector('.card-header');
            expect(header?.textContent).toContain('Locations');
        });

        it('does not render card header when show_title is false', async () => {
            const hass = createMockHass({
                'person.john': { state: 'home', attributes: { friendly_name: 'John' } }
            });
            element.setConfig({ persons: [{ entity_id: 'person.john' }], show_title: false });
            element.hass = hass;
            await element.updateComplete;
            const header = element.shadowRoot?.querySelector('.card-header');
            expect(header).toBeNull();
        });

        it('uses custom name from config over entity friendly_name', async () => {
            const hass = createMockHass({
                'person.john': {
                    state: 'home',
                    attributes: { friendly_name: 'John Doe' }
                }
            });
            element.setConfig({
                persons: [{ entity_id: 'person.john', name: 'Johnny' }]
            });
            element.hass = hass;
            await element.updateComplete;
            const content = element.shadowRoot?.textContent || '';
            expect(content).toContain('Johnny');
            expect(content).not.toContain('John Doe');
        });

        it('shows entity_id as name fallback when no friendly_name', async () => {
            const hass = createMockHass({
                'person.john': { state: 'home', attributes: {} }
            });
            element.setConfig({ persons: [{ entity_id: 'person.john' }] });
            element.hass = hass;
            await element.updateComplete;
            const content = element.shadowRoot?.textContent || '';
            expect(content).toContain('person.john');
        });

        it('renders unavailable message for missing entity', async () => {
            const hass = createMockHass({});
            element.setConfig({ persons: [{ entity_id: 'person.missing' }] });
            element.hass = hass;
            await element.updateComplete;
            const content = element.shadowRoot?.textContent || '';
            expect(content).toContain('person.missing – unavailable');
        });

        it('applies zone group name override', async () => {
            const hass = createMockHass({
                'person.john': {
                    state: 'Office',
                    attributes: { friendly_name: 'John' }
                },
                'zone.office': { attributes: { friendly_name: 'Office' } }
            });
            element.setConfig({
                persons: [{ entity_id: 'person.john' }],
                zone_groups: [
                    { name: 'work', zones: ['zone.office'] }
                ]
            });
            element.hass = hass;
            await element.updateComplete;
            const content = element.shadowRoot?.textContent || '';
            expect(content).toContain('work');
            expect(content).not.toContain('Office');
        });

        it('applies custom preposition from zone group', async () => {
            const hass = createMockHass({
                'person.john': {
                    state: 'Office',
                    attributes: { friendly_name: 'John' }
                },
                'zone.office': { attributes: { friendly_name: 'Office' } }
            });
            element.setConfig({
                persons: [{ entity_id: 'person.john' }],
                default_preposition: 'in',
                zone_groups: [
                    { zones: ['zone.office'], preposition: 'at' }
                ]
            });
            element.hass = hass;
            await element.updateComplete;
            const content = element.shadowRoot?.textContent || '';
            // Check for the specific pattern "is at Office" not "is in Office"
            expect(content).toMatch(/John\s+is\s+at\s+Office/);
            expect(content).not.toMatch(/John\s+is\s+in\s+Office/);
        });

        it('hides preposition when zone group sets show_preposition to false', async () => {
            const hass = createMockHass({
                'person.john': {
                    state: 'Home',
                    attributes: { friendly_name: 'John' }
                },
                'zone.home': { attributes: { friendly_name: 'Home' } }
            });
            element.setConfig({
                persons: [{ entity_id: 'person.john' }],
                default_preposition: 'at',
                zone_groups: [
                    { zones: ['zone.home'], show_preposition: false }
                ]
            });
            element.hass = hass;
            await element.updateComplete;
            const content = element.shadowRoot?.textContent || '';
            expect(content).toContain('John');
            expect(content).toContain('is');
            expect(content).not.toContain('at');
            expect(content).toContain('Home');
        });

        it('matches zone groups by zone entity ID', async () => {
            const hass = createMockHass({
                'person.john': {
                    state: 'Office Building',
                    attributes: { friendly_name: 'John' }
                },
                'zone.office': { attributes: { friendly_name: 'Office Building' } }
            });
            element.setConfig({
                persons: [{ entity_id: 'person.john' }],
                zone_groups: [
                    { name: 'workplace', zones: ['zone.office'], show_preposition: false }
                ]
            });
            element.hass = hass;
            await element.updateComplete;
            const content = element.shadowRoot?.textContent || '';
            expect(content).toContain('workplace');
        });

        it('matches zone groups by friendly name when entity ID not found', async () => {
            const hass = createMockHass({
                'person.john': {
                    state: 'Office',
                    attributes: { friendly_name: 'John' }
                }
            });
            element.setConfig({
                persons: [{ entity_id: 'person.john' }],
                zone_groups: [
                    { name: 'work', zones: ['Office'] }
                ]
            });
            element.hass = hass;
            await element.updateComplete;
            const content = element.shadowRoot?.textContent || '';
            expect(content).toContain('work');
        });

        it('renders multiple persons correctly', async () => {
            const hass = createMockHass({
                'person.john': { state: 'Home', attributes: { friendly_name: 'John' } },
                'person.jane': { state: 'Office', attributes: { friendly_name: 'Jane' } }
            });
            element.setConfig({
                persons: [
                    { entity_id: 'person.john' },
                    { entity_id: 'person.jane' }
                ]
            });
            element.hass = hass;
            await element.updateComplete;
            const content = element.shadowRoot?.textContent || '';
            expect(content).toContain('John');
            expect(content).toContain('Jane');
            expect(content).toContain('Home');
            expect(content).toContain('Office');
        });
    });

    describe('getConfigElement', () => {
        it('returns editor element asynchronously', async () => {
            const config = { persons: [] };
            const editorEl = await (element.constructor as any).getConfigElement(config);
            expect(editorEl.tagName.toLowerCase()).toBe('whereabouts-card-editor');
        });
    });

    describe('getConfigElementStatic', () => {
        it('returns editor element synchronously', () => {
            const config = { persons: [] };
            const editorEl = (element.constructor as any).getConfigElementStatic(config);
            expect(editorEl.tagName.toLowerCase()).toBe('whereabouts-card-editor');
        });
    });
});
