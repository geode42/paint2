<script lang="ts">
    import { onMount } from 'svelte'
    import PaintingCanvas from './lib/PaintingCanvas.svelte'

    let paintingCanvas: PaintingCanvas

    onMount(() => {
        paintingCanvas.focus()
    })
</script>

<PaintingCanvas bind:this={paintingCanvas} />
