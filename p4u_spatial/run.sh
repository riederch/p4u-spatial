#!/usr/bin/with-contenv bashio

SOURCE_TITLE="$(bashio::config 'source_title')"
ADMIN_KEY="$(bashio::config 'admin_key')"

export P4U_HOST="0.0.0.0"
export P4U_PORT="8787"
export P4U_STATE_DIR="/data/state"
export P4U_REPOSITORY_ROOT="/data/repository"
export P4U_SPATIAL_ROOT="spatial"
export P4U_SPATIAL_SOURCE_TITLE="${SOURCE_TITLE}"

if [[ -n "${ADMIN_KEY}" ]]; then
  export P4U_ADMIN_KEY="${ADMIN_KEY}"
fi

mkdir -p "${P4U_STATE_DIR}" "${P4U_REPOSITORY_ROOT}"

bashio::log.info "Starting P4U Spatial ${P4U_APP_VERSION:-0.0.1}"
bashio::log.info "Bridge API listening on port ${P4U_PORT}"
bashio::log.info "Persistent state: ${P4U_STATE_DIR}"
bashio::log.info "Spatial repository: ${P4U_REPOSITORY_ROOT}"

exec node /opt/p4u-spatial/bridge/dist/main.js
