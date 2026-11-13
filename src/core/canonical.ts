/**
 * RFC 8785 — JSON Canonicalization Scheme (JCS).
 *
 * A receipt is only worth something if everyone hashes exactly the same bytes.
 * `JSON.stringify` does not give you that: key order follows insertion order and
 * numbers follow whatever the engine feels like. JCS fixes both. This file is the
 * whole of it, for the subset of JSON we allow.
 *
 * Reference: RFC 8785 §3.2 (serialization of primitives), §3.2.3 (sorting).
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export class CanonicalizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalizeError';
  }
}

export function canonicalize(value: unknown): string {
  return write(value, []);
}

function write(value: unknown, path: string[]): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';

    case 'number':
      return serializeNumber(value, path);

    case 'string':
      return serializeString(value);

    case 'object':
      if (Array.isArray(value)) {
        const parts: string[] = [];
        for (let i = 0; i < value.length; i += 1) {
          parts.push(write(value[i], [...path, String(i)]));
        }
        return `[${parts.join(',')}]`;
      }
      return writeObject(value as Record<string, unknown>, path);

    default:
      throw new CanonicalizeError(
        `unsupported type "${typeof value}" at ${path.join('.') || '<root>'}`,
      );
  }
}

function writeObject(obj: Record<string, unknown>, path: string[]): string {
  // Only plain records. A Map, a Date or a class instance would serialise to "{}"
  // and quietly sign nothing, which is worse than throwing.
  const proto = Object.getPrototypeOf(obj);
  if (proto !== Object.prototype && proto !== null) {
    throw new CanonicalizeError(
      `only plain objects can be canonicalised; got ${proto?.constructor?.name ?? 'unknown'} at ${path.join('.') || '<root>'}`,
    );
  }
  // JCS §3.2.3: sort by UTF-16 code units. Array#sort on strings does exactly that.
  const keys = Object.keys(obj).filter((key) => obj[key] !== undefined).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const encodedKey = serializeString(key);
    const encodedValue = write(obj[key], [...path, key]);
    parts.push(`${encodedKey}:${encodedValue}`);
  }
  return `{${parts.join(',')}}`;
}

/**
 * JCS §3.2.2.3: numbers are serialized with ECMAScript's Number::toString,
 * which is already the shortest round-tripping form. Two extra rules:
 *   - NaN and ±Infinity are not valid JSON and must be rejected, not coerced.
 *   - -0 serializes as "0".
 */
function serializeNumber(value: number, path: string[]): string {
  if (!Number.isFinite(value)) {
    throw new CanonicalizeError(
      `non-finite number (${String(value)}) at ${path.join('.') || '<root>'} — JSON has no NaN/Infinity`,
    );
  }
  if (Object.is(value, -0)) return '0';
  return String(value);
}

const SHORT_ESCAPES: Record<string, string> = {
  '\b': '\\b',
  '\t': '\\t',
  '\n': '\\n',
  '\f': '\\f',
  '\r': '\\r',
  '"': '\\"',
  '\\': '\\\\',
};

/**
 * JCS §3.2.2.2: escape only what must be escaped. Everything else — including
 * non-ASCII and U+2028/U+2029 — stays literal, so two people in two languages
 * produce the same bytes.
 */
function serializeString(value: string): string {
  let out = '"';
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i] as string;
    const short = SHORT_ESCAPES[ch];
    if (short !== undefined) {
      out += short;
      continue;
    }
    const code = value.charCodeAt(i);
    if (code < 0x20) {
      out += `\\u${code.toString(16).padStart(4, '0')}`;
      continue;
    }
    out += ch;
  }
  return `${out}"`;
}

/** Convenience: canonical form as UTF-8 bytes, ready to hash or sign. */
export function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}
