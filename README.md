# Crystata

An immersive 3D knowledge graph and interactive lore codex.

## Architecture

**Tri-layered navigation model:**

1. **Macro (Cosmos)** — React Three Fiber 3D planetary system with GSAP-driven camera transitions
2. **Meso (Map)** — Hybrid Canvas/SVG zoomable regional maps with D3.js pan/zoom
3. **Micro (Codex)** — Statically generated content pages with relational sidebar navigation

**Knowledge graph** powered by Astro Content Collections with Zod-enforced typed lateral references across 5 entity types: planets, regions, factions, characters, and magic systems.

## Tech Stack

- **Astro 6** — Static site generation, Content Layer API, View Transitions
- **React Three Fiber** — 3D cosmos rendering (persistent WebGL canvas)
- **Three.js** — Underlying 3D engine
- **GSAP** — Cinematic camera transitions
- **D3.js** — Map pan/zoom mechanics
- **Nanostores** — Framework-agnostic shared state across islands
- **Cloudflare Pages** — Edge deployment

## Getting Started

```sh
npm install
npm run dev
```

## Project Structure

```
src/
├── content/           # Knowledge graph entries (Markdown + YAML frontmatter)
│   ├── characters/
│   ├── factions/
│   ├── magicSystems/
│   ├── planets/
│   └── regions/
├── content.config.ts  # Zod schemas + relational references
├── components/
│   ├── CosmosScene.tsx    # R3F canvas + planet nodes
│   ├── CosmosCamera.tsx   # GSAP camera controller
│   ├── PlanetNode.tsx     # Interactive 3D planet mesh
│   ├── MapView.tsx        # Hybrid Canvas/SVG map
│   ├── NavigationOverlay.tsx
│   └── CodexSidebar.astro
├── layouts/
│   └── BaseLayout.astro   # Persistent canvas + ClientRouter
├── lib/
│   └── graph.ts           # Adjacency matrix builder for bidirectional queries
├── pages/
│   ├── index.astro        # Cosmos entry point
│   ├── planets/[id].astro # Planet + map view
│   └── codex/             # Static codex entries
├── stores/
│   └── navigation.ts      # Nanostores (depth level, active node)
└── styles/
    └── global.css
```
