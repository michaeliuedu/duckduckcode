#!/usr/bin/env bash
# Build both images, push them to ECR and roll out the ECS services.
#
# Prerequisites: aws CLI (authenticated), docker, terraform >= 1.6.
# Usage:  infra/scripts/deploy.sh [image-tag]
#   image-tag defaults to the short git SHA (or a timestamp outside git).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TF_DIR="$ROOT/infra/terraform"
TAG="${1:-$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"

cd "$TF_DIR"
terraform init -input=false

# 1. Make sure the ECR repositories exist before we try to push.
terraform apply -input=false -auto-approve \
  -target=aws_ecr_repository.backend \
  -target=aws_ecr_repository.frontend

REGION="$(terraform output -raw aws_region)"
BACKEND_REPO="$(terraform output -raw ecr_backend_repository_url)"
FRONTEND_REPO="$(terraform output -raw ecr_frontend_repository_url)"
REGISTRY="${BACKEND_REPO%%/*}"

# 2. Log in and push. Fargate runs X86_64, so build for linux/amd64 explicitly.
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"

echo ">> building backend:$TAG"
docker build --platform linux/amd64 --build-arg VERSION="$TAG" -t "$BACKEND_REPO:$TAG" -t "$BACKEND_REPO:latest" "$ROOT/backend"
echo ">> building frontend:$TAG"
docker build --platform linux/amd64 -t "$FRONTEND_REPO:$TAG" -t "$FRONTEND_REPO:latest" "$ROOT/frontend"

docker push "$BACKEND_REPO:$TAG";  docker push "$BACKEND_REPO:latest"
docker push "$FRONTEND_REPO:$TAG"; docker push "$FRONTEND_REPO:latest"

# 3. Apply everything with the new image tag. Changing the tag creates new task
#    definition revisions, which makes ECS roll the services.
terraform apply -input=false -auto-approve -var "image_tag=$TAG"

CLUSTER="$(terraform output -raw ecs_cluster_name)"
BACKEND_SVC="$(terraform output -raw ecs_backend_service_name)"
FRONTEND_SVC="$(terraform output -raw ecs_frontend_service_name)"

echo ">> waiting for services to stabilise (this can take a few minutes on first deploy)"
aws ecs wait services-stable --region "$REGION" --cluster "$CLUSTER" --services "$BACKEND_SVC" "$FRONTEND_SVC"

URL="$(terraform output -raw app_url)"
echo
echo "Deployed image tag $TAG"
echo "App URL:   $URL"
echo "Health:    $URL/healthz   (backend)   $URL/health (frontend)"
echo "Readiness: $URL/readyz"
if [ "$(terraform output -raw https_enabled)" != "true" ]; then
  echo
  echo "NOTE: running over plain HTTP/WS. Set domain_name + hosted_zone_id (or certificate_arn) in terraform.tfvars for HTTPS/WSS."
fi
