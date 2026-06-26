#!/usr/bin/env bash
# Poll GitHub Pages deployments until none are queued or in_progress.
set -euo pipefail

: "${GITHUB_TOKEN:?GITHUB_TOKEN is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"

api="https://api.github.com/repos/${GITHUB_REPOSITORY}/pages/deployments"
max_attempts="${PAGES_SLOT_WAIT_ATTEMPTS:-12}"
sleep_seconds="${PAGES_SLOT_WAIT_SECONDS:-30}"

in_flight_count() {
  curl -sS -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "${api}?per_page=10" \
    | jq '[.[] | select(.status == "queued" or .status == "in_progress")] | length'
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

echo "Timed out waiting for Pages deployment slot (${max_attempts} attempts)."
exit 1