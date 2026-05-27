import type { Plugin } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";

export default function wsDevPlugin(): Plugin {
  let wss: WebSocketServer | null = null;
  let wsHandler: any = null;

  return {
    name: "ws-dev-server",
    configureServer(server) {
      // Create a WS server attached to the Vite dev server
      wss = new WebSocketServer({ noServer: true });

      server.httpServer?.on("upgrade", async (request: IncomingMessage, socket, head) => {
        if (request.url === "/ws") {
          wss!.handleUpgrade(request, socket, head, (ws) => {
            wss!.emit("connection", ws, request);
          });
        }
      });

      wss.on("connection", async (ws: WebSocket, request: IncomingMessage) => {
        try {
          // Hot-reload the handler each time
          const mod = await server.ssrLoadModule("/src/api/ws-handler.ts");
          wsHandler = mod;

          const ip = request.headers["x-forwarded-for"] as string || request.socket.remoteAddress || "127.0.0.1";

          // Create a wrapper that mimics Bun's ws interface
          const wsWrapper = createWsWrapper(ws);

          mod.handleConnection(wsWrapper, ip);

          ws.on("message", async (data: Buffer) => {
            try {
              const freshMod = await server.ssrLoadModule("/src/api/ws-handler.ts");
              freshMod.handleMessage(wsWrapper, data.toString());
            } catch (err) {
              console.error("[ws-dev] message error:", err);
            }
          });

          ws.on("close", async () => {
            try {
              const freshMod = await server.ssrLoadModule("/src/api/ws-handler.ts");
              freshMod.handleDisconnect(wsWrapper);
            } catch (err) {
              console.error("[ws-dev] close error:", err);
            }
          });
        } catch (err) {
          console.error("[ws-dev] connection error:", err);
          ws.close();
        }
      });
    },
  };
}

function createWsWrapper(ws: WebSocket) {
  return {
    send(data: string) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    },
    close() {
      ws.close();
    },
    _raw: ws,
  };
}
