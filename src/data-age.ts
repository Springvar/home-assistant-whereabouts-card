export type StateLookup = (entityId: string) => any;

export interface DataAgeBasis {
    timestamp: string;
    source: string;
    reason: 'position-tracker' | 'entity';
}

export interface TrackerSourceInfo {
    entity_id: string;
    available: boolean;
    position: boolean;
    tracking_type?: string;
    has_coordinates: boolean;
    latitude?: number;
    longitude?: number;
    last_changed?: string;
    last_updated?: string;
    data_age_hours: number | null;
    selected: boolean;
}

function ageHoursFromTimestamp(timestamp: string | null | undefined): number {
    if (!timestamp) return Infinity;
    const parsed = new Date(timestamp).getTime();
    if (isNaN(parsed)) return Infinity;
    return (Date.now() - parsed) / 3600000;
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
 * Newest update among the person's attached position trackers, or null when
 * there is no usable position tracker. The person's own last_changed/updated
 * is deliberately not consulted here: it churns on unrelated attribute updates
 * (presence pings, source-tracker switches).
 */
function resolveNewestTracker(entity: any, states: StateLookup): DataAgeBasis | null {
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
            return newest;
        }
    }
    return null;
}

/**
 * Diagnostic detail for every device tracker attached to a person, including
 * whether it qualifies as a position source and whether it was selected as the
 * newest. Useful for debugging why a given data_age is reported.
 */
export function getTrackerDiagnostics(entity: any, states: StateLookup): TrackerSourceInfo[] {
    const deviceTrackers = Array.isArray(entity?.attributes?.device_trackers) ? entity.attributes.device_trackers : [];
    const selectedId = resolveNewestTracker(entity, states)?.source ?? null;
    return deviceTrackers.map((trackerId: string) => {
        const tracker = states(trackerId);
        if (!tracker) {
            return {
                entity_id: trackerId,
                available: false,
                position: false,
                has_coordinates: false,
                data_age_hours: null,
                selected: false,
            };
        }
        const isPosition = isPositionTracker(tracker);
        return {
            entity_id: trackerId,
            available: true,
            position: isPosition,
            tracking_type: tracker.attributes?.tracking_type ?? undefined,
            has_coordinates:
                tracker.attributes?.latitude !== undefined || tracker.attributes?.longitude !== undefined,
            latitude: tracker.attributes?.latitude,
            longitude: tracker.attributes?.longitude,
            last_changed: tracker.last_changed,
            last_updated: tracker.last_updated,
            data_age_hours: ageHoursFromTimestamp(tracker.last_changed || tracker.last_updated),
            selected: selectedId === trackerId,
        };
    });
}

/**
 * Resolve the timestamp that best represents when an entity's whereabouts was
 * last known to be updated.
 *
 * For `person.*` entities the person's own `last_updated`/`last_changed` is
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

    const trackerBasis = resolveNewestTracker(entity, states);
    if (trackerBasis) return trackerBasis;

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
    return ageHoursFromTimestamp(basis.timestamp);
}

/**
 * How long (in hours) the entity has held its current state value.
 * For a person entity the state is the current zone, so this is the time since
 * the person entered their current location. Unlike `data_age`, this churns
 * only when the zone actually changes.
 */
export function getHoursAtLocation(entity: any): number | null {
    if (!entity?.last_changed) return null;
    const parsed = new Date(entity.last_changed).getTime();
    if (isNaN(parsed)) return null;
    return (Date.now() - parsed) / 3600000;
}