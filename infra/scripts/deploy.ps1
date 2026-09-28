# PowerShell equivalent of deploy.sh for Windows hosts.
# Prerequisites: aws CLI (authenticated), docker, terraform >= 1.6.
# Usage:  .\infra\scripts\deploy.ps1 [-Tag <image-tag>]
param(
  [string]$Tag = ""
)
$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$TfDir = Join-Path $Root "infra\terraform"
if (-not $Tag) {
  try { $Tag = (git -C $Root rev-parse --short HEAD).Trim() } catch { $Tag = Get-Date -Format "yyyyMMddHHmmss" }
}

Push-Location $TfDir
try {
  terraform init -input=false
  if ($LASTEXITCODE) { throw "terraform init failed" }

  # 1. ECR repositories first so the push has somewhere to go.
  terraform apply -input=false -auto-approve -target=aws_ecr_repository.backend -target=aws_ecr_repository.frontend
  if ($LASTEXITCODE) { throw "terraform apply (ecr) failed" }

  $Region = (terraform output -raw aws_region).Trim()
  $BackendRepo = (terraform output -raw ecr_backend_repository_url).Trim()
  $FrontendRepo = (terraform output -raw ecr_frontend_repository_url).Trim()
  $Registry = $BackendRepo.Split("/")[0]

  # 2. Build for linux/amd64 (Fargate X86_64) and push.
  aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin $Registry
  if ($LASTEXITCODE) { throw "docker login failed" }

  Write-Host ">> building backend:$Tag"
  docker build --platform linux/amd64 --build-arg VERSION=$Tag -t "$BackendRepo`:$Tag" -t "$BackendRepo`:latest" (Join-Path $Root "backend")
  if ($LASTEXITCODE) { throw "backend build failed" }
  Write-Host ">> building frontend:$Tag"
  docker build --platform linux/amd64 -t "$FrontendRepo`:$Tag" -t "$FrontendRepo`:latest" (Join-Path $Root "frontend")
  if ($LASTEXITCODE) { throw "frontend build failed" }

  foreach ($img in @("$BackendRepo`:$Tag", "$BackendRepo`:latest", "$FrontendRepo`:$Tag", "$FrontendRepo`:latest")) {
    docker push $img
    if ($LASTEXITCODE) { throw "push failed: $img" }
  }

  # 3. Full apply with the new tag rolls the ECS services.
  terraform apply -input=false -auto-approve -var "image_tag=$Tag"
  if ($LASTEXITCODE) { throw "terraform apply failed" }

  $Cluster = (terraform output -raw ecs_cluster_name).Trim()
  $BackendSvc = (terraform output -raw ecs_backend_service_name).Trim()
  $FrontendSvc = (terraform output -raw ecs_frontend_service_name).Trim()
  Write-Host ">> waiting for services to stabilise"
  aws ecs wait services-stable --region $Region --cluster $Cluster --services $BackendSvc $FrontendSvc

  $Url = (terraform output -raw app_url).Trim()
  Write-Host ""
  Write-Host "Deployed image tag $Tag"
  Write-Host "App URL:   $Url"
  Write-Host "Health:    $Url/healthz (backend)   $Url/health (frontend)"
  if ((terraform output -raw https_enabled).Trim() -ne "true") {
    Write-Host ""
    Write-Host "NOTE: running over plain HTTP/WS. Set domain_name + hosted_zone_id (or certificate_arn) in terraform.tfvars for HTTPS/WSS."
  }
}
finally {
  Pop-Location
}
