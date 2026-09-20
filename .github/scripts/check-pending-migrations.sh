#!/usr/bin/env bash
set -uo pipefail

output="$(pnpm --filter @zelo/api exec prisma migrate status 2>&1)"
status=$?

printf '%s\n' "$output" | sed -E 's#(postgres(ql)?://)[^@[:space:]]+@#\1***@#g'

if [ "$status" -ne 0 ]; then
  echo "::error::Refusing to deploy: the production database does not match this release's migrations (pending, failed, or unreachable). Apply them first (docs/releasing.md, step 3), then run the release again."
  exit 1
fi

echo "Production database is up to date with this release's migrations."
