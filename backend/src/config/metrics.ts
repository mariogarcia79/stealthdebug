import http from "http";
import { Registry, Counter, Gauge, collectDefaultMetrics } from "prom-client";
import ChangeRequestModel from "../models/ChangeRequest";

// Prometheus metrics for agents. Served on their own port (METRICS_PORT),
// never through the public /api: only the monitoring network reaches it.
export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: "backend_" });

export const agentToolCalls = new Counter({
  name: "agent_tool_calls_total",
  help: "Agent API calls (MCP tool calls) by tool and outcome",
  labelNames: ["tool", "outcome"] as const,
  registers: [registry],
});

export const agentToolErrors = new Counter({
  name: "agent_tool_errors_total",
  help: "Agent API calls that failed (4xx/5xx), by tool",
  labelNames: ["tool"] as const,
  registers: [registry],
});

new Gauge({
  name: "change_requests_active",
  help: "Change requests waiting for review or for the agent, by status",
  labelNames: ["status"] as const,
  registers: [registry],
  async collect() {
    this.reset();
    const rows = await ChangeRequestModel.aggregate<{ _id: string; n: number }>([
      { $match: { status: { $in: ["open", "outdated", "declined"] } } },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ]);
    for (const s of ["open", "outdated", "declined"]) this.set({ status: s }, rows.find((r) => r._id === s)?.n ?? 0);
  },
});

export function startMetricsServer(port: number): http.Server {
  return http.createServer(async (req, res) => {
    if (req.url !== "/metrics") { res.writeHead(404).end(); return; }
    try {
      res.writeHead(200, { "Content-Type": registry.contentType }).end(await registry.metrics());
    } catch (err) {
      console.error("metrics:", err);
      res.writeHead(500).end();
    }
  }).listen(port, () => console.log(`Metrics on :${port}/metrics`));
}
