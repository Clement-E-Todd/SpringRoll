/**
 * A state-related event used by the State Manager
 *
 * @class StateEvent
 * @constructor
 * @param {String} type The type of event.
 * @param {BaseState} currentState The currentState of the state manager
 * @param {BaseState} visibleState The current state being transitioned or changing visibility,
 *                               default to currentState
 */
export default class StateEvent
{
    constructor(type, currentState, visibleState)
    {
        /**
         * A reference to the current state of the state manager
         *
         * @property {BaseState} currentState
         */
        this.currentState = currentState;

        /**
         * A reference to the state who's actually being transitioned or being changed
         *
         * @property {BaseState} visibleState
         */
        this.visibleState = visibleState === undefined ? currentState : visibleState;

        /** The type of event
         *
         * @property {String} type
         */
        this.type = type;
    }
}

/**
 * When the state besome visible
 *
 * @event {String} onVisible
 */
StateEvent.VISIBLE = "onVisible";

/**
 * When the state becomes hidden
 *
 * @event {String} onHidden
 */
StateEvent.HIDDEN = "onHidden";
