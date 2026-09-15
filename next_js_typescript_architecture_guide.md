# Next.js & TypeScript Production Architecture & Best Practices

This guide outlines the recommended project structure, architectural patterns, and engineering practices for building scalable, maintainable Next.js (App Router) and TypeScript applications.

---

## 1. Core Architectural Strategy

The standard industry approach prioritizes **Domain-Driven (Feature-based) Architecture**. 

Instead of grouping files by technical layer (e.g., placing all hooks in `/hooks`, all components in `/components`), business logic is organized into modular features, treating the `/app` directory as a thin routing layer.

---

## 2. Directory Layout Blueprint (`/src`)

```text
my-app/
├── src/
│   ├── app/                    # Routing layer only (App Router)
│   │   ├── (auth)/             # Route group: (auth)/login, (auth)/register
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/
│   │   │   ├── dashboard/
│   │   │   │   ├── page.tsx    # Server Component: queries data, passes to features
│   │   │   │   └── loading.tsx # React Suspense fallback
│   │   └── layout.tsx          # Root layout & providers
│   │
│   ├── features/               # Domain-driven architecture (Core Business Logic)
│   │   ├── auth/
│   │   │   ├── actions/        # Server Actions (e.g., login.action.ts)
│   │   │   ├── components/     # Domain components (e.g., LoginForm.tsx)
│   │   │   ├── hooks/          # Client-side hooks specific to auth
│   │   │   ├── schemas/        # Zod validation schemas
│   │   │   ├── types/          # TypeScript interfaces/types
│   │   │   └── index.ts        # Optional: Ultra-thin public API barrel file
│   │   └── billing/
│   │
│   ├── components/             # Global / UI components across domains
│   │   ├── ui/                 # Dumb primitives (Buttons, Modals, Inputs)
│   │   └── layout/             # Global Navbars, Footers, Sidebars
│   │
│   ├── lib/                    # Shared core infrastructure & SDK configs
│   │   ├── db/                 # Prisma / Drizzle client configuration
│   │   ├── utils.ts            # Helper functions (e.g., `cn()` for Tailwind)
│   │   └── env.ts              # Type-safe environment variables (t3-env / Zod)
│   │
│   └── types/                  # Shared global TypeScript types
```

---

## 3. Layer Responsibilities & Core Principles

| Layer / Concept | Responsibility & Best Practice |
| :--- | :--- |
| **Routing Shell (`/src/app`)** | Keep `page.tsx` files thin. Use Server Components primarily for fetching data, handling metadata, and passing data down into feature components. |
| **Domain Modules (`/src/features`)** | Co-locate business logic by domain (e.g., `features/auth`, `features/billing`). Everything belonging to a single feature lives within its domain directory. |
| **Server Actions** | Place mutations and form handlers inside `features/<domain>/actions/`. Combine them with Zod schemas for end-to-end type safety. |
| **UI Primitives (`/src/components/ui`)** | Maintain purely presentational, "dumb" components (such as `shadcn/ui` primitives) decoupled from business logic, hooks, or API calls. |
| **Environment & Config (`/src/lib`)** | Enforce type safety for environment variables using libraries like `@t3-oss/env-nextjs` or custom Zod schemas to fail fast during boot. |

---

## 4. Key Rules & Nuances

### A. Barrel Files (`index.ts`)
* **Caution:** Re-exporting every sub-module through `index.ts` barrel files can negatively impact tree-shaking, slow down local bundler builds (HMR), and introduce circular dependency bugs.
* **Guideline:** Either keep barrel files **ultra-thin** (exporting strictly public API entry points) or omit them in favor of direct path imports:
  ```tsx
  // Preferred over importing from a bloated barrel index
  import { LoginForm } from '@/features/auth/components/LoginForm';
  ```

### B. Route Colocation vs. Feature Modules
* The top-level folder name (`features/`, `modules/`, or `domains/`) is flexible.
* **Rule:** If a component, utility, or schema is strictly used by a **single route**, it is acceptable to colocate it inside a private folder within that route directory (e.g., `app/(dashboard)/analytics/_components/Chart.tsx`). Move it to `src/features/` when it grows or is shared across routes.

### C. Client vs. Server Components (RSC)
* Default all components to **React Server Components (RSC)**.
* Push `"use client"` directives as deep into the component tree as possible (e.g., wrap interactive controls or stateful elements rather than converting full pages to client mode).

### D. Pragmatic Domain-Driven Design (DDD)
* Avoid introducing full DDD layers (Entities, Aggregates, Repositories, Use Cases) prematurely.
* Start with the basic `features/<domain>` layout. If a single domain scales significantly in complexity, introduce sub-layers like `infrastructure/` or `services/` within that specific feature without refactoring the whole application.

---

## 5. Summary Checklist for Production

- [ ] Route files (`page.tsx`) act as orchestrators, not giant UI templates.
- [ ] Business logic and mutations live in `features/` or co-located route sub-folders.
- [ ] Global UI components inside `components/ui/` remain completely stateless and business-agnostic.
- [ ] Environment variables are validated at build/boot time.
- [ ] `"use client"` directives are restricted to small interactive leaves at the bottom of the component tree.