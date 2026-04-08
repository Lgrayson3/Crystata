#!/usr/bin/env node

/**
 * Lore Ingestion Pipeline — Orchestrator
 *
 * Workflow:
 *   1. Rebuild the entity registry from existing content
 *   2. Convert any .docx files in ingest/raw/ to markdown
 *   3. Print instructions for running the Claude Code skill
 *      on each processed file (the skill handles entity extraction,
 *      classification, and frontmatter generation)
 *   4. After skill runs, validate the produced files with `astro build`
 *
 * Usage:
 *   node scripts/ingest-pipeline.mjs                  # full pipeline
 *   node scripts/ingest-pipeline.mjs --registry-only  # just rebuild registry
 *   node scripts/ingest-pipeline.mjs --validate       # just run build check
 */

import { readdir, readFile, stat, mkdir } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const RAW_DIR = 'ingest/raw';
const PROCESSED_DIR = 'ingest/processed';
const REGISTRY_FILE = 'references/registry.json';

// ─── Step 1: Rebuild registry ───────────────────────────────

function rebuildRegistry() {
  console.log('\n═══ Step 1: Rebuilding entity registry ═══\n');
  try {
    execSync('node scripts/build-registry.mjs', { stdio: 'inherit' });
  } catch {
    console.error('Registry build failed');
    process.exit(1);
  }
}

// ─── Step 2: Convert .docx files ────────────────────────────

async function convertDocxFiles() {
  console.log('\n═══ Step 2: Converting .docx files ═══\n');

  if (!existsSync(RAW_DIR)) {
    await mkdir(RAW_DIR, { recursive: true });
    console.log(`  Created ${RAW_DIR}/ — drop your .docx files here`);
    return [];
  }

  const files = await readdir(RAW_DIR);
  const docxFiles = files.filter((f) => f.endsWith('.docx'));

  if (docxFiles.length === 0) {
    console.log('  No .docx files found in ingest/raw/');
    console.log('  (If your files are already .md or .txt, place them in ingest/processed/)');
    return [];
  }

  try {
    execSync(`python3 scripts/convert_docx.py ${RAW_DIR}`, { stdio: 'inherit' });
  } catch {
    console.error('  DOCX conversion failed. Install python-docx: pip install python-docx');
    console.error('  Or manually convert your files and place .md/.txt in ingest/processed/');
  }

  return docxFiles;
}

// ─── Step 3: Enumerate files for processing ─────────────────

async function listProcessedFiles() {
  console.log('\n═══ Step 3: Files ready for lore extraction ═══\n');

  if (!existsSync(PROCESSED_DIR)) {
    await mkdir(PROCESSED_DIR, { recursive: true });
  }

  const files = await readdir(PROCESSED_DIR);
  const mdFiles = files.filter(
    (f) => f.endsWith('.md') || f.endsWith('.txt'),
  );

  if (mdFiles.length === 0) {
    console.log('  No files found in ingest/processed/');
    console.log('  Place your raw lore documents there (.md or .txt)');
    return [];
  }

  console.log(`  Found ${mdFiles.length} file(s):\n`);
  for (const f of mdFiles) {
    const fpath = join(PROCESSED_DIR, f);
    const info = await stat(fpath);
    const sizeKb = (info.size / 1024).toFixed(1);
    console.log(`    ${f} (${sizeKb} KB)`);
  }

  return mdFiles;
}

// ─── Step 4: Print skill invocation instructions ────────────

function printSkillInstructions(files) {
  console.log('\n═══ Step 4: Run lore extraction ═══\n');
  console.log('  Use Claude Code to process each file with the ingestion skill.\n');
  console.log('  For each file, tell Claude:\n');
  console.log('    /ingest-lore ingest/processed/<filename>\n');
  console.log('  Or process all at once:\n');
  console.log('    /ingest-lore ingest/processed/\n');
  console.log('  Claude will:');
  console.log('    1. Read the document');
  console.log('    2. Identify all entities (characters, factions, regions, etc.)');
  console.log('    3. Generate frontmatter matching the Zod schema');
  console.log('    4. Resolve cross-references against references/registry.json');
  console.log('    5. Write structured .md files to src/content/<collection>/');
  console.log('    6. Update the registry with new IDs\n');
}

// ─── Step 5: Validate ───────────────────────────────────────

function validate() {
  console.log('\n═══ Step 5: Validating with Astro build ═══\n');
  try {
    execSync('npx astro build 2>&1', { stdio: 'inherit', timeout: 120000 });
    console.log('\n  ✓ Build passed — all content is valid\n');
  } catch {
    console.error('\n  ✗ Build failed — check schema errors above\n');
    process.exit(1);
  }
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  console.log('╔═══════════════════════════════════════════╗');
  console.log('║   Crystata Lore Ingestion Pipeline        ║');
  console.log('╚═══════════════════════════════════════════╝');

  if (args.includes('--registry-only')) {
    rebuildRegistry();
    return;
  }

  if (args.includes('--validate')) {
    validate();
    return;
  }

  // Full pipeline
  rebuildRegistry();
  await convertDocxFiles();
  const files = await listProcessedFiles();

  if (files.length > 0) {
    printSkillInstructions(files);
  } else {
    console.log('\n  To get started:');
    console.log('    1. Drop .docx files in ingest/raw/');
    console.log('       OR drop .md/.txt files in ingest/processed/');
    console.log('    2. Re-run: node scripts/ingest-pipeline.mjs\n');
  }
}

main().catch((err) => {
  console.error('Pipeline error:', err);
  process.exit(1);
});
