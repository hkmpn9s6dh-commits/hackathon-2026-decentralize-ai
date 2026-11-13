import { describe, expect, it } from 'vitest';
import { CanonicalizeError, canonicalize } from '../src/core/canonical.js';

describe('RFC 8785 canonical JSON', () => {
  it('sorts object keys by UTF-16 code unit', () => {
    expect(canonicalize({ b: 1, a: 2, A: 3 })).toBe('{"A":3,"a":2,"b":1}');
  });

  it('keeps insertion order out of the picture', () => {
    const one = { z: 1, m: { y: 2, b: 3 } };
    const two = { m: { b: 3, y: 2 }, z: 1 };
    expect(canonicalize(one)).toBe(canonicalize(two));
  });

  it('serialises numbers the way ECMAScript does, with -0 as 0', () => {
    expect(canonicalize(1)).toBe('1');
    expect(canonicalize(1.5)).toBe('1.5');
    expect(canonicalize(-0)).toBe('0');
    expect(canonicalize(1e21)).toBe('1e+21');
    expect(canonicalize(0.000001)).toBe('0.000001');
    expect(canonicalize(5e-7)).toBe('5e-7');
  });

  it('rejects the numbers JSON cannot carry', () => {
    expect(() => canonicalize(Number.NaN)).toThrow(CanonicalizeError);
    expect(() => canonicalize(Number.POSITIVE_INFINITY)).toThrow(CanonicalizeError);
  });

  it('escapes only what must be escaped', () => {
    expect(canonicalize('a"b\\c')).toBe('"a\\"b\\\\c"');
    expect(canonicalize('\n\t')).toBe('"\\n\\t"');
    expect(canonicalize('\u0001')).toBe('"\\u0001"');
  });

  it('leaves non-ASCII and U+2028 alone, so two locales agree', () => {
    expect(canonicalize('中文')).toBe('"中文"');
    expect(canonicalize('\u2028')).toBe('"\u2028"');
    expect(canonicalize('émoji 🐾')).toBe('"émoji 🐾"');
  });

  it('drops undefined properties instead of inventing a value', () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('handles arrays and nesting', () => {
    expect(canonicalize([1, [2, { b: 1, a: 2 }], null, true])).toBe('[1,[2,{"a":2,"b":1}],null,true]');
  });

  it('refuses values JSON cannot represent', () => {
    expect(() => canonicalize(new Map())).toThrow(CanonicalizeError);
    expect(() => canonicalize(() => 1)).toThrow(CanonicalizeError);
  });
});
