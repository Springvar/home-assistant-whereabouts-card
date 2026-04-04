import { describe, it, expect } from 'vitest';
import { TimeContextProvider } from './time-context-provider';

describe('TimeContextProvider', () => {
    describe('getTimeOfDay', () => {
        it('returns morning for 5am to 11:59am', () => {
            const provider5am = new TimeContextProvider(new Date('2026-04-03T05:00:00'));
            const provider11am = new TimeContextProvider(new Date('2026-04-03T11:59:00'));
            expect(provider5am.getTimeOfDay()).toBe('morning');
            expect(provider11am.getTimeOfDay()).toBe('morning');
        });

        it('returns afternoon for 12pm to 4:59pm', () => {
            const provider12pm = new TimeContextProvider(new Date('2026-04-03T12:00:00'));
            const provider4pm = new TimeContextProvider(new Date('2026-04-03T16:59:00'));
            expect(provider12pm.getTimeOfDay()).toBe('afternoon');
            expect(provider4pm.getTimeOfDay()).toBe('afternoon');
        });

        it('returns evening for 5pm to 9:59pm', () => {
            const provider5pm = new TimeContextProvider(new Date('2026-04-03T17:00:00'));
            const provider9pm = new TimeContextProvider(new Date('2026-04-03T21:59:00'));
            expect(provider5pm.getTimeOfDay()).toBe('evening');
            expect(provider9pm.getTimeOfDay()).toBe('evening');
        });

        it('returns night for 10pm to 4:59am', () => {
            const provider10pm = new TimeContextProvider(new Date('2026-04-03T22:00:00'));
            const provider4am = new TimeContextProvider(new Date('2026-04-03T04:59:00'));
            expect(provider10pm.getTimeOfDay()).toBe('night');
            expect(provider4am.getTimeOfDay()).toBe('night');
        });
    });

    describe('getDayType', () => {
        it('returns weekend for Saturday', () => {
            // Create a date and verify it's Saturday (day 6)
            const saturdayDate = new Date(2026, 0, 3); // January 3, 2026 is a Saturday
            const provider = new TimeContextProvider(saturdayDate);
            expect(provider.getDayType()).toBe('weekend');
        });

        it('returns weekend for Sunday', () => {
            // Create a date and verify it's Sunday (day 0)
            const sundayDate = new Date(2026, 0, 4); // January 4, 2026 is a Sunday
            const provider = new TimeContextProvider(sundayDate);
            expect(provider.getDayType()).toBe('weekend');
        });

        it('returns schoolday for Monday through Friday', () => {
            // April 1, 2026 is a Wednesday
            const wednesday = new TimeContextProvider(new Date('2026-04-01T14:00:00'));
            expect(wednesday.getDayType()).toBe('schoolday');

            // April 3, 2026 is a Friday
            const friday = new TimeContextProvider(new Date('2026-04-03T14:00:00'));
            expect(friday.getDayType()).toBe('schoolday');
        });
    });

    describe('matches', () => {
        it('returns true when expected is undefined', () => {
            const provider = new TimeContextProvider(new Date('2026-04-03T14:00:00'));
            expect(provider.matches(undefined)).toBe(true);
        });

        it('matches time of day correctly', () => {
            const afternoonProvider = new TimeContextProvider(new Date('2026-04-03T14:00:00'));
            expect(afternoonProvider.matches('afternoon')).toBe(true);
            expect(afternoonProvider.matches('morning')).toBe(false);
        });

        it('matches day type correctly', () => {
            // April 3, 2026 is a Friday
            const weekdayProvider = new TimeContextProvider(new Date('2026-04-03T14:00:00'));
            expect(weekdayProvider.matches('schoolday')).toBe(true);
            expect(weekdayProvider.matches('weekend')).toBe(false);

            // April 5, 2026 is a Saturday
            const weekendProvider = new TimeContextProvider(new Date('2026-04-05T14:00:00'));
            expect(weekendProvider.matches('weekend')).toBe(true);
            expect(weekendProvider.matches('schoolday')).toBe(false);
        });
    });

    describe('default constructor', () => {
        it('uses current time when no date provided', () => {
            const provider = new TimeContextProvider();
            const result = provider.getTimeOfDay();
            // Should return one of the valid time periods
            expect(['morning', 'afternoon', 'evening', 'night']).toContain(result);
        });
    });
});
