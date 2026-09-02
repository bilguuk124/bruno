<br />
<img src="assets/images/logo-transparent.png" width="80"/>

### Newton — self-hosted client for exploring and testing APIs

Newton is the desktop/web client for a self-hosted API platform. A backend you
run is the source of truth for workspaces, collections, environments, secrets,
history, and scheduled runs; the client executes requests locally and syncs
state over REST + WebSocket.

Newton is a fork of [Bruno](https://github.com/usebruno/bruno). It keeps Bruno's
request pipeline, script/test runtime, and the `.bru` / OpenCollection file
formats, and drops the Git-based sync model in favour of the backend.

## Repository layout

This repository is the client. The backend, deployment manifests, and the
platform design docs live in the platform repository, which vendors this repo as
a submodule.

- `packages/bruno-app` — React renderer
- `packages/bruno-electron` — Electron main process
- `packages/bruno-*` — shared libraries (request pipeline, sandbox, file
  formats, converters). Published under the `@usebruno/*` names.
- `packages/bruno-runner` — Node agent that runs scheduled collection runs
  against the backend

## Development

```sh
nvm use                       # Node v22.12.0 (.nvmrc)
npm i --legacy-peer-deps
npm run setup                 # build shared packages + sandbox bundle
npm run dev                   # electron + renderer
```

See `.claude/CLAUDE.md` and the rules under `.claude/rules/` for the module
layout, IPC conventions, and the on-disk format contract.

## CLI

The `bru` CLI (`@usebruno/cli`) runs collections from the command line for local
use and CI. Its command surface is unchanged from upstream Bruno.

```sh
npm install -g @usebruno/cli
bru run --env Local
```

## Credits

Built on [Bruno](https://github.com/usebruno/bruno) by Anoop M D and
contributors. The dog logo is from [OpenMoji](https://openmoji.org/library/emoji-1F436/)
(CC BY-SA 4.0).

## License

[MIT](license.md)
