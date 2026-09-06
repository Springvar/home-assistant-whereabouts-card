export type StateLookup = (entityId: string) => any;

export interface DataAgeBasis {
    timestamp: string;
    source: string;
    reason: 'position-tracker' | 'entity';
}

/**
 * Whether an entity provides real position data, as opposed to a connection
 * tracker that merely pings presence. Connection trackers (WiFi/BLE/router)
 * update frequently for reasons unrelated to a location report, so their
 * timestamps must not be used as a staleness signal.
 */
export function isPositionTracker(entity: any): boolean {
    const attrs = entity?.attributes || {};
    const trackingType = attrs.tracking_type;
    if (trackingType) return trackingType === 'position';
    // Legacy trackers lack tracking_type; coordinates indicate a position source.
    return attrs.latitude !== undefined || attrs.longitude !== undefined;
}

/**
 * Resolve the timestamp that best represents when an entity's whereabouts was
 * last known to be updated.
 *
 * For `person.*` entities the person's own `last_changed`/`last_updated` is
 * avoided, because it churns on unrelated attribute updates (e.g. source
 * tracker switches or presence pings from connection trackers). Instead the
 * newest update among the position device trackers that Home Assistant uses to
 * derive the person's location is used.
 *
 * Falls back to the entity's own `last_changed`/`last_updated` when the entity
 * is not a person, has no attached device trackers, or none are position
 * trackers.
 */
export function getDataAgeBasis(entity: any, states: StateLookup): DataAgeBasis | null {
    if (!entity) return null;

    if (entity.entity_id?.startsWith('person.')) {
        const deviceTrackers = entity.attributes?.device_trackers;
        if (Array.isArray(deviceTrackers) && deviceTrackers.length > 0) {
            let newest: DataAgeBasis | null = null;
            for (const trackerId of deviceTrackers) {
                const tracker = states(trackerId);
                if (!tracker || !isPositionTracker(tracker)) continue;
                const timestamp = tracker.last_changed || tracker.last_updated;
                if (!timestamp) continue;
                if (!newest || new Date(timestamp).getTime() > new Date(newest.timestamp).getTime()) {
                    newest = { timestamp, source: trackerId, reason: 'position-tracker' };
                }
            }
            if (newest) return newest;
        }
    }

    const timestamp = entity.last_changed || entity.last_updated;
    if (!timestamp) return null;
    return { timestamp, source: entity.entity_id || '', reason: 'entity' };
}

/**
 * Age (in hours) since the entity's whereabouts was last known to be updated.
 * Returns Infinity when the entity is missing or has no usable timestamp.
 */
export function getDataAgeHours(entity: any, states: StateLookup): number {
    const basis = getDataAgeBasis(entity, states);
    if (!basis) return Infinity;
    const timestamp = new Date(basis.timestamp).getTime();
    if (isNaN(timestamp)) return Infinity;
    return (Date.now() - timestamp) / 3600000;
}