# The listener (#217, ADR 0019): the SIRI-ET listener's entry point, src/listener/main.ts, run by
# Node's own type stripping, with only the folders its lint fence lets it and the SIRI-ET reader
# import (.oxlintrc.json) and the packages they need. Built
# from the repository root: docker build --file listener.Dockerfile --build-arg VERSION=<commit> .

FROM node:22-alpine AS packages
WORKDIR /listener
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:22-alpine
WORKDIR /listener
ARG VERSION=dev
ENV NODE_ENV=production MYLDER_LISTENER_VERSION=$VERSION
# Effect for the table's schema, rhea for AMQP, and rhea's own. The image's start check in CI
# loads every import, so a package missing here fails the build there.
COPY --from=packages /listener/node_modules/effect ./node_modules/effect
COPY --from=packages /listener/node_modules/rhea ./node_modules/rhea
COPY --from=packages /listener/node_modules/debug ./node_modules/debug
COPY --from=packages /listener/node_modules/ms ./node_modules/ms
COPY package.json ./
COPY src/listener ./src/listener
COPY src/siri-et ./src/siri-et
COPY src/timetable ./src/timetable
COPY src/domain ./src/domain
USER node
EXPOSE 8080
CMD ["node", "src/listener/main.ts"]
