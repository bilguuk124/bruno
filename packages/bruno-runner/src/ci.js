const chalk = require('chalk');
const { ApiClient } = require('./api');

const TERMINAL = new Set(['passed', 'failed', 'errored', 'canceled']);

/**
 * Triggers a run and, with wait=true, blocks until it finishes. Returns the
 * process exit code: 0 when the run passed, 1 otherwise.
 */
const ciRun = async ({ baseUrl, token, profileId, collectionId, environmentId, extRef, wait, timeoutSec, pollMs = 3000 }) => {
  const api = new ApiClient({ baseUrl, token });

  const body = profileId
    ? { runProfileId: profileId }
    : { collectionId, environmentId };
  if (extRef) body.extRef = extRef;

  const run = await api.createRun(body);
  console.log(chalk.cyan(`queued run ${run.id}`), `(${run.mode}, trigger=${run.trigger})`);

  if (!wait) return 0;

  const deadline = Date.now() + timeoutSec * 1000;
  for (;;) {
    if (Date.now() > deadline) {
      console.error(chalk.red(`timed out after ${timeoutSec}s waiting for run ${run.id}`));
      return 1;
    }
    await new Promise((r) => setTimeout(r, pollMs));

    const { run: current, results } = await api.getRun(run.id);
    if (!TERMINAL.has(current.status)) {
      process.stdout.write('.');
      continue;
    }
    process.stdout.write('\n');

    const s = current.summary || {};
    console.log(
      current.status === 'passed'
        ? chalk.green(`run ${run.id} passed`)
        : chalk.red(`run ${run.id} ${current.status}`)
    );
    if (s.totalRequests != null) {
      console.log(
        `  requests ${s.passedRequests || 0}/${s.totalRequests}` +
          `  assertions ${s.passedAssertions || 0}/${s.totalAssertions || 0}` +
          `  tests ${s.passedTests || 0}/${s.totalTests || 0}`
      );
    }
    for (const r of results || []) {
      if (r.status !== 'passed') console.log(chalk.red(`  ✗ ${r.name}: ${r.error || r.status}`));
    }
    return current.status === 'passed' ? 0 : 1;
  }
};

module.exports = { ciRun };
