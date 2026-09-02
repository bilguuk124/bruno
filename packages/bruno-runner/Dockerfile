# Build context is the bruno-frontend/ monorepo root.
#   docker build -f packages/bruno-runner/Dockerfile -t bruno-runner .

FROM node:22-bookworm-slim AS build
WORKDIR /app

# Install everything (workspaces) then build the shared packages the CLI needs
# and the QuickJS sandbox library bundle.
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci --legacy-peer-deps --no-audit --no-fund

RUN npm run build:bruno-common \
 && npm run build:bruno-requests \
 && npm run build:schema-types \
 && npm run build:bruno-query \
 && npm run build:bruno-filestore \
 && npm run build:bruno-converters \
 && npm run sandbox:bundle-libraries --workspace=packages/bruno-js \
 && npm prune --omit=dev --legacy-peer-deps

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# The runner needs only the CLI's dependency tree plus itself.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/bruno-runner   ./packages/bruno-runner
COPY --from=build /app/packages/bruno-cli       ./packages/bruno-cli
COPY --from=build /app/packages/bruno-js        ./packages/bruno-js
COPY --from=build /app/packages/bruno-common    ./packages/bruno-common
COPY --from=build /app/packages/bruno-requests  ./packages/bruno-requests
COPY --from=build /app/packages/bruno-filestore ./packages/bruno-filestore
COPY --from=build /app/packages/bruno-lang      ./packages/bruno-lang
COPY --from=build /app/packages/bruno-query     ./packages/bruno-query
COPY --from=build /app/packages/bruno-converters ./packages/bruno-converters
COPY --from=build /app/packages/bruno-schema     ./packages/bruno-schema
COPY --from=build /app/packages/bruno-schema-types ./packages/bruno-schema-types

USER node
ENTRYPOINT ["node", "packages/bruno-runner/bin/bruno-runner.js"]
CMD ["agent"]
