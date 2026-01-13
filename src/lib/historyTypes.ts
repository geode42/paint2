import type { CanvasElement } from "./canvasTypes"

export interface Action {
    kind: string,
    timestamp: number,
    selectionAfterAction: CanvasElement[],
}

export type CreateElementsAction = Action & {
    kind: 'create-elements',
    elements: CanvasElement[],
}

export type DeleteElementsAction = Action & {
    kind: 'delete-elements',
    elements: CanvasElement[],
}

export type SelectionChangeAction = Action & {
    kind: 'selection-change',
}
