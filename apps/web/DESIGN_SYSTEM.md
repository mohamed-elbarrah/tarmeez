# Tarmeez Web Design System

## Source of truth
Use the shared shadcn/ui components in `src/components/ui`, CSS variables and Tailwind theme in `src/app/globals.css`, and `cn()` from `src/lib/utils.ts`. Do not introduce page-local palettes, arbitrary one-off component styles, or duplicate primitives. If a pattern is needed more than once, add a shared component/variant first.

## Visual foundations
- Geist Sans is the product typeface; Geist Mono is reserved for technical identifiers.
- Use semantic colors (`background`, `foreground`, `primary`, `muted`, `border`, `destructive`, etc.), never hard-coded colors for routine UI.
- Use Tailwind spacing scale; page content uses consistent responsive gutters and a readable max-width. Keep layouts calm, compact, and data-focused.
- Use the shared radius scale. Prefer subtle borders and restrained shadows; avoid decorative gradients and excessive rounded cards.
- Icons use Lucide, typically 16–20px, and must not replace accessible labels.
- Support keyboard focus, clear disabled/loading states, readable contrast, and responsive layouts.

## Patterns
- Dashboard pages share the role-specific app shell, page title/description/action hierarchy, and consistent content spacing.
- Tables share header, row density, alignment, pagination, loading, error, and empty states.
- Forms share label/help/error placement and validation behavior. Destructive actions require confirmation.
- Status uses consistent semantic badges; never communicate status by color alone.
- Use shadcn component variants rather than ad hoc class strings. Extend the shared component when a legitimate reusable variant is missing.

## Agent checklist
Before UI changes, inspect this file and existing components. Reuse the app shell and primitives. Avoid adding dependencies unless an existing dependency cannot satisfy the need. Run `pnpm --filter web typecheck` and `pnpm --filter web lint` after changes.
