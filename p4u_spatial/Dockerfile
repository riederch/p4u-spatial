FROM node:22-alpine AS builder

WORKDIR /build

COPY tsconfig.base.json ./tsconfig.base.json
COPY bridge/package.json ./bridge/package.json
COPY bridge/tsconfig.json ./bridge/tsconfig.json

WORKDIR /build/bridge
RUN npm install --no-audit --no-fund

COPY bridge/src ./src

RUN npm run build \
    && npm prune --omit=dev

FROM ghcr.io/home-assistant/base:latest

ARG BUILD_ARCH
ARG BUILD_VERSION

ENV P4U_APP_VERSION="${BUILD_VERSION}"

LABEL \
  io.hass.type="app" \
  io.hass.name="P4U Spatial" \
  io.hass.version="${BUILD_VERSION}" \
  io.hass.arch="${BUILD_ARCH}" \
  io.hass.url="https://github.com/riederch/p4u-spatial" \
  org.opencontainers.image.title="P4U Spatial" \
  org.opencontainers.image.description="Open spatial bridge for XR, GIS and interoperable spatial data." \
  org.opencontainers.image.source="https://github.com/riederch/p4u-spatial"

RUN apk add --no-cache nodejs git ca-certificates

WORKDIR /opt/p4u-spatial/bridge

COPY --from=builder /build/bridge/package.json ./package.json
COPY --from=builder /build/bridge/node_modules ./node_modules
COPY --from=builder /build/bridge/dist ./dist

COPY p4u_spatial/run.sh /run.sh
RUN chmod a+x /run.sh

EXPOSE 8787

CMD ["/run.sh"]
