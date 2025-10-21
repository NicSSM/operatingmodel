This file gives concise, repo-specific guidance for AI coding agents working on the `operatingmodel` (Kmart) Next.js app.

High-level architecture
- App built with Next.js (App Router) under `src/app/` and React components in `src/components/`.
- Static export configuration: `next.config.ts` and `open-next.config.ts` set `output: 'export'` so `next build` produces an `./out` directory for static hosting.
- Two runtime targets are present: static export (GitHub Pages / serve `out`) and Cloudflare/Open Next (see `wrangler.jsonc` and `@opennextjs/cloudflare` scripts).

Key files to inspect
- `package.json` — dev / build / preview scripts (dev uses `next dev --turbopack`).
- `next.config.ts` and `open-next.config.ts` — static export, basePath / assetPrefix logic.
- `wrangler.jsonc` — Cloudflare worker configuration (.open-next/worker.js as entry).
- `src/app/layout.tsx`, `src/app/page.tsx` — app entry points; `page.tsx` is a client component (starts with "use client").
- `src/components/ui/*` — shared UI primitives (Button, Card, Input, etc.) built with cva/CVA pattern.
- `src/lib/utils.ts` — utility `cn()` wrapper for `clsx` + `tailwind-merge` (used widely for class composition).

Developer workflows (concrete commands)
- Local dev (fast, Turbopack): `npm run dev` -> launches Next dev server on localhost:3000.
- Build static output: `npm run build` -> `next build --turbopack` (produces `./out` because of `output: 'export'`).
- Preview static output: `npm run preview:static` -> runs `npx serve out` to preview the exported site.
- Open Next / Cloudflare Pages flows: `npm run pages:build`, `npm run pages:preview`, `npm run pages:deploy` (these invoke Open Next / Cloudflare helpers; verify the CLI `@opennextjs/cloudflare`/`opennext` is installed).

Project conventions and patterns (do not change without project owner sign-off)
- Path alias: imports use `@/` to refer to `src/` (see `tsconfig.json` paths). Example: `import { Button } from "@/components/ui/button";`.
- UI primitives: `src/components/ui/*` use `class-variance-authority` (cva) + `cn()` from `src/lib/utils.ts`. Pattern: export components with variant props (see `button.tsx` -> `buttonVariants`). Prefer reusing these primitives.
- Client vs server components: follow Next App Router rules — files that need browser state use `"use client"` (example: `src/app/page.tsx`). Layouts are server components by default (`src/app/layout.tsx`).
- Styling: Tailwind CSS and utility classes; do not mix heavy CSS-in-JS. Global styles are in `src/app/globals.css`.

External integrations and notes
- Cloudflare/Open Next: devDependencies include `@opennextjs/cloudflare` and `wrangler`. `wrangler.jsonc` binds assets and points to `.open-next/worker.js`. When running pages deploy flows, follow Open Next docs and ensure `wrangler` / Cloudflare account config is present.
- UI libs used: `@radix-ui/*`, `lucide-react`, `framer-motion`, `recharts`. Expect SVG/chart components in `src/app/page.tsx`.

Important quirks / gotchas
- `next.config.ts` explicitly sets `eslint.ignoreDuringBuilds` and `typescript.ignoreBuildErrors` to true. CI may be configured to tolerate lint/type issues — do not assume the codebase is type-clean.
- `package.json` scripts contain slight naming inconsistencies for Open Next CLIs (e.g., `opennext` vs `opennextjs-cloudflare`) — verify which CLI is installed in the environment before automating commands.
- `output: 'export'` + `trailingSlash: true` means URLs and assetPaths are opinionated for static hosting (GitHub Pages). Adjust `basePath` only when targeting Pages.

Good example snippets
- Reuse `cn()` when composing classes: `import { cn } from "@/lib/utils";`.
- Use component variants: `import { Button } from "@/components/ui/button"; <Button variant="outline">...`.

If something is ambiguous
- Look at `src/app/page.tsx` and `src/components/ui/*` first — they encode most UI/behaviour patterns.
- For deployment questions, inspect `wrangler.jsonc`, `.open-next/` (generated build), and `open-next.config.ts`.

What I'd ask you next
- Do you want strict guardrails for CI (stop ignoring TS/ESLint) or should the agent preserve current settings?
- Should the agent add simple smoke tests (e.g., a tiny Playwright / Cypress script) or keep changes minimal?

If any of the above sections are unclear or you want extra examples (imports, routes, deployment), tell me which area to expand.
