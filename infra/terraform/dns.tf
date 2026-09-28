# Optional HTTPS: either an existing certificate (certificate_arn) or one that
# Terraform requests and validates through Route 53 (domain_name + hosted_zone_id).

locals {
  manage_dns         = var.domain_name != "" && var.hosted_zone_id != ""
  create_certificate = local.manage_dns && var.certificate_arn == ""
  https_enabled      = var.certificate_arn != "" || local.create_certificate
  certificate_arn    = var.certificate_arn != "" ? var.certificate_arn : (local.create_certificate ? aws_acm_certificate_validation.main[0].certificate_arn : "")
  public_url         = local.https_enabled ? "https://${var.domain_name}" : "http://${aws_lb.main.dns_name}"
}

resource "aws_acm_certificate" "main" {
  count             = local.create_certificate ? 1 : 0
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = local.create_certificate ? {
    for dvo in aws_acm_certificate.main[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  zone_id         = var.hosted_zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "main" {
  count                   = local.create_certificate ? 1 : 0
  certificate_arn         = aws_acm_certificate.main[0].arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

resource "aws_route53_record" "app" {
  count   = local.manage_dns ? 1 : 0
  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}
