#!/usr/bin/env node

/**
 * Registry Generator
 *
 * Scans all existing content collections and produces a JSON manifest
 * of every known entity ID, grouped by collection. This manifest is
 * the single source of truth that constrains the lore extraction
 * pipeline — no frontmatter reference may point to an ID that doesn't
 * exist in this file.
 *
 * Usage: node scripts/build-registry.mjs
 * Output: references/registry.json
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { existsSync } from 'node:fs';

const CONTENT_DIR = 'src/content';
const OUTPUT_FILE = 'references/registry.json';

const COLLECTIONS = [
  'planets',
  'regions',
  'factions',
  'characters',
  'magicSystems',
];

function extractFrontmatterField(content, field) {
  // Match "field: value" or "field: ..." in YAML frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  const fm = fmMatch[1];
  const lineMatch = fm.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
  return lineMatch ? lineMatch[1].trim() : null;
}

async function scanCollection(collection) {
  const dir = join(CONTENT_DIR, collection);
  if (!existsSync(dir)) return [];

  const files = await readdir(dir);
  const entries = [];

  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const id = basename(file, '.md');
    const content = await readFile(join(dir, file), 'utf-8');
    const name = extractFrontmatterField(content, 'name') || id;

    entries.push({ id, name });
  }

  return entries;
}

async function main() {
  const registry = {};

  for (const collection of COLLECTIONS) {
    registry[collection] = await scanCollection(collection);
  }

  // Summary stats
  const totalEntities = Object.values(registry).reduce(
    (sum, entries) => sum + entries.length,
    0,
  );

  const output = {
    generatedAt: new Date().toISOString(),
    totalEntities,
    collections: registry,
  };

  await mkdir('references', { recursive: true });
  await writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2) + '\n');

  console.log(`Registry built: ${totalEntities} entities across ${COLLECTIONS.length} collections`);
  console.log(`  → ${OUTPUT_FILE}`);
  for (const [col, entries] of Object.entries(registry)) {
    if (entries.length > 0) {
      console.log(`    ${col}: ${entries.map((e) => e.id).join(', ')}`);
    }
  }
}

main().catch((err) => {
  console.error('Registry build failed:', err);
  process.exit(1);
});
