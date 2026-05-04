import { describe, it, expect } from 'vitest';
import { buildMatcher, isIgnored } from './matcher';

describe('buildMatcher + isIgnored', () => {
  it('ignores a path matching a .gitignore pattern', () => {
    const m = buildMatcher('node_modules\ndist\n', '');
    expect(isIgnored(m, 'node_modules')).toBe(true);
    expect(isIgnored(m, 'dist')).toBe(true);
  });

  it('ignores a path matching a .cortex/ignore pattern', () => {
    const m = buildMatcher('', 'src/\ntests/\n');
    expect(isIgnored(m, 'src')).toBe(true);
    expect(isIgnored(m, 'tests')).toBe(true);
  });

  it('layers both patterns', () => {
    const m = buildMatcher('node_modules\n', 'src/\n');
    expect(isIgnored(m, 'node_modules')).toBe(true);
    expect(isIgnored(m, 'src')).toBe(true);
    expect(isIgnored(m, 'docs')).toBe(false);
  });

  it('ignores a nested path under an ignored directory', () => {
    const m = buildMatcher('node_modules\n', '');
    expect(isIgnored(m, 'node_modules/lodash/index.js')).toBe(true);
  });

  it('does not ignore unmatched paths', () => {
    const m = buildMatcher('dist\n', '');
    expect(isIgnored(m, 'docs/README.md')).toBe(false);
  });

  it('handles empty patterns gracefully', () => {
    const m = buildMatcher('', '');
    expect(isIgnored(m, 'anything')).toBe(false);
  });

  it('normalises backslashes on Windows-style paths', () => {
    const m = buildMatcher('node_modules\n', '');
    expect(isIgnored(m, 'node_modules\\lodash')).toBe(true);
  });

  it('returns false for empty path', () => {
    const m = buildMatcher('*\n', '');
    expect(isIgnored(m, '')).toBe(false);
  });

  it('ignores a glob wildcard pattern', () => {
    const m = buildMatcher('*.log\n', '');
    expect(isIgnored(m, 'error.log')).toBe(true);
    expect(isIgnored(m, 'notes.md')).toBe(false);
  });
});
