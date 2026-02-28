import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { KittyStateMachine, type State } from "./state-machine.js";
import { createRegistry, type ActionContext } from "./actions.js";

const PORT = 8080;
const PATH_PREFIX = "/kitty-game-server";

const server = createServer((_req, res) => {
    res.writeHead(404);
    res.end();
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
    const pathname = new URL(req.url ?? "", `http://${req.headers.host}`).pathname;

    if (pathname === PATH_PREFIX || pathname === `${PATH_PREFIX}/`) {
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit("connection", ws, req);
        });
    } else {
        socket.destroy();
    }
});

// --- Broadcasting ---

function broadcastState(state: State, username: string) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "STATE_CHANGE", state, username }));
        }
    });
}

function broadcastMessage(message: string) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "MESSAGE", message }));
        }
    });
}

// --- State machine & action registry ---

const stateMachine = new KittyStateMachine(broadcastState);
const registry = createRegistry();

// --- Input validation ---

function parseMessage(data: unknown): { action: string; username: string } | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(String(data));
    } catch {
        return null;
    }

    if (typeof parsed !== "object" || parsed === null) return null;

    const obj = parsed as Record<string, unknown>;

    if (typeof obj.action !== "string" || !registry.validActions.includes(obj.action)) return null;
    if (typeof obj.username !== "string" || obj.username.length === 0) return null;

    return { action: obj.action, username: obj.username };
}

// --- WebSocket connection handler ---

wss.on("connection", (ws: WebSocket) => {
    console.log("Client connected");
    
    const pingInterval = setInterval(() => {
        ws.send(JSON.stringify({ type: "PING" }));
    }, 10_000);

    ws.send(JSON.stringify({
        type: "STATE_INIT",
        state: stateMachine.state,
        events: stateMachine.lastFiveEvents,
    }));

    ws.on("message", (data) => {
        const message = parseMessage(data);
        if (message === null) {
            ws.send(JSON.stringify({ type: "ERROR", message: "Invalid message format" }));
            return;
        }

        console.log(`PARSED data: ${JSON.stringify(message, null, 2)}`);

        const ctx: ActionContext = {
            ws,
            username: message.username,
            stateMachine,
            broadcastMessage,
        };

        registry.dispatch(message.action, ctx);
    });

    ws.on("close", () => {
        clearInterval(pingInterval);
        console.log("Client disconnected");
    });
    


});

// --- Start ---

server.listen(PORT, () => {
    console.log(`WebSocket server running on ws://localhost:${PORT}${PATH_PREFIX}/`);
});
