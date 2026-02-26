/**
 * CommandParser — Parses dot-notation command strings into structured objects.
 * 
 * Input:  'browser.openUrl("youtube.com")'
 * Output: { namespace: 'browser', action: 'openUrl', args: ['youtube.com'] }
 */

export function parseCommand(raw) {
    const input = raw.trim();
    if (!input) return null;

    // Check for chained commands (pipe syntax)
    if (input.includes(' | ')) {
        return input.split(' | ').map(cmd => parseSingleCommand(cmd.trim())).filter(Boolean);
    }

    return parseSingleCommand(input);
}

function parseSingleCommand(input) {
    // Match: namespace.action(args) or namespace.subns.action(args)
    const match = input.match(/^([a-zA-Z_][\w.]*?)(?:\((.*)\))?$/s);
    if (!match) return null;

    const fullPath = match[1];
    const argsString = match[2] || '';

    const parts = fullPath.split('.');
    if (parts.length < 2) {
        return { namespace: parts[0], action: 'open', args: parseArgs(argsString), raw: input };
    }

    const action = parts.pop();
    const namespace = parts.join('.');

    return {
        namespace,
        action,
        args: parseArgs(argsString),
        raw: input,
    };
}

function parseArgs(argsString) {
    if (!argsString || !argsString.trim()) return [];

    const args = [];
    let current = '';
    let inString = false;
    let stringChar = '';
    let depth = 0; // tracks nesting of ( [ {

    for (let i = 0; i < argsString.length; i++) {
        const char = argsString[i];

        if (inString) {
            current += char;
            if (char === stringChar && argsString[i - 1] !== '\\') {
                inString = false;
                // If we're at depth 0 and this was a standalone string arg, push it
                if (depth === 0) {
                    // Don't push yet — wait for comma or end
                }
            }
        } else if ((char === '"' || char === "'") && depth === 0) {
            // Top-level string argument — mark start
            inString = true;
            stringChar = char;
            current += char;
        } else if (char === '"' || char === "'") {
            // String inside a nested structure — just track it for depth purposes
            // We need to skip the string content so we don't miscount brackets
            current += char;
            const quote = char;
            i++;
            while (i < argsString.length) {
                current += argsString[i];
                if (argsString[i] === quote && argsString[i - 1] !== '\\') break;
                i++;
            }
        } else if (char === '(' || char === '[' || char === '{') {
            depth++;
            current += char;
        } else if (char === ')' || char === ']' || char === '}') {
            depth--;
            current += char;
        } else if (char === ',' && depth === 0) {
            const trimmed = current.trim();
            if (trimmed) args.push(coerceArg(trimmed));
            current = '';
        } else {
            current += char;
        }
    }

    const trimmed = current.trim();
    if (trimmed) args.push(coerceArg(trimmed));

    return args;
}

function coerceArg(value) {
    // Strip surrounding quotes for simple string args: "hello" → hello
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1);
    }
    // Parse JSON arrays and objects
    if ((value.startsWith('[') && value.endsWith(']')) || (value.startsWith('{') && value.endsWith('}'))) {
        try { return JSON.parse(value); } catch { /* not valid JSON, return as string */ }
    }
    return coerceType(value);
}

function coerceType(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (!isNaN(value) && value !== '') return Number(value);
    // Parse JSON objects and arrays
    if ((value.startsWith('[') && value.endsWith(']')) || (value.startsWith('{') && value.endsWith('}'))) {
        try { return JSON.parse(value); } catch { /* not valid JSON, return as string */ }
    }
    return value;
}
