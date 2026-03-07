/**
 * Graph traversal utilities for the memory relationship graph.
 * Builds SQL queries using recursive CTEs for multi-hop traversal over SQLite.
 */

import type { EntityType, RelationType } from "./bubbles/types.js";

// ─── Types ───

export type GraphTraversalResult = {
  entityId: string;
  entityName: string;
  entityType: EntityType;
  depth: number;
  path: string;
  relationType: RelationType;
  strength: number;
};

// ─── Query Builders ───

/**
 * Build a SQL query for multi-hop graph traversal using a recursive CTE.
 * Traverses relationships bidirectionally from a starting entity.
 */
export function buildMultiHopQuery(params: {
  startEntityId: string;
  maxDepth?: number;
  relationTypes?: RelationType[];
  minStrength?: number;
}): string {
  const maxDepth = params.maxDepth ?? 3;
  const minStrength = params.minStrength ?? 0.3;

  const relationFilter = params.relationTypes?.length
    ? `AND r.type IN (${params.relationTypes.map((t) => `'${t}'`).join(", ")})`
    : "";

  return `
WITH RECURSIVE traverse(entity_id, entity_name, entity_type, depth, path, relation_type, strength, visited) AS (
  -- Base case: the starting entity
  SELECT
    e.id,
    e.name,
    e.type,
    0,
    e.name,
    '' AS relation_type,
    1.0 AS strength,
    ',' || e.id || ','
  FROM entities e
  WHERE e.id = '${params.startEntityId}'

  UNION ALL

  -- Forward traversal: from -> to
  SELECT
    e2.id,
    e2.name,
    e2.type,
    t.depth + 1,
    t.path || ',' || e2.name,
    r.type,
    r.strength,
    t.visited || e2.id || ','
  FROM traverse t
  JOIN relationships r ON r.from_entity_id = t.entity_id
  JOIN entities e2 ON e2.id = r.to_entity_id
  WHERE t.depth < ${maxDepth}
    AND t.visited NOT LIKE '%,' || e2.id || ',%'
    AND r.strength >= ${minStrength}
    ${relationFilter}

  UNION ALL

  -- Reverse traversal: to -> from
  SELECT
    e2.id,
    e2.name,
    e2.type,
    t.depth + 1,
    t.path || ',' || e2.name,
    r.type,
    r.strength,
    t.visited || e2.id || ','
  FROM traverse t
  JOIN relationships r ON r.to_entity_id = t.entity_id
  JOIN entities e2 ON e2.id = r.from_entity_id
  WHERE t.depth < ${maxDepth}
    AND t.visited NOT LIKE '%,' || e2.id || ',%'
    AND r.strength >= ${minStrength}
    ${relationFilter}
)
SELECT entity_id, entity_name, entity_type, depth, path, relation_type, strength
FROM traverse
WHERE depth > 0
ORDER BY depth ASC, strength DESC;`.trim();
}

/**
 * Build a SQL query to find the shortest path between two entities.
 * Uses a recursive CTE and stops at the first match.
 */
export function findShortestPath(params: {
  fromEntityId: string;
  toEntityId: string;
  maxDepth?: number;
}): string {
  const maxDepth = params.maxDepth ?? 6;

  return `
WITH RECURSIVE traverse(entity_id, entity_name, depth, path, relation_path, visited) AS (
  SELECT
    e.id,
    e.name,
    0,
    e.name,
    '',
    ',' || e.id || ','
  FROM entities e
  WHERE e.id = '${params.fromEntityId}'

  UNION ALL

  -- Forward
  SELECT
    e2.id,
    e2.name,
    t.depth + 1,
    t.path || ',' || e2.name,
    t.relation_path || CASE WHEN t.relation_path = '' THEN '' ELSE ',' END || r.type,
    t.visited || e2.id || ','
  FROM traverse t
  JOIN relationships r ON r.from_entity_id = t.entity_id
  JOIN entities e2 ON e2.id = r.to_entity_id
  WHERE t.depth < ${maxDepth}
    AND t.visited NOT LIKE '%,' || e2.id || ',%'

  UNION ALL

  -- Reverse
  SELECT
    e2.id,
    e2.name,
    t.depth + 1,
    t.path || ',' || e2.name,
    t.relation_path || CASE WHEN t.relation_path = '' THEN '' ELSE ',' END || r.type,
    t.visited || e2.id || ','
  FROM traverse t
  JOIN relationships r ON r.to_entity_id = t.entity_id
  JOIN entities e2 ON e2.id = r.from_entity_id
  WHERE t.depth < ${maxDepth}
    AND t.visited NOT LIKE '%,' || e2.id || ',%'
)
SELECT entity_id, entity_name, depth, path, relation_path
FROM traverse
WHERE entity_id = '${params.toEntityId}'
ORDER BY depth ASC
LIMIT 1;`.trim();
}

// ─── Result Parsing ───

/** Parse raw SQLite rows into typed GraphTraversalResult objects. */
export function parseTraversalResults(
  rows: Record<string, unknown>[],
): GraphTraversalResult[] {
  return rows.map((row) => ({
    entityId: String(row.entity_id ?? ""),
    entityName: String(row.entity_name ?? ""),
    entityType: String(row.entity_type ?? "topic") as EntityType,
    depth: Number(row.depth ?? 0),
    path: String(row.path ?? ""),
    relationType: String(row.relation_type ?? "related-to") as RelationType,
    strength: Number(row.strength ?? 0),
  }));
}

// ─── Summary ───

/** Build a human-readable summary from traversal results, grouped by depth. */
export function buildRelationshipSummary(
  results: GraphTraversalResult[],
): string {
  if (results.length === 0) return "No relationships found.";

  const byDepth = new Map<number, GraphTraversalResult[]>();
  for (const r of results) {
    const group = byDepth.get(r.depth) ?? [];
    group.push(r);
    byDepth.set(r.depth, group);
  }

  const depthLabel = (d: number): string => {
    if (d === 1) return "Direct";
    return `${d} hops`;
  };

  const strengthLabel = (s: number): string => {
    if (s >= 0.8) return "strong";
    if (s >= 0.5) return "moderate";
    return "weak";
  };

  const lines: string[] = [];
  const sortedDepths = [...byDepth.keys()].sort((a, b) => a - b);

  for (const depth of sortedDepths) {
    const group = byDepth.get(depth)!;
    const parts = group.map((r) => {
      // Extract the second-to-last node in the path as the "from" name
      const pathParts = r.path.split(",");
      const fromName = pathParts.length >= 2 ? pathParts[pathParts.length - 2] : pathParts[0];
      const desc = `${fromName} ${r.relationType} ${r.entityName}`;
      return r.strength >= 0.5 ? `${desc} (${strengthLabel(r.strength)})` : desc;
    });
    lines.push(`${depthLabel(depth)}: ${parts.join(", ")}`);
  }

  return lines.join("\n");
}
