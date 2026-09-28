output "aws_region" {
  value = var.aws_region
}

output "app_url" {
  description = "Where the app is reachable."
  value       = local.public_url
}

output "alb_dns_name" {
  description = "ALB hostname (point a CNAME here if your DNS is outside Route 53)."
  value       = aws_lb.main.dns_name
}

output "https_enabled" {
  value = local.https_enabled
}

output "ecr_backend_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "ecr_frontend_repository_url" {
  value = aws_ecr_repository.frontend.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecs_backend_service_name" {
  value = aws_ecs_service.backend.name
}

output "ecs_frontend_service_name" {
  value = aws_ecs_service.frontend.name
}

output "backend_log_group" {
  value = aws_cloudwatch_log_group.backend.name
}

output "frontend_log_group" {
  value = aws_cloudwatch_log_group.frontend.name
}

output "rds_endpoint" {
  value = aws_db_instance.main.address
}

output "database_url_secret_arn" {
  description = "Secrets Manager secret holding DATABASE_URL."
  value       = aws_secretsmanager_secret.database_url.arn
}
