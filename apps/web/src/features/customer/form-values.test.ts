import { describe, it, expect } from 'vitest';
import { budgetPiastres, budgetDisplay, bottleSizes } from './form-values';
describe('customer preference values', () => { it('preserves EGP precision and unspecified budgets', () => { expect(budgetPiastres('')).toBeNull(); expect(budgetPiastres('850.05')).toBe(85005);expect(budgetPiastres('٨٥٠.٠٥')).toBe(85005); expect(budgetDisplay(85005)).toBe('850.05'); for (const v of ['-1', '1.001', 'Infinity', '1e3', '99999999'])
    expect(() => budgetPiastres(v)).toThrow(); }); it('validates sizes and Arabic/Latin separators', () => { expect(bottleSizes('30، 50, 50, 100')).toEqual([30, 50, 100]);expect(bottleSizes('٣٠، ٥٠')).toEqual([30,50]); expect(bottleSizes('')).toEqual([]); for (const v of ['-1', '50.5', '0', '9999', '50,'])
    expect(() => bottleSizes(v)).toThrow(); }); });
