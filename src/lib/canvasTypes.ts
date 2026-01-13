export type Point = [number, number]

export type Rect = {
    x1: number,
    y1: number,
    x2: number,
    y2: number,
}

export interface CanvasElement {
    kind: string,
    boundingBox: Rect,
}

export type StrokeAndFillStyling = {
    strokeWidth: number,
    strokeColor: number,
    fillColor: number,
    stripeWidths: [number, number],
}

export type BrushStroke = CanvasElement & {
    kind: 'brush-stroke',
    points: Point[],
    style: StrokeAndFillStyling,
}
