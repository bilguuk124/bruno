const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');
const { runAgent } = require('./agent');
const { ciRun } = require('./ci');

const run = () => {
  yargs(hideBin(process.argv))
    .command(
      'run',
      'Trigger a run from CI (authenticate with a personal access token)',
      (y) =>
        y
          .option('url', { default: process.env.BRUNO_API_URL, type: 'string' })
          .option('token', {
            describe: 'Personal access token with the run:trigger scope',
            default: process.env.BRUNO_PAT,
            type: 'string'
          })
          .option('profile', { describe: 'Run profile id', type: 'string' })
          .option('collection', { describe: 'Collection id (ad-hoc run)', type: 'string' })
          .option('env', { describe: 'Environment id (ad-hoc run)', type: 'string' })
          .option('git-sha', { type: 'string' })
          .option('wait', { default: true, type: 'boolean' })
          .option('timeout', { default: 900, type: 'number', describe: 'seconds' }),
      async (argv) => {
        if (!argv.url || !argv.token) {
          console.error('--url and --token (or BRUNO_API_URL / BRUNO_PAT) are required');
          process.exit(2);
        }
        if (!argv.profile && !argv.collection) {
          console.error('one of --profile or --collection is required');
          process.exit(2);
        }
        const code = await ciRun({
          baseUrl: argv.url,
          token: argv.token,
          profileId: argv.profile,
          collectionId: argv.collection,
          environmentId: argv.env,
          extRef: argv.gitSha ? { gitSha: argv.gitSha } : undefined,
          wait: argv.wait,
          timeoutSec: argv.timeout
        });
        // Set the code and let the loop drain (undici keep-alive sockets);
        // don't process.exit() out from under a pending connection.
        process.exitCode = code;
      }
    )
    .command(
      'agent',
      'Run the claim loop: poll the backend for queued runs and execute them',
      (y) =>
        y
          .option('url', {
            describe: 'Backend base URL',
            default: process.env.BRUNO_API_URL,
            type: 'string'
          })
          .option('token', {
            describe: 'Runner token (bruno_runner_...)',
            default: process.env.BRUNO_RUNNER_TOKEN,
            type: 'string'
          })
          .option('modes', {
            describe: 'Run modes this agent will claim',
            default: 'functional',
            type: 'string'
          })
          .option('poll-ms', { default: 3000, type: 'number' }),
      async (argv) => {
        if (!argv.url || !argv.token) {
          console.error('--url and --token (or BRUNO_API_URL / BRUNO_RUNNER_TOKEN) are required');
          process.exit(1);
        }
        await runAgent({
          baseUrl: argv.url,
          token: argv.token,
          modes: argv.modes.split(',').map((s) => s.trim()).filter(Boolean),
          pollMs: argv.pollMs
        });
      }
    )
    .demandCommand(1)
    .strict()
    .help()
    .parse();
};

module.exports = { run };
