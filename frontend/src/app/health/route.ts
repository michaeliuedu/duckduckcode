// Liveness endpoint for the frontend container (ALB target group health check).
export function GET() {
  return Response.json({ status: "ok", service: "frontend" });
}
