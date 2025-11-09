export function parseYamlConfig(text) {
    let config = {};
    const lines = text.split('\n');

    // Helper: get indentation of a line
    function getIndent(line) {
        return line.match(/^(\s*)/)[1].length;
    }

    // Main parsing loop
    let i = 0;
    while (i < lines.length) {
        let line = lines[i];
        let trimmed = line.trim();

        // Top-level key:value
        let m = line.match(/^\s*([\w_]+):\s*(.*)$/);
        if (m && !trimmed.endsWith(':')) {
            // It's a scalar
            let [, key, value] = m;
            if (value.startsWith('[')) {
                // Array
                config[key] = JSON.parse(value.replace(/'/g, '"'));
            } else if (!isNaN(Number(value))) {
                config[key] = Number(value);
            } else if (value === 'true' || value === 'false') {
                config[key] = value === 'true';
            } else {
                config[key] = value;
            }
            i++;
            continue;
        }

        // persons: block
        if (trimmed.startsWith('persons:')) {
            config.persons = [];
            const baseIndent = getIndent(line);
            i++;
            let persona = null;
            while (i < lines.length) {
                let l = lines[i];
                let t = l.trim();
                let currentIndent = getIndent(l);
                // Stop if we hit a new section
                if (currentIndent === baseIndent && t.length && !t.startsWith('- ')) break;
                if (t.match(/- entity_id:/)) {
                    persona = { entity_id: t.split(':')[1].trim() };
                    config.persons.push(persona);
                }
                if (t.includes('name:') && persona) {
                    persona.name = t.split(':')[1].trim();
                }
                i++;
            }
            continue;
        }

        // zone_groups: block
        if (trimmed.startsWith('zone_groups:')) {
            config.zone_groups = [];
            const baseIndent = getIndent(line);
            i++;
            while (i < lines.length) {
                let l = lines[i];
                let t = l.trim();
                let currentIndent = getIndent(l);
                if (currentIndent === baseIndent && t.length && !t.startsWith('- ')) break;
                if (t.startsWith('- ')) {
                    let group = {};
                    // read until outdent or next "- "
                    i++;
                    while (i < lines.length) {
                        let lg = lines[i];
                        let tg = lg.trim();
                        let groupIndent = getIndent(lg);
                        // Stop at the next "- " of same zone_groups or outdent
                        if (groupIndent <= currentIndent && tg.startsWith('- ')) break;
                        if (tg.startsWith('name:')) group.name = tg.split(':')[1].trim().replace(/"/g, '');
                        if (tg.startsWith('zones:')) {
                            const arrMatch = tg.match(/\[([^\]]+)\]/);
                            if (arrMatch)
                                group.zones = arrMatch[1]
                                    .split(',')
                                    .map((z) => z.trim().replace(/"|'"/g, ''))
                                    .filter(Boolean);
                        }
                        if (tg.startsWith('preposition:')) group.preposition = tg.split(':')[1].trim().replace(/"/g, '');
                        if (tg.startsWith('show_preposition:')) group.show_preposition = tg.split(':')[1].trim() === 'true';
                        i++;
                    }
                    config.zone_groups.push(group);
                    continue;
                }
                i++;
            }
            continue;
        }
        i++;
    }

    return config;
}
