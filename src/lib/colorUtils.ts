// The two functions here are mostly from the top answer on https://stackoverflow.com/questions/17242144/how-to-convert-hsb-hsv-color-to-rgb-accurately as of writing this,
// b/c i can't be bothered to figure this out rn

export function HSVtoRGB(h: number, s: number, v: number): [number, number, number] {
    var r, g, b, i, f, p, q, t;
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    return [
        Math.round(r! * 255),
        Math.round(g! * 255),
        Math.round(b! * 255),
    ]
}

export function RGBtoHSV(r: number, g: number, b: number): [number, number, number] {
    var max = Math.max(r, g, b), min = Math.min(r, g, b),
        d = max - min,
        h,
        s = (max === 0 ? 0 : d / max),
        v = max / 255;

    switch (max) {
        case min: h = 0; break;
        case r: h = (g - b) + d * (g < b ? 6: 0); h /= 6 * d; break;
        case g: h = (b - r) + d * 2; h /= 6 * d; break;
        case b: h = (r - g) + d * 4; h /= 6 * d; break;
    }

    return [h!, s, v]
}

export function rgbToNumber(r: number, g: number, b: number) {
    return (r << 16) + (g << 8) + b
}
