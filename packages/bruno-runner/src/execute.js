const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const bruBin = require.resolve('@usebruno/cli/bin/bru.js');

const mapStatus = (s) => {
  switch (s) {
    case 'pass':
      return 'passed';
    case 'fail':
      return 'failed';
    case 'error':
      return 'errored';
    case 'skipped':
      return 'skipped';
    default:
      return s || 'errored';
  }
};

// A CLI result carries the full response (headers, body). Keep only
// non-sensitive metadata — response headers can echo Authorization, bodies can
// contain secrets — so nothing sensitive reaches run_request_results.
const responseMeta = (r) => ({
  status: r?.response?.status ?? null,
  statusText: r?.response?.statusText ?? null,
  size: r?.response?.size ?? null,
  responseTimeMs: r?.response?.responseTime ?? null
});

const toRequestResults = (report, iteration) =>
  (report.results || []).map((r) => ({
    iteration,
    name: r.name || r.suitename || 'request',
    status: mapStatus(r.status),
    durationMs: r.response?.responseTime ?? Math.round((r.runDuration || 0) * 1000),
    responseMeta: responseMeta(r),
    assertions: r.assertionResults || [],
    tests: [
      ...(r.preRequestTestResults || []),
      ...(r.testResults || []),
      ...(r.postResponseTestResults || [])
    ],
    error: typeof r.error === 'string' ? r.error : r.error ? JSON.stringify(r.error) : ''
  }));

const isFailure = (summary = {}) =>
  (summary.failedRequests || 0) +
    (summary.failedAssertions || 0) +
    (summary.failedTests || 0) +
    (summary.failedPreRequestTests || 0) +
    (summary.failedPostResponseTests || 0) +
    (summary.errorRequests || 0) >
  0;

/**
 * Runs one iteration of the collection at `dir` via `bru run` and returns
 * { results, summary }. Secrets are passed as --env-var, never written to disk.
 */
const runIteration = ({ dir, job, environmentName, secrets, iteration, signal }) =>
  new Promise((resolve, reject) => {
    const reportPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bruno-report-')), 'report.json');

    const args = ['run', '.', '--reporter-json', reportPath, '--sandbox', 'safe'];
    // --env loads the materialized environments/<name>.bru (non-secret values);
    // each secret is layered on top as an override so it never touches disk.
    if (environmentName) args.push('--env', environmentName);
    if (job.bail) args.push('--bail');
    if (job.delayMs > 0) args.push('--delay', String(job.delayMs));
    for (const [name, value] of Object.entries(secrets)) {
      args.push('--env-var', `${name}=${value}`);
    }
    const tags = job.target && job.target.tags;
    if (Array.isArray(tags) && tags.length) args.push('--tags', tags.join(','));

    const child = spawn(process.execPath, [bruBin, ...args], {
      cwd: dir,
      signal,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    // bru run's exit code is non-zero on any failing assertion/test; that's an
    // expected run outcome, not an agent error. Read the report regardless.
    child.on('error', (err) => reject(err));
    child.on('close', () => {
      let report;
      try {
        report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      } catch (err) {
        fs.rmSync(path.dirname(reportPath), { recursive: true, force: true });
        reject(new Error(`bru run produced no report: ${err.message}\n${stderr.slice(-2000)}`));
        return;
      }
      fs.rmSync(path.dirname(reportPath), { recursive: true, force: true });
      resolve({
        results: toRequestResults(report, iteration),
        summary: report.summary || {}
      });
    });
  });

module.exports = { runIteration, isFailure };
