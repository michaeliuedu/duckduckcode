# ECS on Fargate: one backend task and N frontend tasks behind the ALB.
#
# The backend intentionally runs as a SINGLE task. Each backend instance keeps
# an in-memory view of the rooms it serves and orders updates itself; two
# instances would need to coordinate (route every connection of a room to the
# same instance, or relay updates between instances via Postgres LISTEN/NOTIFY
# or Redis). See README "Scaling the backend".

resource "aws_ecs_cluster" "main" {
  name = local.name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${local.name}/backend"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "frontend" {
  name              = "/ecs/${local.name}/frontend"
  retention_in_days = var.log_retention_days
}

# --- Backend ----------------------------------------------------------------------

resource "aws_ecs_task_definition" "backend" {
  family                   = "${local.name}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.backend_cpu
  memory                   = var.backend_memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name      = "backend"
    image     = "${aws_ecr_repository.backend.repository_url}:${var.image_tag}"
    essential = true
    portMappings = [{
      containerPort = 8080
      protocol      = "tcp"
    }]
    environment = [
      { name = "PORT", value = "8080" },
      # Migrations run at container start; golang-migrate takes an advisory
      # lock so this stays safe even if a deploy briefly overlaps.
      { name = "MIGRATE_ON_START", value = "true" },
      { name = "LOG_FORMAT", value = "json" },
      { name = "LOG_LEVEL", value = "info" },
      { name = "SNAPSHOT_EVERY", value = tostring(var.snapshot_every) },
      # Same-origin deployment: no CORS origins needed.
      { name = "CORS_ALLOWED_ORIGINS", value = "" },
    ]
    secrets = [{
      name      = "DATABASE_URL"
      valueFrom = aws_secretsmanager_secret.database_url.arn
    }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.backend.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }
    stopTimeout = 30
  }])
}

resource "aws_ecs_service" "backend" {
  name            = "${local.name}-backend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  # Never run two backend tasks at once (see header comment): stop the old
  # task before starting the new one. This costs a few seconds of downtime per
  # deploy; clients reconnect automatically.
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100
  health_check_grace_period_seconds  = 60
  enable_execute_command             = true

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 8080
  }

  depends_on = [aws_lb_listener_rule.backend, aws_secretsmanager_secret_version.database_url]
}

# --- Frontend ---------------------------------------------------------------------

resource "aws_ecs_task_definition" "frontend" {
  family                   = "${local.name}-frontend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.frontend_cpu
  memory                   = var.frontend_memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name      = "frontend"
    image     = "${aws_ecr_repository.frontend.repository_url}:${var.image_tag}"
    essential = true
    portMappings = [{
      containerPort = 3000
      protocol      = "tcp"
    }]
    environment = [
      # The port nginx listens on inside the container.
      { name = "PORT", value = "3000" },
      # Written into /runtime-config.js when the container starts, so the same
      # image serves every environment. Empty = the browser talks to the backend
      # on the page's own origin, and the ALB routes /api and /ws to it.
      { name = "BACKEND_PUBLIC_URL", value = "" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.frontend.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])
}

resource "aws_ecs_service" "frontend" {
  name            = "${local.name}-frontend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.frontend.arn
  desired_count   = var.frontend_desired_count
  launch_type     = "FARGATE"

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = 60
  enable_execute_command             = true

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.frontend.arn
    container_name   = "frontend"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.http]
}
