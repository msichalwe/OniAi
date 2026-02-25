/**
 * documentPlugin — Vite plugin providing document parsing APIs.
 *
 * Endpoints:
 *   POST /api/docs/parse     — Extract text from PDF/Word/Excel (upload file or path)
 *   GET  /api/docs/read      — Read + extract text from a file by path
 *   POST /api/docs/search    — Search text content across indexed documents
 *   POST /api/docs/create    — Create a new document (txt, md, csv)
 *   GET  /api/docs/info      — Get metadata about a document file
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// In-memory document index — maps filePath → { text, mtime, meta }
const docIndex = new Map();

function resolvePath(p) {
    if (!p) return null;
    if (p.startsWith('~')) p = path.join(os.homedir(), p.slice(1));
    return path.resolve(p);
}

function getExtension(filePath) {
    return path.extname(filePath).toLowerCase().replace('.', '');
}

/**
 * Extract text from a file based on its extension.
 * Supports: pdf, docx, xlsx, csv, txt, md, json, js, ts, jsx, tsx, py, etc.
 */
async function extractText(filePath) {
    const ext = getExtension(filePath);
    const stat = fs.statSync(filePath);

    const meta = {
        path: filePath,
        name: path.basename(filePath),
        ext,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
    };

    try {
        if (ext === 'pdf') {
            const { PDFParse } = await import('pdf-parse');
            const buffer = fs.readFileSync(filePath);
            const uint8 = new Uint8Array(buffer);
            const parser = new PDFParse(uint8);
            await parser.load();
            const data = await parser.getText();
            const info = await parser.getInfo().catch(() => ({}));
            return {
                text: data.text || '',
                meta: { ...meta, pages: data.total || 0, pdfInfo: info },
            };
        }

        if (ext === 'docx') {
            const mammoth = await import('mammoth');
            const fn = mammoth.extractRawText || mammoth.default?.extractRawText;
            if (!fn) throw new Error('mammoth.extractRawText not found');
            const result = await fn({ path: filePath });
            return { text: result.value, meta };
        }

        if (ext === 'xlsx' || ext === 'xls') {
            const xlsxMod = await import('xlsx');
            const XLSX = xlsxMod.default || xlsxMod;
            const workbook = XLSX.read(fs.readFileSync(filePath));
            const sheets = {};
            let fullText = '';
            for (const name of workbook.SheetNames) {
                const sheet = workbook.Sheets[name];
                const csv = XLSX.utils.sheet_to_csv(sheet);
                const json = XLSX.utils.sheet_to_json(sheet);
                sheets[name] = { csv, json, rowCount: json.length };
                fullText += `[Sheet: ${name}]\n${csv}\n\n`;
            }
            return {
                text: fullText,
                meta: { ...meta, sheetNames: workbook.SheetNames, sheets },
            };
        }

        if (ext === 'csv') {
            const text = fs.readFileSync(filePath, 'utf-8');
            const lines = text.split('\n');
            return {
                text,
                meta: { ...meta, lineCount: lines.length, headers: lines[0] },
            };
        }

        // Plain text / code files
        const textExts = [
            'txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 'py', 'rb',
            'go', 'rs', 'java', 'c', 'cpp', 'h', 'css', 'html', 'xml',
            'yaml', 'yml', 'toml', 'ini', 'sh', 'bash', 'zsh', 'sql',
            'graphql', 'env', 'log', 'conf', 'cfg', 'gitignore', 'dockerfile',
        ];

        if (textExts.includes(ext) || stat.size < 1024 * 512) {
            // Try reading as text if < 512KB
            try {
                const text = fs.readFileSync(filePath, 'utf-8');
                // Validate it's actually text (no null bytes)
                if (!text.includes('\0')) {
                    const lines = text.split('\n');
                    return {
                        text,
                        meta: { ...meta, lineCount: lines.length },
                    };
                }
            } catch {
                // Not readable as text
            }
        }

        return {
            text: null,
            meta: { ...meta, error: 'Unsupported file type for text extraction' },
        };
    } catch (err) {
        return {
            text: null,
            meta: { ...meta, error: err.message },
        };
    }
}

