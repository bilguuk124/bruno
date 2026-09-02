const path = require('path');
const fs = require('fs');
const os = require('os');
const yaml = require('js-yaml');
const {
  reorderWorkspaceCollections,
  getWorkspaceCollections
} = require('../../src/utils/workspace-config');

const collection = (name, pathSegment, extra = {}) => ({ name, path: pathSegment, ...extra });

describe('reorderWorkspaceCollections', () => {
  let workspacePath;

  /** Writes workspace.yml with the given collections (relative paths). */
  const writeWorkspaceYml = (collections) => {
    const content = [
      'opencollection: 1.0.0',
      'info:',
      '  name: Test',
      '  type: workspace',
      'collections:',
      ...collections.flatMap((c) => [`  - name: ${c.name}`, `    path: ${c.path}`]),
      'specs: []',
      'docs: \'\''
    ].join('\n');
    fs.writeFileSync(path.join(workspacePath, 'workspace.yml'), content);
  };

  /** Returns collection paths (relative) in order as stored in workspace.yml. */
  const getCollectionPathsFromYml = () => {
    const raw = fs.readFileSync(path.join(workspacePath, 'workspace.yml'), 'utf8');
    const config = yaml.load(raw);
    return (config.collections || []).map((c) => c.path);
  };

  /** Resolves a relative collection path segment to an absolute path under the current workspace. */
  const absPath = (relativePath) => path.resolve(workspacePath, relativePath);

  beforeEach(() => {
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'bruno-ws-'));
  });

  afterEach(() => {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  test('reorders collections to match given path list', async () => {
    writeWorkspaceYml([
      collection('API', 'collections/api'),
      collection('Backend', 'collections/backend'),
      collection('Frontend', 'collections/frontend')
    ]);

    await reorderWorkspaceCollections(workspacePath, [
      absPath('collections/frontend'),
      absPath('collections/api'),
      absPath('collections/backend')
    ]);

    expect(getCollectionPathsFromYml()).toEqual(['collections/frontend', 'collections/api', 'collections/backend']);
  });

  test('deduplicates when reorder list contains duplicate paths', async () => {
    writeWorkspaceYml([
      collection('API', 'collections/api'),
      collection('Backend', 'collections/backend')
    ]);

    await reorderWorkspaceCollections(workspacePath, [
      absPath('collections/api'),
      absPath('collections/backend'),
      absPath('collections/api'),
      absPath('collections/api')
    ]);

    expect(getCollectionPathsFromYml()).toEqual(['collections/api', 'collections/backend']);
  });
});

describe('getUnopenableWorkspaceCollections', () => {
  const { getUnopenableWorkspaceCollections } = require('../../src/utils/workspace-config');

  let workspacePath;

  const writeYml = (collections) => {
    const lines = ['opencollection: 1.0.0', 'info:', '  name: "Test"', '  type: workspace', 'collections:'];
    for (const c of collections) {
      lines.push(`  - name: "${c.name}"`);
      lines.push(`    path: "${c.path}"`);
      if (c.remote) lines.push(`    remote: "${c.remote}"`);
    }
    lines.push('specs: []');
    lines.push('docs: \'\'');
    fs.writeFileSync(path.join(workspacePath, 'workspace.yml'), lines.join('\n'));
  };

  const absPath = (relativePath) => path.resolve(workspacePath, relativePath);

  const ensureCollectionDir = (relativePath) => {
    const dir = path.join(workspacePath, relativePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'bruno.json'), JSON.stringify({ name: 'x', version: '1', type: 'collection' }));
  };

  beforeEach(() => {
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'bruno-ws-unopenable-'));
  });

  afterEach(() => {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  test('leaves out entries that point at a valid collection directory', () => {
    ensureCollectionDir('collections/api');
    writeYml([collection('API', 'collections/api')]);

    expect(getUnopenableWorkspaceCollections(workspacePath)).toEqual([]);
  });

  test('reports an entry whose folder does not exist', () => {
    writeYml([collection('Missing', 'collections/missing')]);

    expect(getUnopenableWorkspaceCollections(workspacePath)).toEqual([
      { name: 'Missing', path: absPath('collections/missing') }
    ]);
  });

  test('reports an entry whose folder has no collection config', () => {
    fs.mkdirSync(path.join(workspacePath, 'collections/empty'), { recursive: true });
    writeYml([collection('Empty', 'collections/empty')]);

    expect(getUnopenableWorkspaceCollections(workspacePath)).toEqual([
      { name: 'Empty', path: absPath('collections/empty') }
    ]);
  });

  test('reports a duplicated broken entry only once', () => {
    writeYml([
      collection('Missing', 'collections/missing'),
      collection('Missing Again', 'collections/missing')
    ]);

    expect(getUnopenableWorkspaceCollections(workspacePath)).toEqual([
      { name: 'Missing', path: absPath('collections/missing') }
    ]);
  });

  test('reports only the broken entries when the workspace mixes healthy and broken ones', () => {
    ensureCollectionDir('collections/api');
    fs.mkdirSync(path.join(workspacePath, 'collections/empty'), { recursive: true });
    writeYml([
      collection('API', 'collections/api'),
      collection('Missing', 'collections/missing'),
      collection('Empty', 'collections/empty')
    ]);

    expect(getUnopenableWorkspaceCollections(workspacePath).map((c) => c.name)).toEqual(['Missing', 'Empty']);
  });
});

