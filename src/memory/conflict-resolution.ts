/**
 * Memory conflict resolution — detects and resolves contradictions
 * between new information and existing memory bubbles.
 *
 * Heuristic-based (no LLM). Fast and deterministic.
 */

import type { BubbleCategory, MemoryBubble } from "./bubbles/types.js";

// ─── Types ───

export type ConflictCandidate = {
  bubble: MemoryBubble;
  conflictScore: number;
  reason: string;
};

export type ConflictResolution = {
  action: "supersede" | "merge" | "keep-both" | "ignore";
  mergedContent?: string;
  reason: string;
};

// ─── Stop words for similarity computation ───

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "into", "through", "during",
  "before", "after", "above", "below", "between", "out", "off", "over",
  "under", "again", "further", "then", "once", "and", "but", "or", "nor",
  "not", "so", "yet", "both", "each", "few", "more", "most", "other",
  "some", "such", "no", "only", "own", "same", "than", "too", "very",
  "just", "because", "if", "when", "while", "how", "all", "any", "this",
  "that", "these", "those", "it", "its", "i", "me", "my", "we", "our",
  "you", "your", "he", "him", "his", "she", "her", "they", "them", "their",
  "what", "which", "who", "whom", "where", "about",
]);

// ─── Helpers ───

/** Extract meaningful words from text, lowercased and stop-word-filtered. */
function extractWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  return new Set(words);
}

/** Check whether two string arrays share at least one element. */
function hasOverlap(a: string[], b: string[]): boolean {
  const setB = new Set(b);
  return a.some((id) => setB.has(id));
}

// ─── Public API ───

/**
 * Jaccard similarity on word sets after lowercasing and removing stop words.
 * Returns 0-1.
 */
export function computeContentSimilarity(a: string, b: string): number {
  const wordsA = extractWords(a);
  const wordsB = extractWords(b);

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Find existing bubbles that might conflict with new content.
 * Candidates share entities AND category, scored by keyword overlap.
 */
export function findConflictingBubbles(params: {
  content: string;
  entityIds: string[];
  category: BubbleCategory;
  existingBubbles: MemoryBubble[];
}): ConflictCandidate[] {
  const { content, entityIds, category, existingBubbles } = params;
  const candidates: ConflictCandidate[] = [];

  for (const bubble of existingBubbles) {
    // Must share at least one entity AND same category
    const sameCategory = bubble.category === category;
    const sharedEntities = hasOverlap(entityIds, bubble.entityIds);

    if (!sameCategory || !sharedEntities) continue;

    const similarity = computeContentSimilarity(content, bubble.content);

    // Only flag if there's meaningful keyword overlap (some topical relation)
    // but not zero (completely unrelated content in same category is not a conflict)
    if (similarity < 0.05) continue;

    const reason =
      similarity > 0.8
        ? "Near-duplicate content"
        : `Overlapping topic (similarity: ${similarity.toFixed(2)})`;

    candidates.push({
      bubble,
      conflictScore: similarity,
      reason,
    });
  }

  // Sort by conflict score descending (highest conflict first)
  candidates.sort((a, b) => b.conflictScore - a.conflictScore);

  return candidates;
}

/**
 * Determine how to resolve a conflict between an existing bubble and new content.
 * Heuristic-based — fast and deterministic, no LLM needed.
 */
export function resolveConflict(params: {
  existingBubble: MemoryBubble;
  newContent: string;
  newCategory: BubbleCategory;
}): ConflictResolution {
  const { existingBubble, newContent, newCategory } = params;
  const similarity = computeContentSimilarity(existingBubble.content, newContent);

  // High similarity → near-duplicate, ignore
  if (similarity > 0.8) {
    return {
      action: "ignore",
      reason: `Near-duplicate (similarity: ${similarity.toFixed(2)}). No new information.`,
    };
  }

  // "correction" category always supersedes the older matching fact
  if (newCategory === "correction") {
    return {
      action: "supersede",
      reason: "Correction supersedes previous memory.",
    };
  }

  // Same entities + same category + different content → newer info replaces
  if (existingBubble.category === newCategory) {
    return {
      action: "supersede",
      reason: `Updated information for same category "${newCategory}".`,
    };
  }

  // Same entities + different category → both are valid
  return {
    action: "keep-both",
    reason: `Different categories ("${existingBubble.category}" vs "${newCategory}"); both are relevant.`,
  };
}
