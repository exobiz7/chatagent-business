#!/bin/zsh
set -euo pipefail
SCRIPT_DIR="${0:A:h}"
REPO_ROOT="${SCRIPT_DIR:h}"
CONFIG="${CHATAGENT_BUSINESS_OPERATOR_CONFIG:-${HOME}/ChatAgentBusiness/operator.json}"
NODE="${CHATAGENT_BUSINESS_OPS_NODE:-}"
if [[ -z "${NODE}" && -f "${CONFIG}" ]]; then
  NODE="$(/usr/bin/plutil -extract nodeBinary raw -o - "${CONFIG}" 2>/dev/null || true)"
fi
if [[ -z "${NODE}" ]]; then
  NODE="$(command -v node || true)"
fi
if [[ -z "${NODE}" || ! -x "${NODE}" ]]; then
  print -u2 -- '{"success":false,"code":"OPS_NODE_NOT_FOUND"}'
  exit 1
fi
export CHATAGENT_BUSINESS_OPERATOR_CONFIG="${CONFIG}"
SCHEMA="$(/usr/bin/plutil -extract schemaVersion raw -o - "${CONFIG}" 2>/dev/null || print -- 1)"
if [[ "${SCHEMA}" == "2" ]]; then
  exec "${NODE}" "${REPO_ROOT}/scripts/business/v1.1/ops/business-v11-ops-cli.mjs" restore "$@"
fi
exec "${NODE}" "${REPO_ROOT}/scripts/business/business-ops.mjs" restore "$@"
