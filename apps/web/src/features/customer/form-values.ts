import {westernDigits} from '@diyar/i18n';
/** Parse user-entered EGP without floating-point financial arithmetic. */
export function budgetPiastres(raw: string): number | null {
    const value = westernDigits(raw).trim();
    if (!value)
        return null;
    if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(value))
        throw new Error('Invalid budget');
    const [whole, fraction = ''] = value.split('.');
    const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(result) || result > 2147483647)
        throw new Error('Invalid budget');
    return result;
}
export function budgetDisplay(value: number | null) { return value === null ? '' : String(Math.floor(value / 100)) + '.' + String(value % 100).padStart(2, '0'); }
export function bottleSizes(raw: string): number[] { if (!raw.trim())
    return []; const parts = westernDigits(raw).split(/[,،]/).map(v => v.trim()); if (parts.length > 10 || parts.some(v => !/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 2000))
    throw new Error('Invalid sizes'); return [...new Set(parts.map(Number))]; }
