/**
 * Importance decay and reinforcement for memory bubbles.
 * Memories naturally fade unless reinforced, like human memory.
 * Pure functions only — no side effects.
 */

const MS_PER_DAY = 86_400_000;

export const DECAY_DEFAULTS = {
	halfLifeDays: 30,
	minImportance: 0.01,
	reinforceBoost: 0.1,
	maxRecallBoost: 2.0,
} as const;

/** Compute the effective importance of a bubble considering temporal decay and reinforcement. */
export function computeDecayedImportance(params: {
	baseImportance: number;
	createdAtMs: number;
	lastAccessedAtMs?: number;
	recallCount: number;
	halfLifeDays?: number;
	nowMs?: number;
}): number {
	const now = params.nowMs ?? Date.now();
	const halfLife = params.halfLifeDays ?? DECAY_DEFAULTS.halfLifeDays;
	const anchor = params.lastAccessedAtMs ?? params.createdAtMs;

	const daysSinceAccess = Math.max(0, (now - anchor) / MS_PER_DAY);
	const decayFactor = Math.pow(0.5, daysSinceAccess / halfLife);

	// Diminishing returns from repeated recall
	const reinforcementBoost = 1 + Math.log1p(params.recallCount) * 0.15;

	const effective = params.baseImportance * decayFactor * reinforcementBoost;
	return Math.min(1, Math.max(0, effective));
}

/** Build SQL UPDATE statement for batch-updating bubble importance with temporal decay. */
export function buildDecayUpdateSQL(params?: {
	tableName?: string;
	halfLifeDays?: number;
	minImportance?: number;
}): string {
	const table = params?.tableName ?? "bubbles";
	const halfLife = params?.halfLifeDays ?? DECAY_DEFAULTS.halfLifeDays;
	const minImp = params?.minImportance ?? DECAY_DEFAULTS.minImportance;
	const halfLifeMs = halfLife * MS_PER_DAY;

	// SQLite-compatible: use COALESCE for lastAccessedAtMs fallback,
	// power(0.5, ...) via exp/ln, and clamp with MIN/MAX.
	return [
		`UPDATE ${table} SET importance = MIN(1.0, MAX(0.0,`,
		`  importance`,
		`  * POWER(0.5, (CAST(strftime('%s','now') AS REAL) * 1000 - COALESCE(lastAccessedAtMs, createdAtMs)) / ${halfLifeMs}.0)`,
		`  * (1.0 + 0.15 * LN(1.0 + recallCount))`,
		`))`,
		`WHERE importance >= ${minImp};`,
	].join("\n");
}

/** Compute new importance after a bubble is recalled/accessed. */
export function reinforceBubble(params: {
	currentImportance: number;
	recallCount: number;
	boostAmount?: number;
}): number {
	const boost = params.boostAmount ?? DECAY_DEFAULTS.reinforceBoost;

	// Diminishing returns: boost shrinks as recall count grows
	const diminishing = boost / (1 + params.recallCount * 0.1);
	const reinforced = params.currentImportance + diminishing;

	return Math.min(1.0, Math.max(0, reinforced));
}

/** Recalculate entity importance based on mention frequency and recency. */
export function computeEntityImportance(params: {
	mentionCount: number;
	firstSeenAtMs: number;
	lastSeenAtMs: number;
	nowMs?: number;
}): number {
	const now = params.nowMs ?? Date.now();

	// Mention density: mentions per day (avoid division by zero)
	const spanDays = Math.max(1, (params.lastSeenAtMs - params.firstSeenAtMs) / MS_PER_DAY);
	const density = params.mentionCount / spanDays;

	// Frequency score: log scale with saturation around density ~10/day
	const frequencyScore = Math.min(1, Math.log1p(density) / Math.log1p(10));

	// Recency score: exponential decay from last seen (half-life of 14 days)
	const daysSinceLastSeen = Math.max(0, (now - params.lastSeenAtMs) / MS_PER_DAY);
	const recencyScore = Math.pow(0.5, daysSinceLastSeen / 14);

	// Weighted combination: recency matters more than raw frequency
	const importance = 0.4 * frequencyScore + 0.6 * recencyScore;
	return Math.min(1, Math.max(0, importance));
}
