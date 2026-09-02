import type { Config } from 'tailwindcss';
import { diyarPreset } from '@diyar/tokens/tailwind';

/**
 * Every colour, size, spacing value and duration comes from tokens.json through
 * the shared preset. DESIGN_DOCTRINE.md: a value that is not a token cannot be
 * reached through a utility class, and CI greps for hardcoded hex to be sure.
 */
export default {
  presets: [diyarPreset as unknown as Config],
  content: ['./src/**/*.{ts,tsx}'],
} satisfies Config;
