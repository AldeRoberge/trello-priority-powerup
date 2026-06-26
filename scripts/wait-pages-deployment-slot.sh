#!/usr/bin/env bash
# Poll GitHub Pages deployments until none are queued or in_progress.
# Tolerates API errors and unexpected JSON so the deploy step can still run.
set -euo pipefail

: "${GITHUB_TOKEN:?GITHUB_TOKEN is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"

api="https://api.github.com/repos/${GITHUB_REPOSITORY}/pages/deployments"
max_attempts="${PAGES_SLOT_WAIT_ATTEMPTS:-12}"
sleep_seconds="${PAGES_SLOT_WAIT_SECONDS:-30}"

# jq filter: only count in-flight items when the body is a deployment array.
# Error objects like {"message":"Not Found",...} yield 0 instead of failing.
JQ_IN_FLIGHT='if type == "array" then
  [ .[] | select(type == "object" and (.status == "queued" or .status == "in_progress")) ] | length
else
  0
end'

in_flight_count() {
  local raw http_code body count

  raw="$(
    curl -sS -w $'\n%{http_code}' \
      -H "Authorization: Bearer ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "${api}?per_page=10"
  )"
  http_code="${raw##*$'\n'}"
  body="${raw%$'\n'*}"

  if [[ -z "${body//[[:space:]]/}" ]]; then
    echo "Pages deployments API returned an empty body (HTTP ${http_code}); assuming slot is free." >&2
    echo "0"
    return 0
  fi

  if [[ "${http_code}" -ge 400 ]]; then
    local message
    message="$(printf '%s' "${body}" | jq -r 'if type == "object" then .message // empty else empty end' 2>/dev/null || true)"
    if [[ -n "${message}" ]]; then
      echo "Pages deployments API HTTP ${http_code}: ${message}; assuming slot is free." >&2
    else
      echo "Pages deployments API HTTP ${http_code}; assuming slot is free." >&2
    fi
    echo "0"
    return 0
  fi

  if ! count="$(printf '%s' "${body}" | jq -r "${JQ_IN_FLIGHT}" 2>/dev/null)"; then
    echo "Could not parse Pages deployments response; assuming slot is free." >&2
    echo "0"
    return 0
  fi

  if [[ -z "${count}" || "${count}" == "null" ]]; then
    echo "Unexpected Pages deployments response shape; assuming slot is free." >&2
    echo "0"
    return 0
  fi

  echo "${count}"
}

for attempt in $(seq 1 "${max_attempts}"); do
  busy="$(in_flight_count)"
  if [[ "${busy}" == "0" ]]; then
    echo "No in-flight Pages deployments."
    exit 0
  fi
  echo "In-flight Pages deployment(s): ${busy} (attempt ${attempt}/${max_attempts}), waiting ${sleep_seconds}s..."
  sleep "${sleep_seconds}"
done

echo "Timed out waiting for Pages deployment slot (${max_attempts} attempts); proceeding with deploy."
exit 0