/**
 * Index a document — extract text and store in the in-memory index.
 */
async function indexDocument(filePath) {
    const result = await extractText(filePath);
    if (result.text) {
        docIndex.set(filePath, {
            text: result.text,
            meta: result.meta,
            // Build simple word frequency map for search scoring
            tokens: tokenize(result.text),
        });
    }
    return result;
}

/**
 * Tokenize text into lowercase word tokens with frequency counts.
 */
function tokenize(text) {
    const words = text.toLowerCase().match(/\b[a-z0-9_]+\b/g) || [];
    const freq = {};
    for (const w of words) {
        freq[w] = (freq[w] || 0) + 1;
    }
    return { freq, totalWords: words.length };
}

/**
 * Search across all indexed documents.
 * Returns scored results sorted by relevance.
 */
function searchIndex(query, limit = 20) {
    const queryTokens = query.toLowerCase().match(/\b[a-z0-9_]+\b/g) || [];
    if (queryTokens.length === 0) return [];

    const results = [];

    for (const [filePath, doc] of docIndex) {
        let score = 0;
        const matches = [];

        for (const qt of queryTokens) {
            if (doc.tokens.freq[qt]) {
                // TF score: frequency of term / total words
                const tf = doc.tokens.freq[qt] / doc.tokens.totalWords;
                // IDF approximation: boost rarer terms
                const docsWithTerm = [...docIndex.values()].filter(
                    (d) => d.tokens.freq[qt]
                ).length;
                const idf = Math.log(docIndex.size / (docsWithTerm + 1)) + 1;
                score += tf * idf;
                matches.push({ term: qt, count: doc.tokens.freq[qt] });
            }
        }

        // Also check for exact phrase match (bonus)
        const lowerText = doc.text.toLowerCase();
        const lowerQuery = query.toLowerCase();
        const exactIdx = lowerText.indexOf(lowerQuery);
        if (exactIdx !== -1) {
            score += 2; // Big bonus for exact match
            // Extract snippet around the match
            const start = Math.max(0, exactIdx - 60);
            const end = Math.min(doc.text.length, exactIdx + query.length + 60);
            const snippet = doc.text.substring(start, end).replace(/\n/g, ' ');
            matches.push({ exact: true, snippet: `...${snippet}...` });
        }

        if (score > 0) {
            results.push({
                path: filePath,
                name: doc.meta.name,
                ext: doc.meta.ext,
                score: Math.round(score * 10000) / 10000,
                matches,
                meta: doc.meta,
            });
        }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Find all occurrences of a string in a document's text.
 */
function findInDocument(filePath, needle, caseSensitive = false) {
    const doc = docIndex.get(filePath);
    if (!doc || !doc.text) return { matches: [], total: 0 };

    const text = caseSensitive ? doc.text : doc.text.toLowerCase();
    const search = caseSensitive ? needle : needle.toLowerCase();

    const occurrences = [];
    let idx = 0;
    while ((idx = text.indexOf(search, idx)) !== -1) {
        // Find line number
        const linesBefore = doc.text.substring(0, idx).split('\n');
        const lineNo = linesBefore.length;
        const colNo = linesBefore[linesBefore.length - 1].length + 1;
        // Snippet
        const start = Math.max(0, idx - 40);
        const end = Math.min(text.length, idx + search.length + 40);
        const snippet = doc.text.substring(start, end).replace(/\n/g, ' ');

        occurrences.push({ line: lineNo, col: colNo, snippet: `...${snippet}...` });
        idx += search.length;
    }

    return { matches: occurrences, total: occurrences.length };
}

// ─── Helper: collect body from POST request ───
function collectBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString()));
            } catch {
                resolve({});
            }
        });
        req.on('error', reject);
    });
}

