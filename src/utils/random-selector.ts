export function selectRandom<T>(items: T | T[]): T {
    if (!Array.isArray(items)) return items;
    if (items.length === 0) throw new Error('Cannot select from empty array');
    return items[Math.floor(Math.random() * items.length)];
}
