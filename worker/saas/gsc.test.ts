import { describe, expect, it } from 'vitest';
import { parseStoredRefresh } from './gsc.js';

describe('gsc stored refresh', () => {
  it('parses JSON blobs and plain tokens', () => {
    expect(parseStoredRefresh('plain-token').refresh_token).toBe('plain-token');
    expect(parseStoredRefresh(JSON.stringify({ refresh_token: 'abc', client_id: 'id' }))).toEqual({
      refresh_token: 'abc',
      client_id: 'id',
    });
  });
});
