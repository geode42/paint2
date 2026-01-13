<script lang='ts'>
    import { onMount } from "svelte"
    import ColorPicker from "./ColorPicker.svelte"
    import { rgbToNumber } from "./colorUtils"

    import matSymArrowSelectorTool from '../assets/material-symbols-icons/arrow_selector_tool_20dp_CURRENTCOLOR_FILL0_wght400_GRAD0_opsz20.svg?raw'
    import matSymPanTool from '../assets/material-symbols-icons/pan_tool_20dp_CURRENTCOLOR_FILL0_wght400_GRAD0_opsz20.svg?raw'
    import matSymBrush from '../assets/material-symbols-icons/brush_20dp_CURRENTCOLOR_FILL0_wght400_GRAD0_opsz20.svg?raw'

    export function focus() {
        container.focus()
    }

    type PaintStroke = {
        // floats are used b/c points can have decimals on hiDPI displays and removing them is quite noticeable
        points: Float32Array,
        styling: {
            brushSize: number,
            color: number,
        },
    }

    // Config / const consts
    const minScale = 0.01
    const maxStrokeWidth = 100 // capped to reduce lag
    const maxRealCursorSize = 128 // Capped by browsers
    const brushCursorResizeGestureSensitivity = 0.6 // higher = faster size changing
    const zoomGestureSensitivity = 0.1 // higher = faster zooming
    const brushCursorSvgStrokeWidth = 1
    const onMacOS = navigator.userAgent.includes('Mac')
    const zoomGestureMaxDelta = 100 // max amount deltaX/deltaY before a wheel event stops being considered a gesture
    const ctrlWheelZoomSpeed = 1.0015
    const ctrlWheelZoomSpeedGesture = 1.01 // pinch-to-zoom on macOS, which emits wheel events with ctrl pressed and a very small deltaY
    const scrollSpeed = 1
    const scrollSpeedGesture = 0.9
    // todo: change how zooming works so it zooms by 100% when >= 100% and something else before that
    const handClickZoomAmount = 1.75 // ctrl/cmd (optionally alt to reverse) and click zoom amount

    // Elements
    let container: HTMLDivElement
    let canvas: HTMLCanvasElement
    let fakeCursor: HTMLDivElement

    type Tool = 'selection' | 'hand' | 'brush'

    let activeTool: Tool = $state('brush' as any)

    // These directly scale, then translate the document
    // if scale == 1, then one CSS pixel corresponds to 1 document unit
    // if scale == 2, everything's twice as big, etc.
    // if translate is positive on both axes, the document will be translated down and to the right
    let documentScale = $state(1)
    let documentTranslation: [number, number] = $state([0, 0])

    const paintStrokes: PaintStroke[] = []
    let historyStep = 0 // 0 = current, 1 = one back, 2 = two back, etc.
    let strokeWidth = $state(20)
    let strokeColor: [number, number, number] = $state([255, 0, 0]) // rgb

    // Ctrl+alt gesture vars
    let resizingBrushWithGesture = $state(false)
    let [brushCursorResizeGestureStartPageX, brushCursorResizeGestureStartBrushSize] = [NaN, NaN]

    // hold space for temp hand tool
    let spaceBarHandActive = $state(false)

    // Brush cursor svg vars
    let brushCursorSvgSize = $derived(Math.round(strokeWidth * documentScale / 2) * 2) // rounding prevents alignment issues with the native cursor
    let brushCursorSvgStrokeColor = '#AAA'
    let brushCursorSvg = $derived(`<svg width="${brushCursorSvgSize}" height="${brushCursorSvgSize}" xmlns="http://www.w3.org/2000/svg"><circle cx="${brushCursorSvgSize / 2}" cy="${brushCursorSvgSize / 2}" r="${brushCursorSvgSize / 2 - brushCursorSvgStrokeWidth}" fill="#0000" stroke-width="${brushCursorSvgStrokeWidth}" stroke="${brushCursorSvgStrokeColor}" /></svg>`)
    let brushCursorDataUrl = $derived(`data:image/svg+xml;base64,${encodeURIComponent(btoa(brushCursorSvg))}`)
    let brushCursorStyle = $derived(`url("${brushCursorDataUrl}") ${brushCursorSvgSize / 2} ${brushCursorSvgSize / 2}, default`)
    let fakeBrushCursorVisible = $derived(activeTool == 'brush' && !spaceBarHandActive && (resizingBrushWithGesture || brushCursorSvgSize > maxRealCursorSize))

    // TODO: convert these to object
    // Hand tool dragging vars
    let documentPanPointerStart = [NaN, NaN]
    let documentPanTranslationStart = [NaN, NaN]
    let panning = $state(false)
    let [zoomGestureStartPointerPos, zoomGestureStartScale, zoomGestureStartTranslation]: [[number, number], number, [number, number]] = [[NaN, NaN], NaN, [NaN, NaN]]
    let zoomGestureActive = false

    // when holding ctrl/cmd or alt and having the hand tool active, you can click to zoom in/out, the cursor should reflect that
    let handZoomCursorType: 'zoom-in' | 'zoom-out' | 'none' = $state('none')

    const pagePosToCanvasPos = (x: number, y: number, ctxScale: number): [number, number] => {
        const canvasRect = canvas.getBoundingClientRect()
        return [
            (x - canvasRect.left) / canvasRect.width * canvas.width / ctxScale,
            (y - canvasRect.top) / canvasRect.height * canvas.height / ctxScale,
        ]
    }
    
    onMount(() => {
        function undo() {
            historyStep = Math.min(paintStrokes.length, historyStep + 1)
            redrawCanvas()
        }
        function redo() {
            historyStep = Math.max(0, historyStep - 1)
            redrawCanvas()
        }

        function canvasPosToWorldPos(x: number, y: number): [number, number] {
            return [
                (x - documentTranslation[0]) / documentScale,
                (y - documentTranslation[1]) / documentScale,
            ]
        }

        function worldPosToCanvasPos(x: number, y: number): [number, number] {
            return [
                x * documentScale + documentTranslation[0],
                y * documentScale + documentTranslation[1],
            ]
        }

        /** should be called after `setCtxStylingForPainting`. `x`, `y`, and `brushSize` are in world coordinates/units */
        function startBrushStroke(x: number, y: number, brushSize: number) {
            const [screenX, screenY] = worldPosToCanvasPos(x, y)
            const screenBrushSize = brushSize * documentScale
            // Create initial dot (path strokes don't seem to get rendered until a second point is added)
            ctx.ellipse(screenX, screenY, screenBrushSize / 2, screenBrushSize / 2, 0, 0, 2 * Math.PI)
            ctx.fill()
            // Start path
            ctx.beginPath()
            ctx.moveTo(screenX, screenY)
        }
        /** should be called after `setCtxStylingForPainting` and `startBrushStroke` (and optionally any amount of this fn). `x`, `y`, and `brushSize` are in world coordinates/units */
        function continueBrushStroke(x: number, y: number) {
            const [screenX, screenY] = worldPosToCanvasPos(x, y)

            // Connect line from previous point
            ctx.lineTo(screenX, screenY)
            ctx.stroke() // render the line

            // Begin a new path (line) at the current point
            ctx.beginPath()
            ctx.moveTo(screenX, screenY)
        }
        /** Deletes future history and sets current history step to 0 */
        function makeCurrentHistoryStepLatest() {
            paintStrokes.splice(paintStrokes.length - historyStep, historyStep)
            historyStep = 0
        }
        function syncCanvasSize() {
            canvas.width = container.offsetWidth * devicePixelRatio
            canvas.height = container.offsetHeight * devicePixelRatio
            ctx.scale(devicePixelRatio, devicePixelRatio)
        }
        function setCtxStylingForPainting(strokeColor: string, strokeWidth: number) {
            ctx.strokeStyle = strokeColor
            ctx.fillStyle = strokeColor
            ctx.lineWidth = strokeWidth * documentScale
            ctx.lineCap = 'round'
        }
        function drawStrokesOnCanvas(canvasStrokes: PaintStroke[]) {
            for (const stroke of canvasStrokes) {
                setCtxStylingForPainting(`#${stroke.styling.color.toString(16).padStart(6, '0')}`, stroke.styling.brushSize)
                startBrushStroke(stroke.points[0], stroke.points[1], stroke.styling.brushSize)
                for (let i = 2; i < stroke.points.length; i += 2) {
                    continueBrushStroke(stroke.points[i], stroke.points[i + 1])
                }
            }
        }
        function redrawCanvas(options?: { clear?: boolean }) {
            ;(options?.clear != false) && ctx.clearRect(0, 0, canvas.width, canvas.height)
            drawStrokesOnCanvas(paintStrokes.slice(0, paintStrokes.length - historyStep))
        }
        
        new ResizeObserver(() => {
            syncCanvasSize()
            redrawCanvas({ clear: false })
            drawStrokesOnCanvas(paintStrokes.slice(0, paintStrokes.length - historyStep))
        }).observe(container)

        function zoomIntoPagePos(x: number, y: number, newZoom: number) {
            // Calculate initial world pos
            const pointerPosInWorldBeforeScale = canvasPosToWorldPos(...pagePosToCanvasPos(x, y, devicePixelRatio))
            // Scale
            documentScale = Math.max(minScale, newZoom)
            // Calculate new world pos at the same screen point
            const pointerPosInWorldAfterScale = canvasPosToWorldPos(...pagePosToCanvasPos(x, y, devicePixelRatio))
            // translate the document so that the new pos becomes the old pos
            // tbh idk why these are multiplied by documentScale, but doing so makes things work
            documentTranslation[0] -= (pointerPosInWorldBeforeScale[0] - pointerPosInWorldAfterScale[0]) * documentScale
            documentTranslation[1] -= (pointerPosInWorldBeforeScale[1] - pointerPosInWorldAfterScale[1]) * documentScale
        }

        function updateHandZoomCursorType(e: KeyboardEvent | MouseEvent) {
            handZoomCursorType = 'none'
            if ((activeTool == 'hand' || spaceBarHandActive) && (onMacOS ? e.metaKey : e.ctrlKey)) handZoomCursorType = 'zoom-in'
            // alt key takes priority
            if ((activeTool == 'hand' || spaceBarHandActive) && e.altKey) handZoomCursorType = 'zoom-out'
        }

        const ctx = canvas.getContext('2d')!

        const currentStrokePoints: number[] = []

        addEventListener('pointermove', e => {
            if (resizingBrushWithGesture) return
            fakeCursor.style.left = `${e.clientX}px`
            fakeCursor.style.top = `${e.clientY}px`

            // afaik there's no way to check if a modifier key was pressed/released while another key is being held
            // (e.g. pressing alt while holding space)
            // so this function is re-run on mouse move events since they seem quite frequent and give modifier key info
            updateHandZoomCursorType(e)
        })

        canvas.addEventListener('contextmenu', e => {
            // prevent control-click on macos, which messes with the resizing gesture
            // this would theoretically be an issue regardless of platform so checking for macos seems superfluous
            
            // note: firefox seems to just not emit pointer events if control is held on macos
            // it does emit mouse events, but you don't get pointer capture with those :(
            // ahh... ig-
            // todo: split pointer handlers into functions and use mouse events on firefox if ctrl is pressed and buttons == 1 (meaning no pointer event was emitted)?
            // and just don't use pointer capture for those
            if (activeTool == 'brush' && e.ctrlKey && e.buttons == 1) e.preventDefault()
        })

        canvas.addEventListener('wheel', e => {
            const isGesture = Math.abs(e.deltaX) < zoomGestureMaxDelta && Math.abs(e.deltaY) < zoomGestureMaxDelta
            if (e.ctrlKey || e.metaKey) {
                zoomIntoPagePos(e.pageX, e.pageY, documentScale * (isGesture ? ctrlWheelZoomSpeedGesture : ctrlWheelZoomSpeed) ** -e.deltaY)
                redrawCanvas()
                e.preventDefault()
                return
            }
            documentTranslation[+e.shiftKey] -= e.deltaX * (isGesture ? scrollSpeedGesture : scrollSpeed)
            documentTranslation[1 - +e.shiftKey] -= e.deltaY * (isGesture ? scrollSpeedGesture : scrollSpeed)
            redrawCanvas()
        })

        canvas.addEventListener('pointerdown', e => {
            if ((activeTool == 'hand' || spaceBarHandActive) && e.buttons == 1 && (e.altKey || (onMacOS ? e.metaKey : e.ctrlKey))) {
                zoomGestureActive = true
                zoomGestureStartPointerPos = [e.clientX, e.clientY]
                zoomGestureStartScale = documentScale
                // clone values from svelte's magic reacty thing
                zoomGestureStartTranslation = [...documentTranslation]
                canvas.setPointerCapture(e.pointerId)
                return
            }
            if ((activeTool == 'hand' || spaceBarHandActive) && e.buttons == 1) {
                documentPanPointerStart = [e.clientX, e.clientY]
                // clone values from svelte's magic reacty thing
                documentPanTranslationStart = [...documentTranslation]
                canvas.setPointerCapture(e.pointerId)
                panning = true
                return
            }
            if (activeTool == 'brush' && e.buttons == 1 && e.ctrlKey && e.altKey) {
                // pointer lock can't be used for this b/c it shows a popup everytime
                // which ig is good but still it's such sadness
                resizingBrushWithGesture = true
                canvas.setPointerCapture(e.pointerId)
                const canvasRect = canvas.getBoundingClientRect()
                fakeCursor.style.left = `${e.pageX - canvasRect.x}px`
                fakeCursor.style.top = `${e.pageY - canvasRect.y}px`
                brushCursorResizeGestureStartPageX = e.pageX
                brushCursorResizeGestureStartBrushSize = strokeWidth
                return
            }
            if (activeTool == 'brush' && e.buttons == 1) {
                canvas.setPointerCapture(e.pointerId)
                setCtxStylingForPainting(`rgb(${strokeColor.join(' ')})`, strokeWidth)
    
                const worldPos = canvasPosToWorldPos(...pagePosToCanvasPos(e.pageX, e.pageY, devicePixelRatio))
                startBrushStroke(...worldPos, strokeWidth)
                makeCurrentHistoryStepLatest() // new action taken, so delete future history and set current history step to latest
                currentStrokePoints.push(...worldPos)
                return
            }
        })
        canvas.addEventListener('pointermove', e => {
            if (zoomGestureActive && canvas.hasPointerCapture(e.pointerId)) {
                // reset transform to when the gesture was activated
                documentScale = zoomGestureStartScale
                documentTranslation = zoomGestureStartTranslation
                zoomIntoPagePos(...zoomGestureStartPointerPos, zoomGestureStartScale + (e.clientX - zoomGestureStartPointerPos[0]) * zoomGestureSensitivity)
                redrawCanvas()
                return
            }
            if (panning && canvas.hasPointerCapture(e.pointerId)) {
                documentTranslation = [
                    documentPanTranslationStart[0] + (e.clientX - documentPanPointerStart[0]),
                    documentPanTranslationStart[1] + (e.clientY - documentPanPointerStart[1]),
                ]
                redrawCanvas()
                return
            }
            if (resizingBrushWithGesture) {
                strokeWidth = Math.max(0, Math.min(maxStrokeWidth, brushCursorResizeGestureStartBrushSize + (e.pageX - brushCursorResizeGestureStartPageX) * brushCursorResizeGestureSensitivity))
                return
            }
            if (activeTool == 'brush' && canvas.hasPointerCapture(e.pointerId)) {
                const worldPos = canvasPosToWorldPos(...pagePosToCanvasPos(e.pageX, e.pageY, devicePixelRatio))
                continueBrushStroke(...worldPos)
                currentStrokePoints.push(...worldPos)
                return
            }
        })
        // pointer capture is released on pointerup automatically, so manually calling it isn't necessary
        canvas.addEventListener('pointerup', e => {
            if (zoomGestureActive) {
                zoomGestureActive = false
                if (e.clientX == zoomGestureStartPointerPos[0] && e.clientY == zoomGestureStartPointerPos[1]) {
                    zoomIntoPagePos(e.pageX, e.pageY, documentScale / handClickZoomAmount ** (+e.altKey * 2 - 1))
                    redrawCanvas()
                }
                return
            }
            if (panning) {
                panning = false
                return
            }
            if (resizingBrushWithGesture) {
                resizingBrushWithGesture = false
                return
            }
            if (activeTool == 'brush' && canvas.hasPointerCapture(e.pointerId)) {
                paintStrokes.push({ points: new Float32Array(currentStrokePoints), styling: { brushSize: strokeWidth, color: rgbToNumber(...strokeColor) } })
                currentStrokePoints.length = 0
                return
            }
        })
        container.addEventListener('keydown', e => {
            // true if only cmd and/or shift are pressed on macos or only ctrl and/or shift on other platforms
            const ctrlOrCmdOnly = !e.altKey && (onMacOS ? (e.metaKey && !e.ctrlKey) : (e.ctrlKey && !e.metaKey))
            const noNonShiftModifierKeys = !e.ctrlKey && !e.altKey && !e.metaKey
            if (ctrlOrCmdOnly && e.key == 'z' && !e.shiftKey) undo()
            // for some reason cmd-shift-z returns a lowercase 'z' on my macbook, but ctrl-shift-z returns capital 'Z' elsewhere
            // why were macbooks invented
            if (ctrlOrCmdOnly && e.key.toLowerCase() == 'z' && e.shiftKey) redo()
            if (ctrlOrCmdOnly && e.key == 'y' && !e.shiftKey) { redo(); e.preventDefault() /* opens history on macos */ }
            if (e.key == ' ') spaceBarHandActive = true
            if (e.key.toLowerCase() == 'v' && noNonShiftModifierKeys) activeTool = 'selection'
            if (e.key.toLowerCase() == 'h' && noNonShiftModifierKeys) activeTool = 'hand'
            if (e.key.toLowerCase() == 'b' && noNonShiftModifierKeys) activeTool = 'brush'

            updateHandZoomCursorType(e)
        })
        // these don't seem container-specific
        addEventListener('keyup', e => {
            // you can break this by pressing space, then alt, then releasing both of them
            // but i do not know how to fix that
            if (e.key == ' ') {
                spaceBarHandActive = false
            }
            updateHandZoomCursorType(e)
        })
    })

    type ToolbarButtonInfo = {
        toolName: Tool,
        labelHtml: string,
    }

    const toolbarButtonInfos: ToolbarButtonInfo[] = [
        {
            toolName: 'selection',
            labelHtml: matSymArrowSelectorTool,
        },
        {
            toolName: 'hand',
            labelHtml: matSymPanTool,
        },
        {
            toolName: 'brush',
            labelHtml: matSymBrush,
        },
    ]
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div bind:this={container} class="container" tabindex="0">
    <div class="canvas-wrapper" style:cursor={handZoomCursorType == 'zoom-in' ? 'zoom-in' : handZoomCursorType == 'zoom-out' ? 'zoom-out' : panning ? 'grabbing' : (activeTool == 'hand' || spaceBarHandActive) ? 'grab' : activeTool == 'brush' ? (fakeBrushCursorVisible ? 'none' : brushCursorStyle) : null}>
        <canvas bind:this={canvas}></canvas>
        <div class='fake-cursor' hidden={!fakeBrushCursorVisible} bind:this={fakeCursor}>{@html brushCursorSvg}</div>
    </div>
    <div class='color-picker-wrapper'><ColorPicker bind:rgb={strokeColor} /></div>
    <div class="toolbar">
        {#each toolbarButtonInfos as i}
            <button
                onclick={() => activeTool = i.toolName}
                class:active={activeTool == i.toolName}
            >{@html i.labelHtml}</button>
        {/each}
    </div>
</div>

<style>
    .toolbar {
        position: absolute;
        top: 1rem;
        left: 50%;
        translate: -50%;
        background: white;
        border-radius: 999px;
        border: 0.12rem solid rgb(230, 230, 230);
        filter: drop-shadow(0 0 0.7rem #00000018);

        button {
            background: transparent;
            border: none;
            width: 3.5rem;
            height: auto;
            aspect-ratio: 1;
            position: relative;
            cursor: pointer;

            &::before {
                content: '';
                position: absolute;
                width: calc(100% - 0.5rem);
                height: calc(100% - 0.5rem);
                top: 50%;
                left: 50%;
                translate: -50% -50%;
                z-index: -1;
                border-radius: 999px;
                transition: background 0.25s, color 0.25s, scale 0.25s;
                scale: 0.9;
            }
            :global(svg) {
                height: 1.5rem;
                width: auto;
                aspect-ratio: 1;
            }
            &:hover::before {
                background: rgb(169, 245, 176);
                scale: 1;
            }
            &.active {
                color: white;
                &::before {
                    background: rgb(99, 196, 108);
                    border: 0.12rem solid #9beba3;
                    scale: 1;
                }
            }
        }
    }
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
        outline: none; /* hide focused border */
        
        canvas {
            width: 100%;
            height: 100%;
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
