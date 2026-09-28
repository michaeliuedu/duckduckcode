#!/usr/bin/env bash
# Tear down every AWS resource created by infra/terraform.
#
# With the defaults (db_skip_final_snapshot = true, ECR force_delete = true,
# Secrets Manager recovery window 0) this leaves nothing behind. The RDS
# instance and all room data are deleted.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT/infra/terraform"

terraform init -input=false
terraform destroy -input=false "$@"
