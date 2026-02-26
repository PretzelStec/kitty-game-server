import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";

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

// --- State ---

type State = "VIBING" | "BEING_PET" | "DYING" | "DEAD" | "SLEEPING";
let STATE: State = "VIBING";
let LAST_TIME_SLEPT: Date | undefined = undefined;
let LAST_FIVE_EVENTS: { state: string; username: string }[] = [];

const ONE_HOUR = 1_000 * 60 * 60;
const SLEEP_TIMEOUT = 8 * ONE_HOUR;
const VIBING_TIMEOUT = 4 * ONE_HOUR;
const DYING_TIMEOUT = 4 * ONE_HOUR;

let vibing_timeout: NodeJS.Timeout | undefined;
let dying_timeout: NodeJS.Timeout | undefined;
let sleeping_timeout: NodeJS.Timeout | undefined;

// --- State transitions ---

function transitionToVibing() {
    STATE = "VIBING";
    if (dying_timeout !== undefined) {
        clearTimeout(dying_timeout);
        dying_timeout = undefined;
    }
    if (sleeping_timeout !== undefined) {
        clearTimeout(sleeping_timeout);
        sleeping_timeout = undefined;
    }
    vibing_timeout = setTimeout(() => {
        STATE = "DYING";
        dying_timeout = createDyingTimeout();
        broadcastState(STATE);
    }, VIBING_TIMEOUT);
}

function createDyingTimeout() {
    return setTimeout(() => {
        STATE = "DEAD";
        if (vibing_timeout !== undefined) {
            clearTimeout(vibing_timeout);
            vibing_timeout = undefined;
        }
        broadcastState(STATE);
    }, DYING_TIMEOUT);
}

function createSleepingTimeout() {
    if (vibing_timeout !== undefined) {
        clearTimeout(vibing_timeout);
        vibing_timeout = undefined;
    }
    sleeping_timeout = setTimeout(() => {
        transitionToVibing();
        broadcastState(STATE);
    }, SLEEP_TIMEOUT);
}

// --- Broadcasting ---

function broadcastState(state: State, username: string = "SYSTEM") {
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
    })
}

// --- User action handlers ---

async function handlePet(ws: WebSocket, username: string) {
    if (STATE === "BEING_PET") {
        ws.send("Someone else is petting");
        return;
    }

    const newEvents = [...LAST_FIVE_EVENTS, { state: "BEING_PET", username }];
    LAST_FIVE_EVENTS = newEvents.length > 5 ? newEvents.slice(-5) : newEvents;
    broadcastState("BEING_PET", username);
    transitionToVibing();
}

async function handlePutToSleep(ws: WebSocket, username: string) {
    if (STATE === "SLEEPING") {
        broadcastMessage("Someone else is petting");
        return;
    }

    if (STATE !== "VIBING") {
        broadcastMessage("You should probably pet the kitty before sending him to bed!");
        return;
    }

    if (LAST_TIME_SLEPT && (new Date().getTime() - LAST_TIME_SLEPT.getTime()) < SLEEP_TIMEOUT) {
        broadcastMessage("Kitty is not tired, try again later");
        return;
    }
    const newEvents = [...LAST_FIVE_EVENTS, { state: "SLEEPING" , username }];
    LAST_FIVE_EVENTS = newEvents.length > 5 ? newEvents.slice(-5) : newEvents;
    LAST_TIME_SLEPT = new Date();
    broadcastState("SLEEPING", username);
    createSleepingTimeout();
}

// --- WebSocket connection handler ---

wss.on("connection", (ws: WebSocket) => {
    console.log("Client connected");
    ws.send(JSON.stringify({ type: "STATE_INIT", state: STATE, events: LAST_FIVE_EVENTS }));

    ws.on("message", async (data: any) => {
        const parsedData = JSON.parse(data);
        console.log(`PARSED data: ${JSON.stringify(parsedData, null, 2)}`);

        const { action, username } = parsedData;

        switch (action) {
            case "PET":
                return handlePet(ws, username);
            case "PUT_TO_SLEEP":
                return handlePutToSleep(ws, username);
        }
    });

    ws.on("close", () => {
        console.log("Client disconnected");
    });
});

// --- Start ---

transitionToVibing();

server.listen(PORT, () => {
    console.log(`WebSocket server running on ws://localhost:${PORT}${PATH_PREFIX}/`);
});
