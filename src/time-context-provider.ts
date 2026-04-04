import { TimeOfDay, DayType } from './types';

export class TimeContextProvider {
    private now: Date;

    constructor(now?: Date) {
        this.now = now || new Date();
    }

    getTimeOfDay(): TimeOfDay {
        const hour = this.now.getHours();
        if (hour >= 5 && hour < 12) return 'morning';
        if (hour >= 12 && hour < 17) return 'afternoon';
        if (hour >= 17 && hour < 22) return 'evening';
        return 'night';
    }

    getDayType(): DayType {
        const day = this.now.getDay(); // 0 = Sunday, 6 = Saturday
        if (day === 0 || day === 6) return 'weekend';
        // TODO: Could enhance with HA calendar integration for holidays
        return 'schoolday';
    }

    matches(expected: TimeOfDay | DayType | undefined): boolean {
        if (!expected) return true;
        // Check if it's a time of day or day type
        if (['morning', 'afternoon', 'evening', 'night'].includes(expected)) {
            return this.getTimeOfDay() === expected;
        }
        return this.getDayType() === expected;
    }
}
