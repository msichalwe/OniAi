import fs from 'fs';
const file = '/Users/msichalwe/Documents/Projects/antigravity_workpal/onipal/plugins/aiMemoryPlugin.js';
let content = fs.readFileSync(file, 'utf8');

// Replace calls to readJSON and writeJSON
content = content.replace(/\b(readJSON|writeJSON)\(/g, (match, fnName, offset, fullText) => {
    const before = fullText.slice(Math.max(0, offset - 20), offset);
    if (before.includes('function ') || before.endsWith('await ')) {
        return match; // It's a declaration or already awaited
    }
    return 'await ' + match;
});

// Add async to middleware functions that aren't already async
content = content.replace(/server\.middlewares\.use\(([^,]+),\s*(async\s*)?\(\s*req,\s*res\s*\)\s*=>\s*\{/g, 'server.middlewares.use($1, async (req, res) => {');
content = content.replace(/server\.middlewares\.use\(([^,]+),\s*(async\s*)?req\s*=>\s*\{/g, 'server.middlewares.use($1, async req => {');

fs.writeFileSync(file, content, 'utf8');
console.log('Replaced successfully');
