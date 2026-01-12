<script lang='ts'>
    import { onMount } from "svelte"
    import ColorPicker from "./ColorPicker.svelte";

    type CanvasStrokeInfo = {
        // floats are used b/c points can have decimals on hiDPI displays and removing them is quite noticeable
        points: Float32Array,
        styling: {
            brushSize: number,
            color: number,
        },
    }

    const onMacOS = navigator.userAgent.includes('Mac')

    const canvasStrokes: CanvasStrokeInfo[] = []
    let historyStep = 0 // 0 = current, 1 = one back, 2 = two back, etc.

    const maxRealCursorSize = 128
    const brushCursorResizeGestureSensitivity = 1.8 // higher = slower size changing
    let paintColor: [number, number, number] = $state([0, 0, 0]) // rgb
    let resizingBrushWithGesture = $state(false)
    let brushSize = $state(20)
    // idk why but the cursor looks too big for large brush sizes, the .85 mostly fixes it
    // the "... ? 1 : ..." is there so that the fake cursor (which doesn't have the sizing issue) works as normal
    // nvm it just works now, so i set it as 1 : 1 instead of 1 : 0.85
    // leaving this here in case it decides to not work in the future
    let brushCursorSvgRingRadius = $derived(brushSize / 2 * ((brushSize > maxRealCursorSize || resizingBrushWithGesture) ? 1 : 1))
    let brushCursorSvgStrokeWidth = 1
    let brushCursorSvgStrokeColor = '#AAA'
    let brushCursorSvg = $derived(`<svg width="${brushCursorSvgRingRadius * 2}" height="${brushCursorSvgRingRadius * 2}" xmlns="http://www.w3.org/2000/svg"><circle cx="${brushCursorSvgRingRadius}" cy="${brushCursorSvgRingRadius}" r="${brushCursorSvgRingRadius - brushCursorSvgStrokeWidth}" fill="#0000" stroke-width="${brushCursorSvgStrokeWidth}" stroke="${brushCursorSvgStrokeColor}" /></svg>`)
    let brushCursorDataUrl = $derived(`data:image/svg+xml;base64,${encodeURIComponent(btoa(brushCursorSvg))}`)
    
    function rgbToNumber(r: number, g: number, b: number) {
        return (r << 16) + (g << 8) + b
    }

    let container: HTMLDivElement
    let canvasElement: HTMLCanvasElement
    let fakeCursor: HTMLDivElement
    let [brushCursorResizeGestureStartPageX, brushCursorResizeGestureStartBrushSize] = [NaN, NaN]

    const pagePosToCanvasPos = (x: number, y: number, ctxScale: number): [number, number] => {
        const canvasRect = canvasElement.getBoundingClientRect()
        return [
            (x - canvasRect.left) / canvasRect.width * canvasElement.width / ctxScale,
            (y - canvasRect.top) / canvasRect.height * canvasElement.height / ctxScale,
        ]
    }
    
    onMount(() => {
        function startBrushStroke(x: number, y: number, brushSize: number) {
            // Create initial dot (path strokes don't seem to get rendered until a second point is added)
            ctx.ellipse(x, y, brushSize / 2, brushSize / 2, 0, 0, 2 * Math.PI)
            ctx.fill()
            // Start path
            ctx.beginPath()
            ctx.moveTo(x, y)
        }
        function continueBrushStroke(x: number, y: number) {
            // Connect line from previous point
            ctx.lineTo(x, y)
            ctx.stroke() // render the line

            // Begin a new path (line) at the current point
            ctx.beginPath()
            ctx.moveTo(x, y)
        }
        /** Deletes future history and sets current history step to 0 */
        function resetHistoryToCurrentStep() {
            canvasStrokes.splice(canvasStrokes.length - historyStep, historyStep)
            historyStep = 0
        }
        function syncCanvasSize() {
            canvasElement.width = container.offsetWidth * devicePixelRatio
            canvasElement.height = container.offsetHeight * devicePixelRatio
            ctx.scale(devicePixelRatio, devicePixelRatio)
        }
        function redrawCanvas(canvasStrokes: CanvasStrokeInfo[]) {
            for (const stroke of canvasStrokes) {
                ctx.strokeStyle = `#${stroke.styling.color.toString(16).padStart(6, '0')}`
                ctx.fillStyle = ctx.strokeStyle
                ctx.lineWidth = stroke.styling.brushSize
                ctx.lineCap = 'round'

                startBrushStroke(stroke.points[0], stroke.points[1], stroke.styling.brushSize)
                for (let i = 2; i < stroke.points.length; i += 2) {
                    continueBrushStroke(stroke.points[i], stroke.points[i + 1])
                }
            }
        }
        new ResizeObserver(() => {
            syncCanvasSize()
            redrawCanvas(canvasStrokes.slice(0, canvasStrokes.length - historyStep))
        }).observe(container)
        const ctx = canvasElement.getContext('2d')!

        const currentStrokePoints: number[] = []

        addEventListener('pointermove', e => {
            if (resizingBrushWithGesture) return
            fakeCursor.style.left = `${e.clientX}px`
            fakeCursor.style.top = `${e.clientY}px`
        })

        canvasElement.addEventListener('contextmenu', e => {
            // prevent control-click on macos, which messes with the resizing gesture
            // this would theoretically be an issue regardless of platform so checking for macos seems superfluous
            if (e.button == 0 && e.ctrlKey) e.preventDefault()
        })

        canvasElement.addEventListener('pointerdown', e => {
            if (e.button == 0 && e.ctrlKey && e.altKey) {
                // pointer lock can't be used for this b/c it shows a popup everytime
                // which ig is good but still it's such sadness
                resizingBrushWithGesture = true
                canvasElement.setPointerCapture(e.pointerId)
                const canvasRect = canvasElement.getBoundingClientRect()
                fakeCursor.style.left = `${e.pageX - canvasRect.x}px`
                fakeCursor.style.top = `${e.pageY - canvasRect.y}px`
                brushCursorResizeGestureStartPageX = e.pageX
                brushCursorResizeGestureStartBrushSize = brushSize
                return
            }
            if (e.button != 0) return
            canvasElement.setPointerCapture(e.pointerId)
            ctx.strokeStyle = `rgb(${paintColor.join(' ')})`
            ctx.fillStyle = ctx.strokeStyle
            ctx.lineWidth = brushSize
            ctx.lineCap = 'round'

            startBrushStroke(...pagePosToCanvasPos(e.pageX, e.pageY, devicePixelRatio), brushSize)
            resetHistoryToCurrentStep() // new action taken, so delete future history and set current history step to latest
            currentStrokePoints.push(...pagePosToCanvasPos(e.pageX, e.pageY, devicePixelRatio))
        })
        canvasElement.addEventListener('pointermove', e => {
            if (resizingBrushWithGesture) {
                brushSize = Math.max(0, brushCursorResizeGestureStartBrushSize + (e.pageX - brushCursorResizeGestureStartPageX) / brushCursorResizeGestureSensitivity)
                return
            }

            if (!canvasElement.hasPointerCapture(e.pointerId)) return
            continueBrushStroke(...pagePosToCanvasPos(e.pageX, e.pageY, devicePixelRatio))
            currentStrokePoints.push(...pagePosToCanvasPos(e.pageX, e.pageY, devicePixelRatio))
        })
        canvasElement.addEventListener('pointerup', e => {
            if (resizingBrushWithGesture) {
                resizingBrushWithGesture = false
                return
            }
            if (!canvasElement.hasPointerCapture(e.pointerId)) return

            canvasStrokes.push({ points: new Float32Array(currentStrokePoints), styling: { brushSize, color: rgbToNumber(...paintColor) } })
            currentStrokePoints.length = 0
        })
        function undo() {
            historyStep = Math.min(canvasStrokes.length, historyStep + 1)
            ctx.clearRect(0, 0, canvasElement.width, canvasElement.height)
            redrawCanvas(canvasStrokes.slice(0, canvasStrokes.length - historyStep))
        }
        function redo() {
            historyStep = Math.max(0, historyStep - 1)
            ctx.clearRect(0, 0, canvasElement.width, canvasElement.height)
            redrawCanvas(canvasStrokes.slice(0, canvasStrokes.length - historyStep))
        }
        container.addEventListener('keydown', e => {
            // true if only cmd and/or shift are pressed on macos or only ctrl and/or shift on other platforms
            const ctrlOrCmdOnly = !e.altKey && (onMacOS ? (e.metaKey && !e.ctrlKey) : (e.ctrlKey && !e.metaKey))
            if (ctrlOrCmdOnly && e.key == 'z' && !e.shiftKey) undo()
            // for some reason cmd-shift-z returns a lowercase 'z' on my macbook, but ctrl-shift-z returns capital 'Z' elsewhere
            // why were macbooks invented
            if (ctrlOrCmdOnly && e.key.toLowerCase() == 'z' && e.shiftKey) redo()
            if (ctrlOrCmdOnly && e.key == 'y' && !e.shiftKey) { redo(); e.preventDefault() /* opens history on macos */ }
        })
    })
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div bind:this={container} class="container" class:hide-cursor={resizingBrushWithGesture || brushSize > maxRealCursorSize} tabindex="0">
    <div class="canvas-wrapper" style:cursor='url("{brushCursorDataUrl}") {brushCursorSvgRingRadius} {brushCursorSvgRingRadius}, default'>
        <canvas bind:this={canvasElement}></canvas>
        <div class='fake-cursor' hidden={!(resizingBrushWithGesture || brushSize > maxRealCursorSize)} bind:this={fakeCursor}>{@html brushCursorSvg}</div>
    </div>
    <div class='color-picker-wrapper'><ColorPicker bind:rgb={paintColor} /></div>
</div>

<style>
    .fake-cursor {
        position: fixed;
        translate: -50% -50%;
        pointer-events: none;
        z-index: 9999;
    }
    .canvas-wrapper {
        width: 100%;
        height: 100%;
    }
    /* hide fake cursor when hovering over other elements, like color picker */
    :not(:has(canvas:hover)) .fake-cursor {
        display: none;
    }
    .container {
        width: 100svw;
        height: 100svh;
        aspect-ratio: 1;
        position: relative;
        
        canvas {
            width: 100%;
            height: 100%;
        }

        &.hide-cursor .canvas-wrapper {
            cursor: none !important;
        }
    }

    canvas {
        user-select: none;
    }

    .color-picker-wrapper {
        position: absolute;
        bottom: 1rem;
        left: 1rem;
        height: 1rem;
        width: 20rem;
        height: auto;
        aspect-ratio: 1;
    }
</style>