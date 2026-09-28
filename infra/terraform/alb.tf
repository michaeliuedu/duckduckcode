# Application Load Balancer. Everything is served from one hostname: the
# default action goes to the Next.js frontend, and /api/*, /ws/*, /healthz,
# /readyz are routed to the Go backend. Serving both from the same origin means
# the browser opens WebSockets to the page's own host (wss:// under HTTPS), so
# no CORS configuration is needed in production.

resource "aws_lb" "main" {
  name               = "${local.name}-alb"
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  # WebSockets are long-lived; the backend pings every 25s and clients send
  # awareness heartbeats every 15s, so 300s leaves plenty of margin.
  idle_timeout = 300
}

resource "aws_lb_target_group" "frontend" {
  name        = "${local.name}-fe"
  port        = 3000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id

  deregistration_delay = 15

  health_check {
    path                = "/health"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_target_group" "backend" {
  name        = "${local.name}-be"
  port        = 8080
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id

  # Give in-flight WebSockets a moment to move over during deploys.
  deregistration_delay = 30

  health_check {
    path                = "/healthz"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

# --- Listeners -------------------------------------------------------------------

# Plain HTTP: either the only listener (no certificate) or a redirect to HTTPS.
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  dynamic "default_action" {
    for_each = local.https_enabled ? [1] : []
    content {
      type = "redirect"
      redirect {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }

  dynamic "default_action" {
    for_each = local.https_enabled ? [] : [1]
    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.frontend.arn
    }
  }
}

resource "aws_lb_listener" "https" {
  count             = local.https_enabled ? 1 : 0
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = local.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }
}

locals {
  # The listener that carries application traffic.
  app_listener_arn = local.https_enabled ? aws_lb_listener.https[0].arn : aws_lb_listener.http.arn
  backend_paths    = ["/api/*", "/ws/*", "/healthz", "/readyz"]
}

resource "aws_lb_listener_rule" "backend" {
  listener_arn = local.app_listener_arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }

  condition {
    path_pattern {
      values = local.backend_paths
    }
  }
}
