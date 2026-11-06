import raw from './tokens.json' with { type: 'json' };

/** Scoped seller-workspace palette: the user-approved operating-system concept
 * changes only this portal, preserving both public storefront themes. */
const channels = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(' ');
export const SELLER_WORKSPACE_STYLE: Record<string, string> = Object.fromEntries(
  Object.entries(raw.sellerWorkspaceColor).map(([name, color]) => [`--seller-${name}`, channels(color)]),
);
