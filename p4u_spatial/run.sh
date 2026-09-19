#!/usr/bin/with-contenv bashio

SOURCE_TITLE="$(bashio::config 'source_title')"
ADMIN_KEY="$(bashio::config 'admin_key')"
REPOSITORY_PROVIDER="$(bashio::config 'repository_provider')"
GIT_REMOTE_URL="$(bashio::config 'git_remote_url')"
GIT_BRANCH="$(bashio::config 'git_branch')"
GIT_USERNAME="$(bashio::config 'git_username')"
GIT_TOKEN="$(bashio::config 'git_token')"
FEDERATION_UPSTREAM_URL="$(bashio::config 'federation_upstream_url')"
FEDERATION_TOKEN="$(bashio::config 'federation_token')"
FEDERATION_ROUTE_ID="$(bashio::config 'federation_route_id')"

export P4U_HOST="0.0.0.0"
export P4U_PORT="8787"
export P4U_STATE_DIR="/data/state"
export P4U_REPOSITORY_ROOT="/data/repository"
export P4U_SPATIAL_ROOT="spatial"
export P4U_SPATIAL_SOURCE_TITLE="${SOURCE_TITLE}"
export P4U_REPOSITORY_PROVIDER="${REPOSITORY_PROVIDER}"
export P4U_GIT_BRANCH="${GIT_BRANCH}"

if [[ -n "${GIT_REMOTE_URL}" ]]; then
  export P4U_GIT_REMOTE_URL="${GIT_REMOTE_URL}"
fi
if [[ -n "${GIT_USERNAME}" ]]; then
  export P4U_GIT_USERNAME="${GIT_USERNAME}"
fi
if [[ -n "${GIT_TOKEN}" ]]; then
  export P4U_GIT_TOKEN="${GIT_TOKEN}"
fi
if [[ -n "${FEDERATION_UPSTREAM_URL}" ]]; then
  export P4U_FEDERATION_UPSTREAM_URL="${FEDERATION_UPSTREAM_URL}"
fi
if [[ -n "${FEDERATION_TOKEN}" ]]; then
  export P4U_FEDERATION_TOKEN="${FEDERATION_TOKEN}"
fi
export P4U_FEDERATION_ROUTE_ID="${FEDERATION_ROUTE_ID}"

if [[ -n "${ADMIN_KEY}" ]]; then
  export P4U_ADMIN_KEY="${ADMIN_KEY}"
fi

mkdir -p "${P4U_STATE_DIR}" "${P4U_REPOSITORY_ROOT}"

bashio::log.info "Starting P4U Spatial ${P4U_APP_VERSION:-0.0.1}"
bashio::log.info "Bridge API listening on port ${P4U_PORT}"
bashio::log.info "Persistent state: ${P4U_STATE_DIR}"
bashio::log.info "Spatial repository: ${P4U_REPOSITORY_ROOT} (${P4U_REPOSITORY_PROVIDER})"
if [[ -n "${FEDERATION_UPSTREAM_URL}" ]]; then
  bashio::log.info "Federation upstream configured: ${FEDERATION_UPSTREAM_URL}"
fi

exec node /opt/p4u-spatial/bridge/dist/main.js
