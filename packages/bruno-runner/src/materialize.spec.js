const fs = require('fs');
const path = require('path');
const { toCliItem, splitVariables, materialize } = require('./materialize');

describe('toCliItem', () => {
  it('maps an http request node, carrying the spec through as request', () => {
    const node = {
      kind: 'http-request',
      name: 'List Pets',
      seq: 2,
      tags: ['smoke'],
      spec: { method: 'GET', url: '{{base}}/pets', headers: [] }
    };
    expect(toCliItem(node)).toEqual({
      type: 'http-request',
      name: 'List Pets',
      seq: 2,
      tags: ['smoke'],
      request: { method: 'GET', url: '{{base}}/pets', headers: [] }
    });
  });

  it('recurses folders and drops unsupported kinds', () => {
    const folder = {
      kind: 'folder',
      name: 'Pets',
      seq: 1,
      rootSpec: {},
      items: [
        { kind: 'http-request', name: 'A', seq: 1, spec: {} },
        { kind: 'grpc-request', name: 'B', seq: 2, spec: {} },
        { kind: 'js', name: 'helpers.js', content: 'x' }
      ]
    };
    const out = toCliItem(folder);
    expect(out.type).toBe('folder');
    expect(out.items.map((i) => i.name)).toEqual(['A']);
  });
});

describe('splitVariables', () => {
  it('routes secrets away from the file, keeps non-secrets', () => {
    const { secrets, nonSecretVars } = splitVariables({
      variables: [
        { name: 'base', value: 'https://x', isSecret: false, enabled: true },
        { name: 'token', value: 'sk-123', isSecret: true },
        { name: 'empty', value: null, isSecret: true }
      ]
    });
    expect(secrets).toEqual({ token: 'sk-123' });
    expect(nonSecretVars).toEqual([
      { name: 'base', value: 'https://x', enabled: true, secret: false, type: 'text' }
    ]);
  });
});

describe('materialize', () => {
  it('writes a runnable bru collection with no secret values on disk', async () => {
    const job = {
      collection: {
        collection: { name: 'API', rootSpec: {} },
        items: [
          {
            kind: 'folder',
            name: 'Pets',
            seq: 1,
            rootSpec: { meta: { name: 'Pets' } },
            items: [
              {
                kind: 'http-request',
                name: 'List',
                seq: 1,
                spec: { method: 'GET', url: '{{base}}/pets', headers: [], params: [], body: { mode: 'none' } }
              }
            ]
          }
        ]
      },
      environment: {
        name: 'Staging',
        variables: [
          { name: 'base', value: 'https://staging.example.com', isSecret: false, enabled: true },
          { name: 'token', value: 'sk-SECRET-NEEDLE', isSecret: true }
        ]
      }
    };

    const m = await materialize(job);
    try {
      expect(fs.existsSync(path.join(m.dir, 'bruno.json'))).toBe(true);
      expect(fs.existsSync(path.join(m.dir, 'Pets', 'List.bru'))).toBe(true);

      const envFile = fs.readFileSync(path.join(m.dir, 'environments', 'Staging.bru'), 'utf8');
      expect(envFile).toContain('base');
      expect(envFile).not.toContain('SECRET-NEEDLE');

      expect(m.secrets).toEqual({ token: 'sk-SECRET-NEEDLE' });
    } finally {
      m.cleanup();
    }
    expect(fs.existsSync(m.dir)).toBe(false);
  });
});
