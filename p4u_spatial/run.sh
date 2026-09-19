#!/usr/bin/with-contenv bashio

SOURCE_TITLE="$(bashio::config 'source_title')"
ADMIN_KEY="$(bashio::config 'admin_key')"
REPOSITORY_PROVIDER="$(bashio::config 'repository_provider')"
REPOSITORY_PROFILE="$(bashio::config 'repository_profile')"
RCHKB_ROOT="$(bashio::config 'rchkb_root')"
RCHKB_ALLOW_SPATIAL_WRITES="$(bashio::config 'rchkb_allow_spatial_writes')"
GIT_REMOTE_URL="$(bashio::config 'git_remote_url')"
GIT_BRANCH="$(bashio::config 'git_branch')"
GIT_USERNAME="$(bashio::config 'git_username')"
GIT_TOKEN="$(bashio::config 'git_token')"
FEDERATION_UPSTREAM_URL="$(bashio::config 'federation_upstream_url')"
FEDERATION_TOKEN="$(bashio::config 'federation_token')"
FEDERATION_ROUTE_ID="$(bashio::config 'federation_route_id')"
SCAN_UPLOAD_RETENTION_SECONDS="$(bashio::config 'scan_upload_retention_seconds')"
PAIRING_CLAIM_RATE_LIMIT="$(bashio::config 'pairing_claim_rate_limit')"
SESSION_REFRESH_RATE_LIMIT="$(bashio::config 'session_refresh_rate_limit')"
SCAN_REQUEST_RATE_LIMIT="$(bashio::config 'scan_request_rate_limit')"
FEDERATION_RETRY_BASE_SECONDS="$(bashio::config 'federation_retry_base_seconds')"
FEDERATION_RETRY_MAX_SECONDS="$(bashio::config 'federation_retry_max_seconds')"
FEDERATION_RELAY_RETENTION_SECONDS="$(bashio::config 'federation_relay_retention_seconds')"

export P4U_HOST="0.0.0.0"
export P4U_PORT="8787"
export P4U_STATE_DIR="/data/state"
export P4U_REPOSITORY_ROOT="/data/repository"
export P4U_SPATIAL_ROOT="spatial"
export P4U_SPATIAL_SOURCE_TITLE="${SOURCE_TITLE}"
export P4U_REPOSITORY_PROVIDER="${REPOSITORY_PROVIDER}"
export P4U_REPOSITORY_PROFILE="${REPOSITORY_PROFILE}"
export P4U_GIT_BRANCH="${GIT_BRANCH}"

if [[ "${REPOSITORY_PROFILE}" == "rchkb" ]]; then
  export P4U_RCHKB_ROOT="${RCHKB_ROOT}"
  export P4U_RCHKB_ALLOW_SPATIAL_WRITES="${RCHKB_ALLOW_SPATIAL_WRITES}"
fi

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
export P4U_SCAN_UPLOAD_RETENTION="${SCAN_UPLOAD_RETENTION_SECONDS}"
export P4U_PAIRING_CLAIM_RATE_LIMIT="${PAIRING_CLAIM_RATE_LIMIT}"
export P4U_SESSION_REFRESH_RATE_LIMIT="${SESSION_REFRESH_RATE_LIMIT}"
export P4U_SCAN_REQUEST_RATE_LIMIT="${SCAN_REQUEST_RATE_LIMIT}"
export P4U_FEDERATION_RETRY_BASE="${FEDERATION_RETRY_BASE_SECONDS}"
export P4U_FEDERATION_RETRY_MAX="${FEDERATION_RETRY_MAX_SECONDS}"
export P4U_FEDERATION_RELAY_RETENTION="${FEDERATION_RELAY_RETENTION_SECONDS}"

if [[ -n "${ADMIN_KEY}" ]]; then
  export P4U_ADMIN_KEY="${ADMIN_KEY}"
fi

mkdir -p "${P4U_STATE_DIR}" "${P4U_REPOSITORY_ROOT}"

bashio::log.info "Starting P4U Spatial ${P4U_APP_VERSION:-0.0.1}"
bashio::log.info "Bridge API listening on port ${P4U_PORT}"
bashio::log.info "Persistent state: ${P4U_STATE_DIR}"
bashio::log.info "Spatial repository: ${P4U_REPOSITORY_ROOT} (${P4U_REPOSITORY_PROVIDER}, profile=${REPOSITORY_PROFILE})"
if [[ "${REPOSITORY_PROFILE}" == "rchkb" ]]; then
  bashio::log.info "RCHKB root: ${RCHKB_ROOT}; direct Spatial writes: ${RCHKB_ALLOW_SPATIAL_WRITES}"
fi
if [[ -n "${FEDERATION_UPSTREAM_URL}" ]]; then
  bashio::log.info "Federation upstream configured: ${FEDERATION_UPSTREAM_URL}"
fi

exec node /opt/p4u-spatial/bridge/dist/main.js
