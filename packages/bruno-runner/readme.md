# @usebruno/runner

The Bruno on-prem platform **runner agent**. It claims queued runs from the
platform backend and executes them with the Bruno CLI.

This is an operator-deployed, optional component (see
`docs/backend-plan.md` §8 in the platform repo). Interactive and CI runs do not
need it — only unattended monitors and scheduled runs do. It is never part of
the API's trust zone:

- talks HTTP to the backend only (a runner token, not a user session/PAT);
- never connects to Postgres, never holds the encryption key;
- forces the QuickJS ("safe") script sandbox;
- materializes each job into an ephemeral directory that is deleted after the
  run; secret values are passed to `bru run` via `--env-var` and never written
  to a file, the results, or logs.

## Run

```bash
BRUNO_API_URL=https://bruno.internal \
BRUNO_RUNNER_TOKEN=bruno_runner_xxx \
bruno-runner agent
```

A runner token is minted by a platform superadmin:
`POST /api/v1/admin/runners` → `{ token }` (shown once).

## Status

Phase 4b: functional runs only. Not yet supported: load (k6) runs,
collection-local JS `require()`, file-upload request bodies, per-folder/
request-list run targeting (tag filtering works).
