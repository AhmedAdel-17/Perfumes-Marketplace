import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';
import { diyarPreset } from '@diyar/tokens/tailwind';
import { themeBaseStyles } from '@diyar/tokens';

/**
 * Every colour, size, spacing value and duration comes from tokens.json through
 * the shared preset. DESIGN_DOCTRINE.md: a value that is not a token cannot be
 * reached through a utility class, and CI greps for hardcoded hex to be sure.
 *
 * The plugin below emits the theme's custom properties as base styles. It lives
 * HERE rather than in the tokens package because that package has no Tailwind
 * dependency and should not acquire one to publish a stylesheet — and it is not
 * hand-written into globals.css because the hexes would then exist in a second
 * place, which is precisely the drift the token guard forbids.
 */
export default {
  presets: [diyarPreset as unknown as Config],
  content: ['./src/**/*.{ts,tsx}'],
  plugins: [
    plugin(({ addBase, addVariant }) => {
      addBase(themeBaseStyles);
      /*
        `light:` — for the handful of things a role cannot express.

        Almost nothing needs this: a colour that differs between themes is a
        role, and reaching for a variant instead is how a second palette gets
        smuggled in one utility at a time. It exists for properties that are
        not colours and still have to flip — the grain's blend mode being the
        only one today, because `overlay` lifts a dark field and has to become
        `multiply` to press into paper.
      */
      addVariant('light', "[data-theme='light'] &");
    }),
  ],
} satisfies Config;
