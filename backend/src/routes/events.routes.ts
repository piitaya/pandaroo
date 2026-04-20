import type { FastifyPluginAsync } from "fastify";
import type { AppEventBus } from "../events.js";

export interface EventsRouteDeps {
  bus: AppEventBus;
}

const HEARTBEAT_INTERVAL_MS = 20_000;

export const eventsRoutes: FastifyPluginAsync<EventsRouteDeps> = async (app, { bus }) => {
  app.get("/api/events", {
    schema: {
      operationId: "streamEvents",
      tags: ["Events"],
      description: "Server-Sent Events stream of state-change notifications.",
    },
  }, async (req, reply) => {
    reply.hijack();
    const raw = reply.raw;

    raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: unknown) => {
      raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    send("connected", {});

    const onPrintersChanged = () => send("printers-changed", {});
    const onSpoolUpdated = (tagId: string) => send("spools-changed", { tag_id: tagId });
    const onConfigChanged = () => send("config-changed", {});

    bus.on("printer:status-changed", onPrintersChanged);
    bus.on("spool:detected", onPrintersChanged);
    bus.on("spool:slot-exited", onPrintersChanged);
    bus.on("spool:updated", onSpoolUpdated);
    bus.on("config:changed", onConfigChanged);

    // Heartbeat comment to keep idle-closing proxies at bay.
    const heartbeat = setInterval(() => raw.write(": ping\n\n"), HEARTBEAT_INTERVAL_MS);

    let disposed = false;
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      clearInterval(heartbeat);
      bus.off("printer:status-changed", onPrintersChanged);
      bus.off("spool:detected", onPrintersChanged);
      bus.off("spool:slot-exited", onPrintersChanged);
      bus.off("spool:updated", onSpoolUpdated);
      bus.off("config:changed", onConfigChanged);
    };

    req.raw.on("close", cleanup);
    req.raw.on("error", cleanup);
  });
};
