# Managed PostgreSQL in the private subnets. The full connection string is
# stored in Secrets Manager and injected into the backend task as DATABASE_URL.

resource "random_password" "db" {
  length  = 32
  special = false # keeps the URL free of characters that need escaping
}

resource "aws_db_subnet_group" "main" {
  name       = "${local.name}-db"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_instance" "main" {
  identifier     = "${local.name}-postgres"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_allocated_storage * 5
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = "duckduckcode"
  username = "duck"
  password = random_password.db.result
  port     = 5432

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period    = 7
  backup_window              = "07:00-08:00"
  maintenance_window         = "sun:08:30-sun:09:30"
  auto_minor_version_upgrade = true

  performance_insights_enabled = false
  deletion_protection          = false
  skip_final_snapshot          = var.db_skip_final_snapshot
  final_snapshot_identifier    = var.db_skip_final_snapshot ? null : "${local.name}-final-${formatdate("YYYYMMDDhhmm", timestamp())}"
  apply_immediately            = true

  lifecycle {
    ignore_changes = [final_snapshot_identifier]
  }
}

resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${local.name}/database-url"
  description             = "PostgreSQL connection string for the duckduckcode backend"
  recovery_window_in_days = 0 # allow immediate re-creation after destroy
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "postgres://${aws_db_instance.main.username}:${random_password.db.result}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${aws_db_instance.main.db_name}?sslmode=require"
}
