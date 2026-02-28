import { WebSocket } from "ws";
import type { KittyStateMachine } from "./state-machine.js";

const SLEEP_TIMEOUT = 8 * 60 * 60 * 1000;

export type ActionContext = {
    ws: WebSocket;
    username: string;
    stateMachine: KittyStateMachine;
    broadcastMessage: (message: string) => void;
};

export type ActionHandler = {
    action: string;
    handle: (ctx: ActionContext) => void;
};

export class ActionRegistry {
    private handlers = new Map<string, ActionHandler>();

    register(handler: ActionHandler): void {
        this.handlers.set(handler.action, handler);
    }

    dispatch(action: string, ctx: ActionContext): boolean {
        const handler = this.handlers.get(action);
        if (!handler) return false;
        handler.handle(ctx);
        return true;
    }

    get validActions(): string[] {
        return [...this.handlers.keys()];
    }
}

const pongHandler: ActionHandler = {
    action: "PONG",
    handle(_: any) {
        console.log("handling ping");
    }
}

const petHandler: ActionHandler = {
    action: "PET",
    handle({ stateMachine, broadcastMessage, username }) {
        if (stateMachine.state === "BEING_PET") {
            broadcastMessage("Someone else is petting");
            return;
        }
        stateMachine.transition("BEING_PET", username);
    },
};

const putToSleepHandler: ActionHandler = {
    action: "PUT_TO_SLEEP",
    handle({ stateMachine, broadcastMessage, username }) {
        if (stateMachine.state === "SLEEPING") {
            broadcastMessage("Kitty is already sleeping!");
            return;
        }

        if (stateMachine.state !== "VIBING") {
            broadcastMessage("You should probably pet the kitty before sending him to bed!");
            return;
        }

        if (
            stateMachine.lastTimeSlept &&
            new Date().getTime() - stateMachine.lastTimeSlept.getTime() < SLEEP_TIMEOUT
        ) {
            broadcastMessage("Kitty is not tired, try again later");
            return;
        }

        stateMachine.transition("SLEEPING", username);
    },
};

export function createRegistry(): ActionRegistry {
    const registry = new ActionRegistry();
    registry.register(petHandler);
    registry.register(putToSleepHandler);
    registry.register(pongHandler);
    return registry;
}
