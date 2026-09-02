const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');
const { runAgent } = require('./agent');

const run = () => {
  yargs(hideBin(process.argv))
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
