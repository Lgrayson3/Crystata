---
description: Parse raw lore documents and produce structured Astro Content Collection entries with relational frontmatter
trigger: When the user says "/ingest-lore" or asks to ingest, parse, or process lore/codex/worldbuilding documents
---

# Lore Ingestion Skill

You are a **Lore Extraction Engine** for the Crystata knowledge graph. Your job is to read raw worldbuilding documents and produce structured Astro Content Collection entries with correct YAML frontmatter, proper entity classification, and validated cross-references.

## Input

The user will provide either:
- A path to a single file: `ingest/processed/some-document.md`
- A path to a directory: `ingest/processed/` (process all files)
- Raw text pasted directly into the conversation

## Pipeline Steps

For each input document, execute these steps in strict order:

### Step 1: Read the Registry

Read `references/registry.json` to load all known entity IDs. **You may ONLY reference IDs that exist in this file.** If a document mentions an entity that doesn't exist yet, you must create it before referencing it.

### Step 2: Read the Schema

Read `src/content.config.ts` to confirm the exact Zod schema shapes for each collection. Every frontmatter field must match these definitions precisely.

### Step 3: Analyze the Document

Read the input document and identify all extractable entities. Classify each into one of the five collection types:

| Collection | What to look for |
|---|---|
| `planets` | Worlds, celestial bodies, realms with physical descriptions |
| `regions` | Named geographic areas, territories, cities, landmarks within a planet |
| `factions` | Organizations, orders, guilds, nations, political groups |
| `characters` | Named individuals with described roles, species, or abilities |
| `magicSystems` | Named magic systems, power sources, supernatural disciplines |

A single document may contain multiple entities across multiple collections.

### Step 4: Generate Entity Files

For **each** identified entity, produce a `.md` file with:

1. **Filename**: Slugified from the entity name (lowercase, hyphens, no special chars)
   - "Kael Duskwarden" → `kael-duskwarden.md`
   - "The Crystal Covenant" → `crystal-covenant.md`

2. **YAML Frontmatter**: Strictly matching the Zod schema. Use these templates:

#### Planet
```yaml
---
name: "<exact name>"
description: "<1-2 sentence summary>"
coordinates:
  x: <number>
  y: <number>
  z: <number>
radius: <number, default 5>
color: "<hex color matching the planet's theme>"
regions:
  - <region-id>
factions:
  - <faction-id>
---
```
For coordinates: space planets roughly 30-50 units apart in 3D space. Check existing planet coordinates in the registry to avoid collisions.

#### Region
```yaml
---
name: "<exact name>"
description: "<1-2 sentence summary>"
planet: <planet-id>
mapPosition:
  x: <number 50-500>
  y: <number 50-500>
characters:
  - <character-id>
factions:
  - <faction-id>
---
```

#### Faction
```yaml
---
name: "<exact name>"
description: "<1-2 sentence summary>"
motto: "<if mentioned in text>"
leader: <character-id>
territories:
  - <region-id>
planets:
  - <planet-id>
---
```

#### Character
```yaml
---
name: "<exact name>"
species: "<species name>"
title: "<title if any>"
description: "<1-2 sentence summary>"
faction: <faction-id>
homeworld: <planet-id>
abilities:
  - <magic-system-id>
allies:
  - <character-id>
---
```

#### Magic System
```yaml
---
name: "<exact name>"
description: "<1-2 sentence summary>"
origin: "<origin story if mentioned>"
practitioners:
  - <character-id>
associatedFactions:
  - <faction-id>
---
```

3. **Body Content**: The lore text for this entity, cleaned and formatted as Markdown. Use `##` subheadings to organize sections. Preserve the author's voice and detail.

### Step 5: Dependency Ordering

Entities reference each other. Process them in this order to avoid dangling references:
1. **Planets** first (no required refs to other types)
2. **Magic Systems** (may have empty practitioner lists initially)
3. **Factions** (may reference planets)
4. **Regions** (reference planets, may reference factions)
5. **Characters** (reference factions, planets, magic systems, other characters)

After writing all files, make a **second pass** to backfill references:
- Add character IDs to faction `leader` fields
- Add character IDs to region `characters` arrays
- Add character IDs to magic system `practitioners` arrays
- Add region IDs to faction `territories` arrays

### Step 6: Write Files

Write each entity file to the correct content directory:
- `src/content/planets/<slug>.md`
- `src/content/regions/<slug>.md`
- `src/content/factions/<slug>.md`
- `src/content/characters/<slug>.md`
- `src/content/magicSystems/<slug>.md`

### Step 7: Update Registry

After writing all files, run: `node scripts/build-registry.mjs`

This regenerates `references/registry.json` with the new IDs so future ingestion runs can reference them.

### Step 8: Validate

Run `npx astro build` to verify all content passes Zod schema validation. If the build fails:
1. Read the error message to identify which file and field failed
2. Fix the frontmatter
3. Re-run the build

## Critical Rules

1. **NO HALLUCINATED REFERENCES**: Every ID in a `reference()` field MUST correspond to an actual `.md` file. If an entity is mentioned but not substantial enough to warrant its own entry, omit the reference — do not invent IDs.

2. **Preserve the Author's Voice**: The body text should reflect the original document's writing style. Do not rewrite or summarize unless the source is clearly rough notes.

3. **One Entity Per File**: Never combine multiple entities into a single file. Even if a document describes a faction and its leader together, produce separate files for each.

4. **Omit Empty Arrays**: If a character has no known allies, omit the `allies` field entirely rather than writing `allies: []`. Zod's `.optional()` handles this.

5. **Description Field is Required**: Every entity MUST have a `description` field — a concise 1-2 sentence summary. This is mandatory across all schemas.

6. **Handle Ambiguity Conservatively**: If you're unsure whether something is a character vs. a faction, or a region vs. a planet, ask the user rather than guessing.
