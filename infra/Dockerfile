FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/ ./packages/
COPY apps/ ./apps/
COPY specs/ ./specs/
COPY tsconfig.base.json ./
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:20-alpine AS production
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=build /app/packages/ ./packages/
COPY --from=build /app/apps/ ./apps/
COPY --from=build /app/specs/ ./specs/
COPY --from=build /app/tsconfig.base.json ./
RUN pnpm install --frozen-lockfile --prod
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health || exit 1
ENTRYPOINT ["node", "apps/cli/dist/index.js"]
