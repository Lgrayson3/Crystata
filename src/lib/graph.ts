/**
 * Knowledge Graph Resolution Utilities
 *
 * Pre-computes an inverted index (adjacency matrix) from all content
 * collections so that bidirectional relationships can be resolved
 * in O(1) during page generation — avoiding O(N²) nested filters.
 */

import { getCollection } from 'astro:content';

export type NodeType = 'planets' | 'regions' | 'factions' | 'characters' | 'magicSystems';

export interface GraphEdge {
  source: { collection: NodeType; id: string };
  target: { collection: NodeType; id: string };
  relation: string;
}

export interface GraphIndex {
  /** Map from "collection:id" → list of related "collection:id" keys */
  adjacency: Map<string, Set<string>>;
  /** Map from "collection:id" → the entry data */
  nodes: Map<string, { collection: NodeType; id: string; name: string }>;
}

function nodeKey(collection: string, id: string): string {
  return `${collection}:${id}`;
}

function extractRefs(
  entry: Record<string, unknown>,
  fields: string[],
): Array<{ collection: string; id: string }> {
  const refs: Array<{ collection: string; id: string }> = [];

  for (const field of fields) {
    const value = entry[field];
    if (!value) continue;

    if (typeof value === 'object' && 'collection' in (value as Record<string, unknown>)) {
      const ref = value as { collection: string; id: string };
      refs.push({ collection: ref.collection, id: ref.id });
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'object' && 'collection' in item) {
          refs.push({ collection: item.collection, id: item.id });
        }
      }
    }
  }

  return refs;
}

/**
 * Build the full knowledge graph index from all content collections.
 * Call once during getStaticPaths() and pass the result to pages.
 */
export async function buildGraphIndex(): Promise<GraphIndex> {
  const [planets, regions, factions, characters, magicSystems] = await Promise.all([
    getCollection('planets'),
    getCollection('regions'),
    getCollection('factions'),
    getCollection('characters'),
    getCollection('magicSystems'),
  ]);

  const adjacency = new Map<string, Set<string>>();
  const nodes = new Map<string, { collection: NodeType; id: string; name: string }>();

  function ensureNode(collection: NodeType, id: string, name: string) {
    const key = nodeKey(collection, id);
    nodes.set(key, { collection, id, name });
    if (!adjacency.has(key)) {
      adjacency.set(key, new Set());
    }
  }

  function addEdge(fromCollection: string, fromId: string, toCollection: string, toId: string) {
    const fromKey = nodeKey(fromCollection, fromId);
    const toKey = nodeKey(toCollection, toId);
    if (!adjacency.has(fromKey)) adjacency.set(fromKey, new Set());
    if (!adjacency.has(toKey)) adjacency.set(toKey, new Set());
    adjacency.get(fromKey)!.add(toKey);
    adjacency.get(toKey)!.add(fromKey);
  }

  // Register all nodes
  for (const p of planets) ensureNode('planets', p.id, p.data.name);
  for (const r of regions) ensureNode('regions', r.id, r.data.name);
  for (const f of factions) ensureNode('factions', f.id, f.data.name);
  for (const c of characters) ensureNode('characters', c.id, c.data.name);
  for (const m of magicSystems) ensureNode('magicSystems', m.id, m.data.name);

  // Build edges from each collection's reference fields
  const refFields: Record<NodeType, string[]> = {
    planets: ['regions', 'factions'],
    regions: ['planet', 'characters', 'factions'],
    factions: ['leader', 'territories', 'planets'],
    characters: ['faction', 'homeworld', 'abilities', 'allies'],
    magicSystems: ['practitioners', 'associatedFactions'],
  };

  const allEntries: Array<{ collection: NodeType; entries: Array<{ id: string; data: Record<string, unknown> }> }> = [
    { collection: 'planets', entries: planets },
    { collection: 'regions', entries: regions },
    { collection: 'factions', entries: factions },
    { collection: 'characters', entries: characters },
    { collection: 'magicSystems', entries: magicSystems },
  ];

  for (const { collection, entries } of allEntries) {
    for (const entry of entries) {
      const refs = extractRefs(entry.data as Record<string, unknown>, refFields[collection]);
      for (const ref of refs) {
        addEdge(collection, entry.id, ref.collection, ref.id);
      }
    }
  }

  return { adjacency, nodes };
}

/**
 * Get all related nodes for a given entity, grouped by collection type.
 */
export function getRelatedNodes(
  graph: GraphIndex,
  collection: NodeType,
  id: string,
): Record<NodeType, Array<{ id: string; name: string }>> {
  const key = nodeKey(collection, id);
  const related = graph.adjacency.get(key) ?? new Set<string>();

  const grouped: Record<NodeType, Array<{ id: string; name: string }>> = {
    planets: [],
    regions: [],
    factions: [],
    characters: [],
    magicSystems: [],
  };

  for (const relatedKey of related) {
    const node = graph.nodes.get(relatedKey);
    if (node) {
      grouped[node.collection].push({ id: node.id, name: node.name });
    }
  }

  return grouped;
}
