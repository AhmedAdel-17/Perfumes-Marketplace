/**
 * Shared UI primitives.
 *
 * ARCHITECTURE.md: `design-system/` never imports from `features/`. Primitives
 * know nothing about the product.
 *
 * Icons live here rather than in @diyar/tokens because tokens must stay
 * framework-free — it is consumed by both Tailwind on web and a plain theme
 * object on native, and a React import in that package would break the second.
 */
export * as Icon from './icons';
