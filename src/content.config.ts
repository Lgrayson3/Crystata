import { defineCollection, reference, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Knowledge Graph Schema Definitions
 *
 * Each collection represents a node type in the lore graph.
 * Lateral references (edges) are enforced via Zod + reference()
 * and validated at build time — broken links halt the build.
 */

// ─── Macro-Location: defines the 3D cosmos coordinate space ───
const planets = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/planets' }),
  schema: z.object({
    name: z.string(),
    description: z.string(),
    // 3D cosmos coordinates for R3F positioning
    coordinates: z.object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
    }),
    // Visual properties for the cosmos renderer
    radius: z.number().default(5),
    color: z.string().default('#888888'),

    // ─── Realm Identity Card ───
    element: z.string().optional(),
    patronDeity: reference('characters').optional(),
    exvisar: reference('characters').optional(),
    population: z.string().optional(),
    chromaticSignature: z.string().optional(),
    materialHierarchy: z.string().optional(),
    culturalAnalogs: z.string().optional(),
    narrativeFunction: z.string().optional(),
    subtitle: z.string().optional(),
    epigraph: z.string().optional(),

    // ─── Material Palette ───
    palette: z.array(z.object({
      name: z.string(),
      hex: z.string(),
      gradient: z.array(z.string()),
      description: z.string(),
    })).optional(),

    // ─── Design Principles ───
    designPrinciples: z.array(z.object({
      title: z.string(),
      text: z.string(),
    })).optional(),

    // Graph edges
    regions: z.array(reference('regions')).optional(),
    factions: z.array(reference('factions')).optional(),
  }),
});

// ─── Meso-Location: bounded regions on a planet's map ───
const regions = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/regions' }),
  schema: z.object({
    name: z.string(),
    description: z.string(),
    tagline: z.string().optional(),
    // Parent planet (N:1)
    planet: reference('planets'),
    // Map positioning for the SVG/Canvas layer
    mapPosition: z.object({
      x: z.number(),
      y: z.number(),
    }).optional(),
    // Graph edges
    schoolOfMagic: reference('magicSystems').optional(),
    characters: z.array(reference('characters')).optional(),
    factions: z.array(reference('factions')).optional(),
  }),
});

// ─── Organization: ideological clustering node ───
const factions = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/factions' }),
  schema: z.object({
    name: z.string(),
    description: z.string(),
    motto: z.string().optional(),
    // Graph edges
    leader: reference('characters').optional(),
    territories: z.array(reference('regions')).optional(),
    planets: z.array(reference('planets')).optional(),
  }),
});

// ─── Actor: primary narrative agents ───
const characters = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/characters' }),
  schema: z.object({
    name: z.string(),
    species: z.string(),
    title: z.string().optional(),
    description: z.string(),
    // Graph edges
    faction: reference('factions').optional(),
    homeworld: reference('planets').optional(),
    abilities: z.array(reference('magicSystems')).optional(),
    allies: z.array(reference('characters')).optional(),
  }),
});

// ─── Concept: abstract rulesets governing lore physics ───
const magicSystems = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/magicSystems' }),
  schema: z.object({
    name: z.string(),
    description: z.string(),
    origin: z.string().optional(),
    classification: z.string().optional(),
    realm: reference('planets').optional(),
    region: reference('regions').optional(),
    // Graph edges
    practitioners: z.array(reference('characters')).optional(),
    associatedFactions: z.array(reference('factions')).optional(),
  }),
});

export const collections = {
  planets,
  regions,
  factions,
  characters,
  magicSystems,
};
