<section class="plugin__content">
    <div class="mb-20 centered">
        <div class="button button--variant-orange size-s"
             on:click={() => bcast.emit('rqstOpen', 'menu')}>
            Back to menu
        </div>
    </div>

    {#if boat}
        <div class="boat size-xs" style:border-left-color="#00aaff">
            <div class="boat__name size-l mb-5">SY-Chaos</div>
            <div>Speed: {boat.speed?.toFixed(1) ?? '–'} kt</div>
            <div>Course: {boat.heading?.toFixed(0) ?? '–'}°</div>
            <div class="size-xs mt-5 opacity-70">{lastUpdate}</div>
        </div>

        <div class="mt-15 flex gap-10">
            <div class="button size-s" on:click={centerOnBoat}>Center</div>
            <div class="button size-s" on:click={loadPosition}>Refresh</div>
        </div>
    {:else}
        <div class="centered mt-30">Loading position…</div>
    {/if}
</section>

<script lang="ts">
    import bcast from '@windy/broadcast';
    import { map } from '@windy/map';
    import { onDestroy } from 'svelte';
    import { boatIcon } from './boatIcon';

    let marker: L.Marker | null = null;
    let trackLines: L.Polyline[] = [];
    let headingLine: L.Polyline | null = null;
    let tickMarkers: L.CircleMarker[] = [];
    let boat: { lat: number; lon: number; heading?: number; speed?: number } | null = null;
    let lastUpdate = '';
    let refreshTimer: number;

    const TRACK_URL = 'https://cdn.predictwind.com/tracking/data/SY-Chaos.json';
    const REFRESH_MS = 5 * 60 * 1000;

    // ---------- helpers ----------
    function splitAtAntimeridian(coords: [number, number][]): [number, number][][] {
        if (coords.length < 2) return [coords];

        const segments: [number, number][][] = [];
        let current: [number, number][] = [coords[0]];

        for (let i = 1; i < coords.length; i++) {
            const prev = coords[i - 1];
            const curr = coords[i];
            const deltaLon = curr[1] - prev[1];

            if (Math.abs(deltaLon) > 180) {
                segments.push(current);
                current = [curr];
            } else {
                current.push(curr);
            }
        }
        segments.push(current);
        return segments;
    }

    function projectHeading(
        lat: number,
        lon: number,
        headingDeg: number,
        speedKt: number,
        hours: number
    ): [number, number] {
        const distanceNm = speedKt * hours;
        const R = 3440.065; // Earth radius in nm
        const δ = distanceNm / R;
        const θ = (headingDeg * Math.PI) / 180;
        const φ1 = (lat * Math.PI) / 180;
        const λ1 = (lon * Math.PI) / 180;

        const φ2 = Math.asin(
            Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
        );
        const λ2 =
            λ1 +
            Math.atan2(
                Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
                Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
            );

        return [(φ2 * 180) / Math.PI, (((λ2 * 180) / Math.PI + 540) % 360) - 180];
    }

    // ---------- main load ----------
    async function loadPosition() {
        try {
            const res = await fetch(TRACK_URL);
            const data = await res.json();
            const route = data.route || [];
            if (!route.length) return;

            const last = route[route.length - 1];
            const lat = last.p.lat;
            const lon = last.p.lon;
            const heading = last.bearing ?? last.cog;
            const speed = last.bsp ?? last.sog ?? 0;

            boat = { lat, lon, heading, speed };
            lastUpdate = new Date(last.t * 1000).toUTCString();

            // ---- Full track (split at antimeridian) ----
            const allCoords: [number, number][] = route.map((p: any) => [p.p.lat, p.p.lon]);
            const segments = splitAtAntimeridian(allCoords);

            trackLines.forEach(l => map.removeLayer(l));
            trackLines = [];

            segments.forEach(seg => {
                if (seg.length < 2) return;
                const line = L.polyline(seg, {
                    color: '#ffffff',
                    weight: 2.5,
                    opacity: 0.85,
                }).addTo(map);
                trackLines.push(line);
            });

            // ---- Boat marker ----
            if (marker) map.removeLayer(marker);
            marker = L.marker([lat, lon], { icon: boatIcon }).addTo(map);

            if (marker._icon && heading != null) {
                marker._icon.setAttribute('data-heading', String(heading));
                marker._icon.style.transformOrigin = '12px 12px';
                const current = marker._icon.style.transform || '';
                if (!current.includes('rotateZ')) {
                    marker._icon.style.transform = `${current} rotateZ(${heading}deg)`;
                }
            }

            // ---- 6-hour heading line + 1-hour ticks ----
            if (headingLine) map.removeLayer(headingLine);
            tickMarkers.forEach(t => map.removeLayer(t));
            tickMarkers = [];

            if (heading != null && speed > 0.3) {
                // Main 6-hour line
                const end6h = projectHeading(lat, lon, heading, speed, 6);
                headingLine = L.polyline([[lat, lon], end6h], {
                    color: '#ffffff',
                    weight: 2,
                    opacity: 0.7,
                    dashArray: '8, 6',
                }).addTo(map);

                // 1-hour tick marks (hours 1 → 5)
                for (let h = 1; h <= 5; h++) {
                    const pos = projectHeading(lat, lon, heading, speed, h);
                    const tick = L.circleMarker(pos, {
                        radius: 3.5,
                        color: '#ffffff',
                        weight: 1.5,
                        fillColor: '#ffffff',
                        fillOpacity: 0.9,
                    }).addTo(map);
                    tickMarkers.push(tick);
                }
            }
        } catch (err) {
            console.error('SY-Chaos position fetch failed', err);
        }
    }

    function centerOnBoat() {
        if (boat) {
            map.setView([boat.lat, boat.lon], Math.max(map.getZoom(), 8));
        }
    }

    export const onopen = () => {
        loadPosition();
        refreshTimer = window.setInterval(loadPosition, REFRESH_MS);
    };

    onDestroy(() => {
        clearInterval(refreshTimer);
        if (marker) map.removeLayer(marker);
        if (headingLine) map.removeLayer(headingLine);
        trackLines.forEach(l => map.removeLayer(l));
        tickMarkers.forEach(t => map.removeLayer(t));
    });
</script>

<style lang="less">
    .boat {
        padding-left: 10px;
        border-left: 5px solid;
        line-height: 1.5;
    }
    .opacity-70 {
        opacity: 0.7;
    }
</style>