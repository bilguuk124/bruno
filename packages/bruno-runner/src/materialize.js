const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCollectionFromBrunoObject } = require('@usebruno/cli/src/utils/collection');

// The claim payload's `collection` is a nested tree in the same shape as
// GET /collections/{id}/tree: nodes carry `kind`, `spec` (the request), and
// nested `items`. The CLI's collection-directory writer wants `type`,
// `request`, and `root` instead — this maps between them.
const KIND_TO_TYPE = {
  'http-request': 'http-request',
  'graphql-request': 'graphql-request'
};

const toCliItem = (node) => {
  if (node.kind === 'folder') {
    return {
      type: 'folder',
      name: node.name,
      seq: node.seq,
      root: node.rootSpec && Object.keys(node.rootSpec).length ? node.rootSpec : undefined,
      items: (node.items || []).map(toCliItem).filter(Boolean)
    };
  }
  const type = KIND_TO_TYPE[node.kind];
  if (!type) {
    // grpc/ws/js/app aren't functional-test shaped; skip them for a functional run.
    return null;
  }
  return {
    type,
    name: node.name,
    seq: node.seq,
    tags: node.tags || [],
    request: node.spec || {}
  };
};

const splitVariables = (environment) => {
  const secrets = {};
  const nonSecretVars = [];
  for (const v of environment?.variables || []) {
    if (v.value == null) continue;
    if (v.isSecret) {
      // Secrets go to the CLI as --env-var overrides, never written to a file.
      secrets[v.name] = String(v.value);
    } else {
      nonSecretVars.push({ name: v.name, value: v.value, enabled: v.enabled !== false, secret: false, type: 'text' });
    }
  }
  return { secrets, nonSecretVars };
};

/**
 * Writes the job's collection to an ephemeral Bruno collection directory and
 * returns { dir, secrets, cleanup }. The directory holds only non-secret
 * environment values; secret values are returned separately for --env-var.
 */
const materialize = async (job) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bruno-run-'));

  const tree = typeof job.collection === 'string' ? JSON.parse(job.collection) : job.collection;
  const environment = job.environment
    ? typeof job.environment === 'string'
      ? JSON.parse(job.environment)
      : job.environment
    : null;

  const { secrets, nonSecretVars } = splitVariables(environment);

  const brunoObject = {
    name: tree.collection?.name || 'collection',
    root: tree.collection?.rootSpec || {},
    environments: environment ? [{ name: environment.name, variables: nonSecretVars }] : [],
    items: (tree.items || []).map(toCliItem).filter(Boolean)
  };

  await createCollectionFromBrunoObject(brunoObject, dir, { format: 'bru' });

  return {
    dir,
    environmentName: environment?.name || null,
    secrets,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
  };
};

module.exports = { materialize, toCliItem, splitVariables };
