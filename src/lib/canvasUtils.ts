import type { Point, Rect } from "./canvasTypes";

export function boundingBoxFromPoints(points: [number, number][]): Rect {
    if (points.length == 0) return { x1: 0, y1: 0, x2: 0, y2: 0 }
    const rect = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity }
    for (const point of points) {
        if (point[0] < rect.x1) rect.x1 = point[0]
        if (point[1] < rect.y1) rect.y1 = point[1]
        if (point[0] > rect.x2) rect.x2 = point[0]
        if (point[1] > rect.y2) rect.y2 = point[1]
    }
    return rect
}

export function expandRect(rect: Rect, amount: number): Rect {
    // add amount in the direction of this point from the other point
    return {
        x1: rect.x1 + amount * Math.sign(rect.x1 - rect.x2),
        y1: rect.y1 + amount * Math.sign(rect.y1 - rect.y2),
        x2: rect.x2 + amount * Math.sign(rect.x2 - rect.x1),
        y2: rect.y2 + amount * Math.sign(rect.y2 - rect.y1),
    }
}

export function rectContainsPoint(rect: Rect, point: Point) {
    // directions from the point to the two outer points should be opposite, so multiplying them should return negative number
    return ((rect.x1 - point[0]) * (rect.x2 - point[0]) < 0) && ((rect.y1 - point[1]) * (rect.y2 - point[1]) < 0)
}

export function rectContainsRect(bigRect: Rect, smallRect: Rect) {
    return rectContainsPoint(bigRect, [smallRect.x1, smallRect.y1]) && rectContainsPoint(bigRect, [smallRect.x2, smallRect.y2])
}

/** Returns true if arrays are the same length and every element present in `array1` is present in `array2` */
export function arraysContainSameElements(array1: any[], array2: any[]) {
    if (array1.length != array2.length) return false
    for (const element of array1) {
        if (!array2.includes(element)) return false
    }
    return true
}