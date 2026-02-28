export type State = "VIBING" | "BEING_PET" | "DYING" | "DEAD" | "SLEEPING";

type TransitionEntry = {
    autoTransition?: { to: State; delay: number; silent?: boolean };
};

type TransitionTable = Record<State, TransitionEntry>;

export type TransitionCallback = (state: State, username: string) => void;

const ONE_SECOND = 1_000;
const ONE_MINUTE = ONE_SECOND * 60;
const ONE_HOUR = ONE_MINUTE * 60;

const TRANSITION_TABLE: TransitionTable = {
    VIBING: {
        autoTransition: { to: "DYING", delay: 4 * ONE_HOUR },
    },
    BEING_PET: {
        autoTransition: { to: "VIBING", delay: 6_000 },
    },
    DYING: {
        autoTransition: { to: "DEAD", delay: 4 * ONE_HOUR },
    },
    DEAD: {},
    SLEEPING: {
        autoTransition: { to: "VIBING", delay: 8 * ONE_HOUR },
    },
};

export class KittyStateMachine {
    private _state: State = "VIBING";
    private _activeTimeout: NodeJS.Timeout | undefined;
    private _onTransition: TransitionCallback;

    lastFiveEvents: { state: string; username: string }[] = [];
    lastTimeSlept: Date | undefined;

    constructor(onTransition: TransitionCallback) {
        this._onTransition = onTransition;
        this.scheduleAutoTransition();
    }

    get state(): State {
        return this._state;
    }

    transition(to: State, username: string): boolean {
        if (this._activeTimeout !== undefined) {
            clearTimeout(this._activeTimeout);
            this._activeTimeout = undefined;
        }

        this._state = to;

        if (to === "SLEEPING") {
            this.lastTimeSlept = new Date();
        }

        this.recordEvent(to, username);

        const entry = TRANSITION_TABLE[to];
        const silent = entry.autoTransition?.silent ?? false;

        if (!silent) {
            this._onTransition(to, username);
        }

        this.scheduleAutoTransition();

        return true;
    }

    dispose(): void {
        if (this._activeTimeout !== undefined) {
            clearTimeout(this._activeTimeout);
            this._activeTimeout = undefined;
        }
    }

    private recordEvent(state: State, username: string): void {
        this.lastFiveEvents = [...this.lastFiveEvents, { state, username }].slice(-5);
    }

    private scheduleAutoTransition(): void {
        const entry = TRANSITION_TABLE[this._state];
        if (!entry.autoTransition) return;

        const { to, delay } = entry.autoTransition;
        this._activeTimeout = setTimeout(() => {
            this.transition(to, "SYSTEM");
        }, delay);
    }
}