function json(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

export default function documentPlugin() {
    return {
        name: 'document-api',
        configureServer(server) {

            // Auto-index common document directories on startup
            setTimeout(async () => {
                const dirsToIndex = [
                    path.join(os.homedir(), 'Documents'),
                    path.join(os.homedir(), 'Desktop'),
                ];
                const docExts = new Set(['pdf', 'docx', 'xlsx', 'xls', 'csv', 'txt', 'md', 'json']);
                let indexed = 0;

                for (const dir of dirsToIndex) {
                    if (!fs.existsSync(dir)) continue;
                    const files = walkDir(dir, 2); // depth 2
                    for (const f of files) {
                        const ext = getExtension(f);
                        if (!docExts.has(ext)) continue;
                        // Skip large files (> 10MB)
                        try {
                            const stat = fs.statSync(f);
                            if (stat.size > 10 * 1024 * 1024) continue;
                        } catch { continue; }
                        try {
                            await indexDocument(f);
                            indexed++;
                        } catch {
                            // Skip files that fail to parse
                        }
                        if (indexed >= 200) break; // Safety cap
                    }
                    if (indexed >= 200) break;
                }

                if (indexed > 0) {
                    console.log(`[DocumentPlugin] Auto-indexed ${indexed} documents from ~/Documents and ~/Desktop`);
                }
            }, 3000); // Delay 3s to not block server startup

            // GET /api/docs/read?path=... — Read + extract text from file
            server.middlewares.use('/api/docs/read', async (req, res) => {
                try {
                    const url = new URL(req.url, 'http://localhost');
                    const filePath = resolvePath(url.searchParams.get('path'));
                    if (!filePath) return json(res, 400, { error: 'Missing path' });
                    if (!fs.existsSync(filePath)) return json(res, 404, { error: 'File not found' });

                    const result = await indexDocument(filePath);
                    json(res, 200, result);
                } catch (err) {
                    json(res, 500, { error: err.message });
                }
            });

            // GET /api/docs/info?path=... — Get metadata without full text
            server.middlewares.use('/api/docs/info', async (req, res) => {
                try {
                    const url = new URL(req.url, 'http://localhost');
                    const filePath = resolvePath(url.searchParams.get('path'));
                    if (!filePath) return json(res, 400, { error: 'Missing path' });
                    if (!fs.existsSync(filePath)) return json(res, 404, { error: 'File not found' });

                    const stat = fs.statSync(filePath);
                    const ext = getExtension(filePath);
                    json(res, 200, {
                        path: filePath,
                        name: path.basename(filePath),
                        ext,
                        size: stat.size,
                        mtime: stat.mtime.toISOString(),
                        indexed: docIndex.has(filePath),
                    });
                } catch (err) {
                    json(res, 500, { error: err.message });
                }
            });

            // POST /api/docs/search — Search indexed documents
            // Body: { query, limit? }
            server.middlewares.use('/api/docs/search', async (req, res) => {
                if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
                try {
                    const body = await collectBody(req);
                    if (!body.query) return json(res, 400, { error: 'Missing query' });
                    const results = searchIndex(body.query, body.limit || 20);
                    json(res, 200, {
                        query: body.query,
                        total: results.length,
                        indexedDocs: docIndex.size,
                        results,
                    });
                } catch (err) {
                    json(res, 500, { error: err.message });
                }
            });

            // POST /api/docs/find — Find text in a specific document
            // Body: { path, needle, caseSensitive? }
            server.middlewares.use('/api/docs/find', async (req, res) => {
                if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
                try {
                    const body = await collectBody(req);
                    const filePath = resolvePath(body.path);
                    if (!filePath) return json(res, 400, { error: 'Missing path' });
                    if (!body.needle) return json(res, 400, { error: 'Missing needle' });

                    // Index if not already indexed
                    if (!docIndex.has(filePath)) {
                        if (!fs.existsSync(filePath)) return json(res, 404, { error: 'File not found' });
                        await indexDocument(filePath);
                    }

                    const result = findInDocument(filePath, body.needle, body.caseSensitive);
                    json(res, 200, { path: filePath, needle: body.needle, ...result });
                } catch (err) {
                    json(res, 500, { error: err.message });
                }
            });

            // POST /api/docs/index — Index a file or directory
            // Body: { path, recursive? }
            server.middlewares.use('/api/docs/index', async (req, res) => {
                if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
                try {
                    const body = await collectBody(req);
                    const targetPath = resolvePath(body.path);
                    if (!targetPath) return json(res, 400, { error: 'Missing path' });
                    if (!fs.existsSync(targetPath)) return json(res, 404, { error: 'Path not found' });

                    const stat = fs.statSync(targetPath);
                    const indexed = [];

                    if (stat.isFile()) {
                        const result = await indexDocument(targetPath);
                        indexed.push({ path: targetPath, hasText: !!result.text });
                    } else if (stat.isDirectory()) {
                        const maxDepth = body.recursive ? 3 : 1;
                        const files = walkDir(targetPath, maxDepth);
                        for (const f of files.slice(0, 200)) {
                            try {
                                const result = await indexDocument(f);
                                indexed.push({ path: f, hasText: !!result.text });
                            } catch {
                                indexed.push({ path: f, hasText: false });
                            }
                        }
                    }

                    json(res, 200, {
                        indexed: indexed.length,
                        totalIndexed: docIndex.size,
                        files: indexed,
                    });
                } catch (err) {
                    json(res, 500, { error: err.message });
                }
            });

            // GET /api/docs/indexed — List all indexed documents
            server.middlewares.use('/api/docs/indexed', (req, res) => {
                const docs = [];
                for (const [filePath, doc] of docIndex) {
                    docs.push({
                        path: filePath,
                        name: doc.meta.name,
                        ext: doc.meta.ext,
                        size: doc.meta.size,
                        wordCount: doc.tokens.totalWords,
                    });
                }
                json(res, 200, { total: docs.length, documents: docs });
            });

            // POST /api/docs/create — Create a new document
            // Body: { path, content, type? }
            server.middlewares.use('/api/docs/create', async (req, res) => {
                if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
                try {
                    const body = await collectBody(req);
                    const filePath = resolvePath(body.path);
                    if (!filePath) return json(res, 400, { error: 'Missing path' });

                    const dir = path.dirname(filePath);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }

                    const ext = getExtension(filePath);

                    if (ext === 'xlsx') {
                        const xlsxMod = await import('xlsx');
                        const XLSX = xlsxMod.default || xlsxMod;
                        const wb = XLSX.utils.book_new();
                        if (body.sheets) {
                            // Create from sheet data
                            for (const [name, data] of Object.entries(body.sheets)) {
                                const ws = XLSX.utils.json_to_sheet(data);
                                XLSX.utils.book_append_sheet(wb, ws, name);
                            }
                        } else {
                            // Empty sheet
                            const ws = XLSX.utils.aoa_to_sheet([['Column A', 'Column B', 'Column C']]);
                            XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
                        }
                        XLSX.writeFile(wb, filePath);
                    } else {
                        fs.writeFileSync(filePath, body.content || '', 'utf-8');
                    }

                    // Index the new file
                    await indexDocument(filePath);
                    json(res, 200, { success: true, path: filePath });
                } catch (err) {
                    json(res, 500, { error: err.message });
                }
            });
        },
    };
}

/**
 * Walk a directory tree up to maxDepth, collecting file paths.
 */
function walkDir(dir, maxDepth, currentDepth = 0) {
    if (currentDepth >= maxDepth) return [];
    const files = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name.startsWith('.')) continue;
            if (entry.name === 'node_modules') continue;
            const full = path.join(dir, entry.name);
            if (entry.isFile()) {
                files.push(full);
            } else if (entry.isDirectory()) {
                files.push(...walkDir(full, maxDepth, currentDepth + 1));
            }
        }
    } catch {
        // Permission denied, etc.
    }
    return files;
}
