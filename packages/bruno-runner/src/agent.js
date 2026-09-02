const chalk = require('chalk');
const { ApiClient } = require('./api');
const { materialize } = require('./materialize');
const { runIteration, isFailure } = require('./execute');

const log = (...args) => console.log(chalk.dim(new Date().toISOString()), ...args);

const runJob = async (api, job) => {
  log(chalk.cyan(`claimed run ${job.runId}`), `(mode=${job.mode}, iterations=${job.iterations})`);

  if (job.mode !== 'functional') {
    await api.complete(job.runId, {
      status: 'errored',
      summary: { error: `this runner does not support mode "${job.mode}"` }
    });
    return;
  }

  const materialized = await materialize(job);
  const controller = new AbortController();
  const merged = { summary: {}, totals: 0 };

  try {
    for (let i = 1; i <= Math.max(1, job.iterations || 1); i++) {
      const { results, summary } = await runIteration({
        dir: materialized.dir,
        job,
        environmentName: materialized.environmentName,
        secrets: materialized.secrets,
        iteration: i,
        signal: controller.signal
      });

      const canceled = await api.postEvents(job.runId, results);
      merged.summary = summary;
      merged.totals += results.length;

      if (canceled) {
        log(chalk.yellow(`run ${job.runId} canceled — stopping`));
        controller.abort();
        await api.complete(job.runId, { status: 'canceled', summary });
        return;
      }
    }

    const status = isFailure(merged.summary) ? 'failed' : 'passed';
    await api.complete(job.runId, { status, summary: merged.summary });
    log(status === 'passed' ? chalk.green(`run ${job.runId} ${status}`) : chalk.red(`run ${job.runId} ${status}`));
  } catch (err) {
    log(chalk.red(`run ${job.runId} errored:`), err.message);
    await api.complete(job.runId, { status: 'errored', summary: { error: err.message } });
  } finally {
    materialized.cleanup();
  }
};

/**
 * Runs the claim loop until the process is signalled. Between claims it
 * heartbeats and idles for `pollMs`.
 */
const runAgent = async ({ baseUrl, token, modes = ['functional'], pollMs = 3000 }) => {
  const api = new ApiClient({ baseUrl, token });
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  log(chalk.bold('bruno-runner agent started'), `-> ${baseUrl}`, `modes=${modes.join(',')}`);

  while (!stopping) {
    try {
      await api.heartbeat();
      const job = await api.claim(modes);
      if (job) {
        await runJob(api, job);
        continue; // immediately try for another
      }
    } catch (err) {
      log(chalk.red('loop error:'), err.message);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }

  log('agent stopped');
};

module.exports = { runAgent, runJob };