describe('workspace specs normalization', () => {
  const {
    readWorkspaceConfig,
    addApiSpecToWorkspace,
    removeApiSpecFromWorkspace
  } = require('../../src/utils/workspace-config');
  let workspacePath;

  // Writes workspace.yml with a verbatim `specs:` block so we control its YAML shape.
  const writeWorkspaceYml = (specsYaml) => {
    const content = [
      'opencollection: 1.0.0',
      'info:',
      '  name: Test',
      '  type: workspace',
      'collections: []',
      specsYaml,
      'docs: \'\''
    ].join('\n');
    fs.writeFileSync(path.join(workspacePath, 'workspace.yml'), content);
  };

  beforeEach(() => {
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'bruno-ws-'));
  });

  afterEach(() => {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  // --- Regression guard: the `|| []` -> `Array.isArray(...) ? ... : []` swap must
  //     preserve behavior for every VALID shape, and only change non-array inputs. ---
  describe('readWorkspaceConfig coerces specs to an array', () => {
    const cases = [
      {
        name: 'valid populated list is preserved unchanged',
        yaml: ['specs:', '  - name: foo', '    path: foo.yaml', '  - name: bar', '    path: bar.yaml'].join('\n'),
        expected: [
          { name: 'foo', path: 'foo.yaml' },
          { name: 'bar', path: 'bar.yaml' }
        ]
      },
      { name: 'empty list stays empty', yaml: 'specs: []', expected: [] },
      { name: 'missing specs key -> []', yaml: '# no specs key', expected: [] },
      { name: 'null specs -> []', yaml: 'specs: null', expected: [] },
      { name: 'map (object) specs -> []', yaml: ['specs:', '  brokenEntry: not a list'].join('\n'), expected: [] },
      { name: 'string specs -> []', yaml: 'specs: "oops a string"', expected: [] },
      { name: 'number specs -> []', yaml: 'specs: 42', expected: [] },
      { name: 'boolean specs -> []', yaml: 'specs: true', expected: [] },
      {
        // An array of junk is still an array: coercion preserves it (no crash on .map);
        // invalid entries are dropped later by sanitizeSpecs on write, not here.
        name: 'array with non-object elements is preserved as-is',
        yaml: 'specs: [1, "two", null]',
        expected: [1, 'two', null]
      }
    ];

    test.each(cases)('$name', ({ yaml, expected }) => {
      writeWorkspaceYml(yaml);
      const config = readWorkspaceConfig(workspacePath);
      // Both the legacy `specs` field and the renderer-facing `apiSpecs` must be arrays.
      expect(Array.isArray(config.specs)).toBe(true);
      expect(Array.isArray(config.apiSpecs)).toBe(true);
      expect(config.specs).toEqual(expected);
      expect(config.apiSpecs).toEqual(expected);
      // apiSpecs mirrors specs by value but is a distinct array, so an in-place
      // mutation of one field can't silently change the other.
      expect(config.apiSpecs).not.toBe(config.specs);
    });
  });

  // --- Write paths must not throw on an already-malformed workspace.yml and must self-heal. ---
  describe('write paths survive a malformed (non-array) specs', () => {
    const malformedYaml = ['specs:', '  brokenEntry: not a list'].join('\n');
    const specsInYml = () => {
      const raw = fs.readFileSync(path.join(workspacePath, 'workspace.yml'), 'utf8');
      return yaml.load(raw).specs;
    };

    test('addApiSpecToWorkspace does not throw and writes a valid list', async () => {
      writeWorkspaceYml(malformedYaml);
      const specPath = path.join(workspacePath, 'api.yaml');
      await expect(
        addApiSpecToWorkspace(workspacePath, { name: 'api', path: specPath })
      ).resolves.toBeDefined();

      const stored = specsInYml();
      expect(Array.isArray(stored)).toBe(true);
      expect(stored).toEqual([{ name: 'api', path: 'api.yaml' }]);
    });

    test('removeApiSpecFromWorkspace does not throw on malformed specs', async () => {
      writeWorkspaceYml(malformedYaml);
      const result = await removeApiSpecFromWorkspace(workspacePath, path.join(workspacePath, 'whatever.yaml'));
      expect(result.removedApiSpec).toBeNull();
      // Round-trip through readWorkspaceConfig (which coerces) must yield a safe array.
      expect(Array.isArray(readWorkspaceConfig(workspacePath).specs)).toBe(true);
    });
  });
});
