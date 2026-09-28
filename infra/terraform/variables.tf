variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Name prefix for all resources."
  type        = string
  default     = "duckduckcode"
}

variable "environment" {
  description = "Environment label (dev, staging, prod)."
  type        = string
  default     = "dev"
}

variable "image_tag" {
  description = "Tag of the backend/frontend images in ECR to deploy (set by the deploy script)."
  type        = string
  default     = "latest"
}

# --- HTTPS / domain -----------------------------------------------------------
#
# Three supported configurations:
#   1. No domain (quick test): leave domain_name, hosted_zone_id and
#      certificate_arn empty. The app is served over plain HTTP/WS on the ALB
#      DNS name. Browsers allow ws:// from an http:// page, so this works, but
#      it is not encrypted.
#   2. Domain in a Route 53 hosted zone you control: set domain_name and
#      hosted_zone_id. Terraform requests an ACM certificate, validates it via
#      DNS and creates the alias record. Fully automatic HTTPS/WSS.
#   3. Domain hosted elsewhere: request/validate an ACM certificate manually in
#      the same region, set certificate_arn and domain_name, then point a
#      CNAME at the alb_dns_name output.

variable "domain_name" {
  description = "Public hostname for the app (e.g. code.example.edu). Empty = use the ALB DNS name over HTTP."
  type        = string
  default     = ""
}

variable "hosted_zone_id" {
  description = "Route 53 hosted zone ID for domain_name. When set (with domain_name), an ACM certificate and DNS records are created automatically."
  type        = string
  default     = ""
}

variable "certificate_arn" {
  description = "ARN of an existing ACM certificate (same region) for domain_name. Leave empty to have Terraform create one via Route 53."
  type        = string
  default     = ""
}

# --- Sizing ---------------------------------------------------------------------

variable "backend_cpu" {
  type    = number
  default = 256
}

variable "backend_memory" {
  type    = number
  default = 512
}

variable "frontend_cpu" {
  type    = number
  default = 256
}

variable "frontend_memory" {
  type    = number
  default = 512
}

variable "frontend_desired_count" {
  description = "Frontend is stateless and can scale horizontally."
  type        = number
  default     = 1
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_allocated_storage" {
  type    = number
  default = 20
}

variable "db_skip_final_snapshot" {
  description = "Skip the final RDS snapshot on destroy (true for dev so `terraform destroy` is clean)."
  type        = bool
  default     = true
}

variable "log_retention_days" {
  type    = number
  default = 14
}

variable "snapshot_every" {
  description = "Backend compaction threshold (updates per room before a snapshot is requested)."
  type        = number
  default     = 200
}
