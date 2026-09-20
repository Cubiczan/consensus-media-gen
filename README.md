# CVMG — Consensus-Verified Media Generator

> Multi-model consensus-validated AI image generation with Backblaze B2 storage and Genblaze SDK orchestration.

Built for the **[Backblaze Generative Media Hackathon](https://hackathon.backblaze.com)** (Aug 3, 2026).

## How It Works

CVMG solves a fundamental problem with AI-generated media: **single-model outputs are unreliable**. Different models excel at different aspects — one may nail composition but fail at text rendering, while another produces vibrant colors but poor anatomy.

Our solution: **generate with multiple models simultaneously, cross-validate the outputs through a consensus pipeline, and store everything on Backblaze B2**.

### Consensus State Machine

```
PENDING → GENERATING → VALIDATING → ADVERSARIAL_CHECK → SELECTING → STORING → COMPLETED
```

The transition machinery is real — `STATE_TRANSITIONS` and its `isValidTransition` validator live in `src/lib/consensus.ts`; the three scoring stages that feed selection are simulated heuristics (below).

1. **Multi-Model Generation** — Multiple AI models (FLUX, SDXL, Playground, Ideogram) generate from your prompt in parallel via Genblaze SDK orchestration
2. **Quality Validation** — Each candidate scored by a simulated heuristic (`computeQualityScore` in `src/lib/consensus.ts` — hash-seeded placeholder, not a real visual-quality model)
3. **Diversity Scoring** — Simulated feature comparison (`computeDiversityScore` in `src/lib/consensus.ts` — same hash-based placeholder approach)
4. **Adversarial Quality Check** — Simulated robustness score (`computeAdversarialScore` in `src/lib/consensus.ts`) rather than a real artifact detector
5. **Winner Selection** — Weighted consensus (50% quality + 30% diversity + 20% adversarial robustness — real arithmetic over the simulated scores) picks the best result
6. **B2 Storage** — All candidates + the consensus winner stored on Backblaze B2 with full provenance

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 + shadcn/ui |
| Database | Prisma ORM + SQLite |
| Cloud Storage | **Backblaze B2** (S3-compatible) |
| Media Orchestration | **Genblaze SDK** pattern |
| Image Generation | z-ai-web-dev-sdk |
| State Management | Zustand |
| Animations | Framer Motion |
| Real-time | Socket.io mini-service |

## Backblaze B2 Integration

Every generation stores assets with this organization on B2:

```
jobs/{jobId}/candidates/{modelName}_{candidateId}.png
jobs/{jobId}/winner/{modelName}_{candidateId}.png
```

S3 operations used: `PutObject`, `GetObject`, `ListObjectsV2`, `HeadObject`, `GetSignedUrl`

Each asset includes:
- Custom metadata (`x-cvmg-checksum`, `x-cvmg-uploaded-at`)
- Full database record with content type, size, checksum, and winner flag
- Bidirectional link to the generation job and candidate

## Genblaze SDK Orchestration

The generation pipeline follows the Genblaze SDK pattern:

- **Pipeline**: A sequence of generation/processing steps
- **Context**: Shared state (job ID, prompt, models, candidates, metadata) passed between steps
- **Multi-model routing**: Concurrent dispatch to multiple generation providers
- **Node abstraction**: Each pipeline step (generate, validate, select, store) is an independent, composable node

## Getting Started

```bash
# Install dependencies
bun install

# Configure environment
cp .env.example .env
# Edit .env with your B2 credentials from https://secure.backblaze.com/app_keys

# Set up database
bun run db:push

# Start development server
bun run dev
```

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── generate/route.ts     # POST - Start consensus generation pipeline
│   │   ├── jobs/route.ts          # GET  - List all generation jobs
│   │   ├── jobs/[id]/route.ts     # GET  - Job detail with candidates & events
│   │   └── b2/assets/route.ts     # GET  - List B2 assets + proxy images
│   ├── layout.tsx
│   ├── page.tsx                   # Main SPA with 4 tabs
│   └── globals.css
├── lib/
│   ├── b2-client.ts               # Backblaze B2 S3-compatible storage client
│   ├── genblaze.ts                # Genblaze SDK orchestration layer
│   ├── consensus.ts               # Consensus state machine + scoring
│   ├── image-gen.ts               # Image generation via z-ai-web-dev-sdk
│   └── db.ts                      # Prisma database client
├── store/
│   └── app-store.ts               # Zustand global state
├── hooks/
│   ├── use-jobs.ts                # Job fetching + polling
│   └── use-generation.ts          # Generation trigger hook
└── components/ui/                 # shadcn/ui components
prisma/
└── schema.prisma                  # 4 models: Job, Candidate, Event, Asset
mini-services/
└── ws-service/                    # Socket.io real-time update service
```

## Judging Criteria Coverage

| Criterion | How CVMG Addresses It |
|-----------|----------------------|
| **Real-World Utility** | Solves unreliable single-model generation — every AI media team needs output validation |
| **Production Readiness** | Full state machine, proper error handling, database, API routes, responsive dark UI, asset provenance |
| **B2 Storage & Data Orchestration** | S3-compatible PutObject/GetObject/List/Head/Sign, organized by job, custom metadata, asset tracking DB |
| **Use of Genblaze** | Pipeline/context/node pattern with multi-model concurrent dispatch, context passing, composable steps |

## License

MIT