<script lang='ts'>
    import { onMount } from 'svelte'
    import { HSVtoRGB } from './colorUtils'

    let { rgb = $bindable() }: { rgb?: [number, number, number] } = $props()

    let satVal: HTMLDivElement, satValPicker: HTMLDivElement, hueBar: HTMLDivElement, huePicker: HTMLDivElement

    let [hue, sat, val] = $state([0, 1, 1])

    $effect(() => {
        rgb = HSVtoRGB(hue, sat, val)
    })

    onMount(() => {
        function getRatiosForPicker(parentElement: HTMLElement, mouseEvent: MouseEvent) {
            const rect = parentElement.getBoundingClientRect()
            return {
                x: Math.max(0, Math.min(1, (mouseEvent.pageX - rect.x) / rect.width)),
                y: Math.max(0, Math.min(1, (mouseEvent.pageY - rect.y) / rect.height)),
            }
        }
        function getPosStylingForPicker(ratios: { x: number, y: number }, axes: 'horizontal' | 'vertical' | 'both' = 'both') {
            return {
                ...['horizontal', 'both'].includes(axes) && { left: `${ratios.x * 100}%` },
                ...['vertical', 'both'].includes(axes) && { top: `${ratios.y * 100}%` },
            }
        }

        Object.assign(satValPicker.style, getPosStylingForPicker({ x: sat, y: 1 - val }))
        Object.assign(huePicker.style, getPosStylingForPicker({ x: 0, y: hue }, 'vertical'))

        satVal.addEventListener('pointerdown', e => {
            e.stopPropagation() // prevent painting canvas or smth from stealing pointer capture
            satVal.setPointerCapture(e.pointerId)
            const ratios = getRatiosForPicker(satVal, e)
            ;[sat, val] = [ratios.x, 1 - ratios.y]
            Object.assign(satValPicker.style, getPosStylingForPicker(ratios))
        })
        satVal.addEventListener('pointermove', e => {
            if (!satVal.hasPointerCapture(e.pointerId)) return
            const ratios = getRatiosForPicker(satVal, e)
            ;[sat, val] = [ratios.x, 1 - ratios.y]
            Object.assign(satValPicker.style, getPosStylingForPicker(ratios))
        })

        hueBar.addEventListener('pointerdown', e => {
            e.stopPropagation() // prevent painting canvas or smth from stealing pointer capture
            hueBar.setPointerCapture(e.pointerId)
            const ratios = getRatiosForPicker(hueBar, e)
            hue = ratios.y
            Object.assign(huePicker.style, getPosStylingForPicker(ratios, 'vertical'))
        })
        hueBar.addEventListener('pointermove', e => {
            if (!hueBar.hasPointerCapture(e.pointerId)) return
            const ratios = getRatiosForPicker(hueBar, e)
            hue = ratios.y
            Object.assign(huePicker.style, getPosStylingForPicker(ratios, 'vertical'))
        })
    })
</script>

<div class="container">
    <!-- <canvas bind:this={canvas}></canvas> -->
    <div class='sat-val' bind:this={satVal} style:background='linear-gradient(transparent, black), linear-gradient(90deg, white, transparent), {`hsl(${hue * 360} 100 50)`}'>
        <div class="sat-val-picker" bind:this={satValPicker}></div>
    </div>
    <div class='hue' bind:this={hueBar}>
        <div class="hue-picker" bind:this={huePicker}></div>
    </div>
</div>

<style>
    .sat-val-picker {
        position: absolute;
        width: 1.5rem;
        aspect-ratio: 1;
        border: 0.15em solid white;
        border-radius: 100%;
        translate: -50% -50%;
        pointer-events: none;
    }
    .hue-picker {
        position: absolute;
        width: 100%;
        height: 0.2rem;
        translate: 0 -50%;
        background: white;
        pointer-events: none;
    }
    .container {
        height: 100%;
        width: max-content;
        display: flex;
        gap: 0.5rem;
        filter: drop-shadow(0 0 1rem #0002)
    }
    /* linear-rgb gradients defined above produce identical results to hsv canvas version */
    /* todo: linear rgb? */
    .sat-val {
        position: relative;
        height: 100%;
        width: auto;
        aspect-ratio: 1;
        border-radius: 1rem;
        /* overflow: hidden; */
    }
    /* probably produces identical results */
    .hue {
        position: relative;
        /* overflow: hidden; */
        width: 1.3rem;
        height: 100%;
        border-radius: 9999px;
        background: linear-gradient(in hsl longer hue, red 0 100%)
    }
</style>
