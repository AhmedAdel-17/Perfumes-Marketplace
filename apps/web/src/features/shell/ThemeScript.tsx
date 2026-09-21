import { DEFAULT_THEME, THEME_ATTRIBUTE, THEME_STORAGE_KEY, themes } from '@diyar/tokens';

/**
 * Applies the remembered theme before the first paint.
 *
 * WHY A BLOCKING INLINE SCRIPT, which is normally the wrong answer. The theme
 * lives in localStorage, which the server cannot read, so the server-rendered
 * HTML necessarily carries the DEFAULT theme. A visitor who chose paper would
 * therefore see a black page flash to white on every navigation — and on a
 * fashion surface a flash of the wrong brand is not a cosmetic defect, it is
 * the interface admitting it was assembled after arriving.
 *
 * Nothing else can fix this. `useEffect` runs after paint by definition, and a
 * cookie would make every page uncacheable for the sake of one attribute. The
 * script is ~200 bytes, runs synchronously in <head>, and touches one attribute.
 *
 * It is deliberately defensive: a browser with storage disabled (private mode,
 * a locked-down corporate profile) throws on `localStorage`, and an unhandled
 * throw here would leave the document without its attribute — which still
 * renders, in the default theme, which is exactly the right failure.
 */
const source = [
  '(function(){try{',
  `var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});`,
  `if(t==='light'||t==='dark')document.documentElement.setAttribute(${JSON.stringify(THEME_ATTRIBUTE)},t);`,
  '}catch(e){}})()',
].join('');

/**
 * `nonce` is this request's Content-Security-Policy nonce (P3.4.3). Without it
 * the policy refuses the script, the remembered theme is never applied, and a
 * visitor who chose paper sees the page flash from black on every navigation.
 */
export function ThemeScript({ nonce }: { nonce?: string | undefined }) {
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: source }} />;
}

/**
 * The browser chrome colour for the default theme.
 *
 * Next writes `<meta name="theme-color">` at build time from the viewport
 * export, so it can only ever describe the default; the toggle rewrites it live
 * for the other one. Read from the theme rather than the palette so it cannot
 * drift away from the background it exists to continue.
 */
export const DEFAULT_THEME_COLOR = themes[DEFAULT_THEME].ground;
