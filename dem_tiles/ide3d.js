/* IDE TRANSPORTE 3D
 * DEM propio en formato Terrarium RGB (codificación Terrarium).
 * Mantiene el visualizador Leaflet existente y carga las rutas de los index.json actuales.
 */
(() => {
  "use strict";
  const OWNER = "pinwii21";
  const REPO = "IDE-TRANSPORTE";
  const BRANCH = "main";
  const BASE = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}`;
  const FOLDERS = [
    { dir: "RUTAS INGRESO", label: "INGRESO", color: "#28a745" },
    { dir: "RUTAS SALIDA", label: "SALIDA", color: "#dc3545" }
  ];
  // El metadata.txt indica Terrarium RGB, NO Mapbox Terrain-RGB.
  // Estructura XYZ: dem_tiles/{z}/{x}/{y}.png
  // GitHub Pages/servidor local puede servir PNGs estáticos; el GeoTIFF no se usa directamente.
 
const CONFIG = {
  center: [-78.467838, -0.180653],
  zoom: 11.5,
  demTileTemplate: "./dem_tiles/{z}/{x}/{y}.png",
  demTileSize: 256,
  demMaxZoom: 11,
  enableTerrain: true,
  cameraPitch: 64,
  cameraBearing: -15,
  // Cámara de seguimiento: altura aproximada de los ojos dentro de un vehículo.
  vehicleCameraHeight: 2.2,
  vehicleLookAheadMeters: 22,
  vehicleLookAtHeight: 1.2,
  vehicleCameraZoom: 19,
  terrainExaggeration: 1.15,
  show3DBuildings: true,
  buildingSource: "openmaptiles"
};


  const $ = id => document.getElementById(id);
  const map2d = $("map"), map3dEl = $("map3d");
  const btn2d = $("view2dBtn"), btn3d = $("view3dBtn");
  const panel = $("controls3d");
  if (!map2d || !map3dEl || !window.maplibregl) return;

  let map3d = null;
  let routes = [];
  let selectedRoute = null;
  let terrainAvailable = false;
  let lastProfile = [];
  const allRouteFeaturesByFolder = { INGRESO: [], SALIDA: [] };

  function setStatus(message) { const el = $("status3d"); if (el) el.textContent = message; }
  function setView(mode) {
    const threeD = mode === "3d";
    map2d.style.display = threeD ? "none" : "block";
    map3dEl.hidden = !threeD;
    panel.hidden = !threeD;
    btn2d.classList.toggle("active", !threeD);
    btn3d.classList.toggle("active", threeD);
    if (threeD) {
      initMap3d();
      setTimeout(() => map3d && map3d.resize(), 80);
    } else if (window.map && typeof window.map.invalidateSize === "function") {
      setTimeout(() => window.map.invalidateSize(), 80);
    }
  }
  btn2d?.addEventListener("click", () => setView("2d"));
  btn3d?.addEventListener("click", () => setView("3d"));

  function style3d() {
    // Estilo vectorial OpenFreeMap: contiene geometrías de edificios para extrusión 3D.
    // El DEM propio se incorpora al estilo después de cargarlo.
    return "https://tiles.openfreemap.org/styles/liberty";
  }

  function addSatelliteLayer() {
  if (!map3d || map3d.getSource("satellite-esri")) return;

  map3d.addSource("satellite-esri", {
    type: "raster",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
    ],
    tileSize: 256,
    maxzoom: 19,
    attribution:
      "Imagery © Esri, Maxar, Earthstar Geographics y sus proveedores"
  });

  const layers = map3d.getStyle().layers || [];
  const firstOverlay = layers.find(
    layer => layer.type !== "background"
  );

  map3d.addLayer(
    {
      id: "satellite-basemap",
      type: "raster",
      source: "satellite-esri",
      paint: {
        "raster-opacity": 1,
        "raster-fade-duration": 0
      }
    },
    firstOverlay?.id
  );
}

  function initMap3d() {
    if (map3d) return;
    map3d = new maplibregl.Map({
      container: "map3d", style: style3d(), center: CONFIG.center,
      zoom: CONFIG.zoom, pitch: CONFIG.cameraPitch, bearing: CONFIG.cameraBearing, maxPitch: 85,
      // Navegación con ratón: arrastrar para desplazar; botón derecho para rotar;
      // Ctrl + arrastrar con botón izquierdo también permite rotar/inclinar.
      dragPan: true,
      dragRotate: true,
      scrollZoom: true,
      doubleClickZoom: true,
      keyboard: true,
      touchZoomRotate: true,
      pitchWithRotate: true,
      fadeDuration: 0,
      attributionControl: true
    });
    map3d.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");
    map3d.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    map3d.on("load", async () => {
      addSatelliteLayer();
      addBuildingLayer();
      terrainAvailable = false;
      if (CONFIG.enableTerrain) {
        try {
          map3d.addSource("dem-propio", {
            type: "raster-dem", tiles: [CONFIG.demTileTemplate],
            tileSize: CONFIG.demTileSize, maxzoom: CONFIG.demMaxZoom,
            encoding: "terrarium"
          });
          map3d.setTerrain({ source: "dem-propio", exaggeration: CONFIG.terrainExaggeration });
          const z = 10;
const lon = CONFIG.center[0];
const lat = Math.max(-85.05112878, Math.min(85.05112878, CONFIG.center[1]));

const x = Math.floor(((lon + 180) / 360) * (2 ** z));
const latRad = lat * Math.PI / 180;
const y = Math.floor(
  ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * (2 ** z)
);

const testUrl = CONFIG.demTileTemplate
  .replace("{z}", String(z))
  .replace("{x}", String(x))
  .replace("{y}", String(y));

const response = await fetch(testUrl, { method: "HEAD" });
terrainAvailable = response.ok;
        } catch (_) { terrainAvailable = false; }
      }
      if (terrainAvailable) setStatus("DEM propio conectado. Ratón: arrastrar = mover; botón derecho + arrastrar = rotar/inclinar; rueda = zoom. Selecciona una ruta para calcular el perfil.");
      else setStatus("Vista 3D activa. Ratón: arrastrar = mover; botón derecho + arrastrar = rotar/inclinar; rueda = zoom. No se detectó la tesela DEM de prueba: verifica dem_tiles/{z}/{x}/{y}.png.");
      await loadRoutes();
      setupWalkControls();
    });
    map3d.on("error", e => {
      const msg = e?.error?.message || "error de carga";
      if (String(msg).toLowerCase().includes("dem") || String(msg).toLowerCase().includes("raster")) setStatus("No se pudo cargar el DEM. Verifica la URL, cobertura XYZ y codificación Terrarium RGB.");
      console.warn("MapLibre 3D:", msg);
    });
  }

  function addBuildingLayer() {
    if (!CONFIG.show3DBuildings || !map3d) return;
    // El estilo Liberty de OpenFreeMap suele incluir la fuente vectorial openmaptiles
    // y la capa building. Comprueba que existan antes de añadir la extrusión.
    try {
      const style = map3d.getStyle();
      const sourceExists = Boolean(style.sources && style.sources.openmaptiles);
      const layerExists = (style.layers || []).some(layer => layer['source-layer'] === 'building');
      if (!sourceExists || !layerExists) {
        console.warn('El estilo no expone una capa vectorial building; se mantiene el mapa sin extrusión.');
        return;
      }
      if (!map3d.getLayer('edificios-3d-ide')) {
        map3d.addLayer({
          id: 'edificios-3d-ide', type: 'fill-extrusion', source: 'openmaptiles',
          'source-layer': 'building', minzoom: 14,
          paint: {
            // Tonos cálidos y variación sutil por edificio para evitar bloques planos.
            'fill-extrusion-color': [
              'match', ['get', 'colour'],
              '#ffffff', '#e8e2d8',
              '#d9d0c3', '#d9d0c3',
              '#c8d0d8', '#c8d0d8',
              '#ded6ca'
            ],
            'fill-extrusion-height': [
              'coalesce', ['get', 'render_height'], ['get', 'height'], 8
            ],
            'fill-extrusion-base': [
              'coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0
            ],
            'fill-extrusion-opacity': 0.96,
            'fill-extrusion-vertical-gradient': true
          }
        });
      }
    } catch (err) { console.warn('No se pudieron activar edificios 3D:', err); }
  }

  async function loadRoutes() {
    if (!map3d) return;
    routes = [];
    for (const folder of FOLDERS) {
      try {
        const response = await fetch(`${BASE}/${encodeURIComponent(folder.dir)}/index.json`);
        if (!response.ok) throw new Error(`index.json HTTP ${response.status}`);
        const names = await response.json();
        const results = await Promise.allSettled(names.map(async name => {
          const filename = String(name).toLowerCase().endsWith(".geojson") ? String(name) : `${name}.geojson`;
          const url = `${BASE}/${encodeURIComponent(folder.dir)}/${encodeURIComponent(filename)}`;
          const res = await fetch(url);
          if (!res.ok) throw new Error(`${filename}: HTTP ${res.status}`);
          const geojson = await res.json();
          const route = { id: `${folder.label}:${filename}`, name: filename, folder: folder.label, color: folder.color, data: geojson };
          routes.push(route);
          return route;
        }));
        const failed = results.filter(r => r.status === "rejected").length;
        if (failed) console.warn(`${failed} rutas no se pudieron cargar en ${folder.dir}`);
      } catch (err) { console.error(`No se pudo cargar ${folder.dir}`, err); }
    }
    addRouteLayers();
    addRouteHighlightLayers();
    populateSelector();
    applyRouteFiltersTo3D();
    updateSelectedRouteStyle();
    setStatus(`${routes.length} archivos de rutas cargados en capas optimizadas. ${terrainAvailable ? "DEM detectado." : "El análisis de elevación requiere configurar el DEM."}`);
  }

  function addRouteLayers() {
    if (!map3d) return;

    for (const folder of FOLDERS) {
      const sourceId = folder.label === "INGRESO"
        ? "rutas-ingreso-3d"
        : "rutas-salida-3d";

      const layerId = folder.label === "INGRESO"
        ? "lineas-ingreso-3d"
        : "lineas-salida-3d";

      const features = [];

      for (const route of routes.filter(r => r.folder === folder.label)) {
        const data = route.data;
        let routeFeatures = [];

        if (data?.type === "FeatureCollection") {
          routeFeatures = data.features || [];
        } else if (data?.type === "Feature") {
          routeFeatures = [data];
        } else if (data?.type && data?.coordinates) {
          routeFeatures = [{
            type: "Feature",
            properties: {},
            geometry: data
          }];
        }

        for (const feature of routeFeatures) {
          if (!feature?.geometry) continue;

          features.push({
            type: "Feature",
            properties: {
              ...(feature.properties || {}),
              _ideRouteId: route.id,
              _ideRouteName: route.name
            },
            geometry: feature.geometry
          });
        }
      }

      allRouteFeaturesByFolder[folder.label] = features;

      const collection = {
        type: "FeatureCollection",
        features
      };

      if (map3d.getSource(sourceId)) {
        map3d.getSource(sourceId).setData(collection);
      } else {
        map3d.addSource(sourceId, {
          type: "geojson",
          data: collection,
          tolerance: 1.2,
          buffer: 32
        });
      }

      if (!map3d.getLayer(layerId)) {
        map3d.addLayer({
          id: layerId,
          type: "line",
          source: sourceId,
          layout: {
            "line-cap": "round",
            "line-join": "round"
          },
          paint: {
            "line-color": folder.color,
            "line-width": 2.5,
            "line-opacity": 0.88
          }
        });
      }
    }
  }

  function addRouteHighlightLayers() {
    if (!map3d) return;

    const layers = [
      {
        source: "rutas-ingreso-3d",
        halo: "halo-ingreso-3d",
        selected: "seleccion-ingreso-3d",
        color: "#28a745"
      },
      {
        source: "rutas-salida-3d",
        halo: "halo-salida-3d",
        selected: "seleccion-salida-3d",
        color: "#dc3545"
      }
    ];

    for (const item of layers) {
      if (!map3d.getSource(item.source)) continue;

      if (!map3d.getLayer(item.halo)) {
        map3d.addLayer({
          id: item.halo,
          type: "line",
          source: item.source,
          filter: ["==", ["get", "_ideRouteId"], "__none__"],
          layout: {
            "line-cap": "round",
            "line-join": "round"
          },
          paint: {
            "line-color": "#ffffff",
            "line-width": 8,
            "line-opacity": 0.95,
            "line-blur": 1
          }
        });
      }

      if (!map3d.getLayer(item.selected)) {
        map3d.addLayer({
          id: item.selected,
          type: "line",
          source: item.source,
          filter: ["==", ["get", "_ideRouteId"], "__none__"],
          layout: {
            "line-cap": "round",
            "line-join": "round"
          },
          paint: {
            "line-color": item.color,
            "line-width": 4.5,
            "line-opacity": 1
          }
        });
      }
    }
  }

  function updateSelectedRouteStyle() {
    if (!map3d || !map3d.isStyleLoaded()) return;

    const layers = [
      {
        folder: "INGRESO",
        halo: "halo-ingreso-3d",
        selected: "seleccion-ingreso-3d"
      },
      {
        folder: "SALIDA",
        halo: "halo-salida-3d",
        selected: "seleccion-salida-3d"
      }
    ];

    for (const item of layers) {
      const active =
        selectedRoute && selectedRoute.folder === item.folder;

      const filter = active
        ? ["==", ["get", "_ideRouteId"], selectedRoute.id]
        : ["==", ["get", "_ideRouteId"], "__none__"];

      if (map3d.getLayer(item.halo)) {
        map3d.setFilter(item.halo, filter);
      }

      if (map3d.getLayer(item.selected)) {
        map3d.setFilter(item.selected, filter);
      }
    }
  }

  function applyRouteFiltersTo3D() {
    if (!map3d || !map3d.isStyleLoaded()) return;

    const field1 = $("campo1")?.value || "";
    const value1 = $("valor1")?.value || "";
    const field2 = $("campo2")?.value || "";
    const value2 = $("valor2")?.value || "";

    const matches = (feature) => {
      const props = feature.properties || {};
      const matchValue = (field, selected) => {
        if (!selected) return true;
        const actual = props[field];
        return actual !== undefined && actual !== null &&
          String(actual).trim().toLowerCase() === String(selected).trim().toLowerCase();
      };
      return matchValue(field1, value1) && matchValue(field2, value2);
    };

    for (const folder of FOLDERS) {
      const sourceId = folder.label === "INGRESO" ? "rutas-ingreso-3d" : "rutas-salida-3d";
      const source = map3d.getSource(sourceId);
      if (!source) continue;

      const allFeatures = allRouteFeaturesByFolder[folder.label] || [];
      source.setData({
        type: "FeatureCollection",
        features: allFeatures.filter(matches)
      });
    }
  }

  // El filtro del panel lateral pertenece a app.js (Leaflet). Escuchar sus
  // controles también actualiza las capas consolidadas del visor MapLibre 3D.
  ["campo1", "valor1", "campo2", "valor2"].forEach(id => {
    $(id)?.addEventListener("change", () => {
      // app.js registra sus eventos primero y actualiza las opciones de los selects.
      requestAnimationFrame(applyRouteFiltersTo3D);
    });
  });

  function populateSelector() {
    const select = $("routeSelect3d"); if (!select) return;
    select.innerHTML = '<option value="">Selecciona una ruta…</option>';
    routes.sort((a,b) => a.name.localeCompare(b.name, "es", {numeric:true}));
    for (const r of routes) {
      const opt = document.createElement("option"); opt.value = r.id; opt.textContent = `${r.folder} · ${r.name}`; select.appendChild(opt);
    }
        select.addEventListener("change", () => {
      selectedRoute = routes.find(r => r.id === select.value) || null;

      updateSelectedRouteStyle();

      if (selectedRoute) {
        focusRoute(selectedRoute);
        calculateProfile(selectedRoute);
      } else {
        clearProfile("Selecciona una ruta para calcular su perfil de elevación.");
      }
    });
  }
  function coordinatesFromGeoJSON(geojson) {

    const coords = [];
    function walkGeometry(g) {
      if (!g) return;
      if (g.type === "GeometryCollection") { (g.geometries || []).forEach(walkGeometry); return; }
      function walk(c) {
        if (!Array.isArray(c)) return;
        if (c.length >= 2 && typeof c[0] === "number" && typeof c[1] === "number") coords.push([c[0], c[1]]);
        else c.forEach(walk);
      }
      walk(g.coordinates);
    }
    if (geojson.type === "FeatureCollection") (geojson.features || []).forEach(f => walkGeometry(f.geometry));
    else if (geojson.type === "Feature") walkGeometry(geojson.geometry);
    else walkGeometry(geojson);
    return coords;
  }


  // ============================================================
  // MODO CONDUCCIÓN 3D — IDE TRANSPORTE
  // Primera persona con recorrido automático.
  // ============================================================

  let driveAnimationFrame = null;
  let driveActive = false;
  let drivePaused = false;
  let driveDistance = 0;
  let drivePath = [];
  let driveTotalDistance = 0;
  let driveLastFrameTime = 0;
  let driveSavedCamera = null;
  let driveControls = null;

  function setupWalkControls() {
    if (driveControls || !map3dEl) return;

    const panelTarget = panel || map3dEl.parentElement;
    if (!panelTarget) return;

    const box = document.createElement("div");
    box.id = "driveControls3d";
    box.style.cssText = [
      "margin:10px",
      "padding:12px",
      "border:1px solid #cbd5e1",
      "border-radius:10px",
      "background:#ffffff",
      "color:#1e293b",
      "font:13px Arial,sans-serif",
      "position:relative",
      "z-index:5"
    ].join(";");

    box.innerHTML = `
      <div style="font-weight:700;margin-bottom:8px">
        🚗 Modo conducción 3D
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" id="driveStart3d">Iniciar recorrido</button>
        <button type="button" id="drivePause3d" disabled>Pausar</button>
        <button type="button" id="driveStop3d" disabled>Detener</button>
      </div>
      <label for="driveSpeed3d" style="display:block;margin-top:10px">
        Velocidad: <strong id="driveSpeedValue3d">80 km/h</strong>
      </label>
      <input id="driveSpeed3d" type="range"
        min="10" max="120" step="10" value="80"
        style="width:100%">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b">
        <span>10 km/h</span><span>120 km/h</span>
      </div>
      <div id="driveStatus3d" role="status"
        style="margin-top:8px;color:#475569">
        Selecciona una ruta para comenzar.
      </div>
    `;

    box.querySelectorAll("button").forEach(button => {
      button.style.cssText =
        "padding:7px 10px;border:0;border-radius:6px;" +
        "background:#0f766e;color:white;cursor:pointer";
    });

    panelTarget.appendChild(box);
    driveControls = box;

    const speed = box.querySelector("#driveSpeed3d");

    speed.addEventListener("input", () => {
      box.querySelector("#driveSpeedValue3d").textContent =
        `${speed.value} km/h`;
    });

    box.querySelector("#driveStart3d").addEventListener("click", startDriveRoute);
    box.querySelector("#drivePause3d").addEventListener("click", toggleDrivePause);
    box.querySelector("#driveStop3d").addEventListener("click", () => {
      stopDriveRoute(true);
    });
  }

  function setDriveStatus(message) {
    const el = document.getElementById("driveStatus3d");
    if (el) el.textContent = message;
  }

  function setDriveButtons(running) {
    const start = document.getElementById("driveStart3d");
    const pause = document.getElementById("drivePause3d");
    const stop = document.getElementById("driveStop3d");

    if (start) start.disabled = running;
    if (pause) pause.disabled = !running;
    if (stop) stop.disabled = !running;

    if (pause) pause.textContent = drivePaused ? "Continuar" : "Pausar";
  }

  function startDriveRoute() {
    if (!map3d || !map3d.isStyleLoaded()) {
      setDriveStatus("El mapa todavía no está listo.");
      return;
    }

    if (!selectedRoute) {
      setDriveStatus("Selecciona primero una ruta en el selector 3D.");
      return;
    }

    stopDriveRoute(false);

    const coords = coordinatesFromGeoJSON(selectedRoute.data).filter(c =>
      Array.isArray(c) &&
      Number.isFinite(c[0]) &&
      Number.isFinite(c[1]) &&
      Math.abs(c[0]) <= 180 &&
      Math.abs(c[1]) <= 90
    );

    if (coords.length < 2) {
      setDriveStatus("La ruta no contiene suficientes coordenadas válidas.");
      return;
    }

    drivePath = [{ coord: coords[0], distance: 0 }];
    driveTotalDistance = 0;

    for (let i = 1; i < coords.length; i++) {
      const segmentLength = haversine(coords[i - 1], coords[i]);
      if (!Number.isFinite(segmentLength) || segmentLength <= 0) continue;

      driveTotalDistance += segmentLength;
      drivePath.push({
        coord: coords[i],
        distance: driveTotalDistance
      });
    }

    if (drivePath.length < 2 || driveTotalDistance < 1) {
      setDriveStatus("No se pudo calcular la distancia de la ruta.");
      return;
    }

    driveSavedCamera = {
      center: map3d.getCenter().toArray(),
      zoom: map3d.getZoom(),
      pitch: map3d.getPitch(),
      bearing: map3d.getBearing()
    };

    driveDistance = 0;
    driveLastFrameTime = 0;
    driveActive = true;
    drivePaused = false;

    setDriveButtons(true);
    setDriveStatus(`Preparando recorrido: ${selectedRoute.name}`);

    driveAnimationFrame = requestAnimationFrame(animateDriveRoute);
  }

  function toggleDrivePause() {
    if (!driveActive) return;

    drivePaused = !drivePaused;
    driveLastFrameTime = 0;
    setDriveButtons(true);

    setDriveStatus(drivePaused ? "Recorrido pausado." : "Recorrido en marcha.");

    if (!drivePaused && driveAnimationFrame === null) {
      driveAnimationFrame = requestAnimationFrame(animateDriveRoute);
    }
  }

  function getDrivePosition(distance) {
    if (distance >= driveTotalDistance) {
      return drivePath[drivePath.length - 1].coord;
    }

    let low = 0;
    let high = drivePath.length - 1;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);

      if (drivePath[mid].distance < distance) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    const b = drivePath[low];
    const a = drivePath[Math.max(0, low - 1)];
    const segment = b.distance - a.distance;

    if (segment <= 0) return b.coord;

    const t = Math.max(0, Math.min(1, (distance - a.distance) / segment));

    return [
      a.coord[0] + (b.coord[0] - a.coord[0]) * t,
      a.coord[1] + (b.coord[1] - a.coord[1]) * t
    ];
  }

  function getDriveBearing(a, b) {
    const rad = value => value * Math.PI / 180;
    const deg = value => value * 180 / Math.PI;

    const lon1 = rad(a[0]);
    const lon2 = rad(b[0]);
    const lat1 = rad(a[1]);
    const lat2 = rad(b[1]);

    const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);

    return (deg(Math.atan2(y, x)) + 360) % 360;
  }

  function animateDriveRoute(timestamp) {
    driveAnimationFrame = null;

    if (!driveActive || drivePaused || !map3d) return;

    if (!driveLastFrameTime) driveLastFrameTime = timestamp;

    const elapsed = Math.min((timestamp - driveLastFrameTime) / 1000, 0.1);
    driveLastFrameTime = timestamp;

    const speedKmh = Number(
      document.getElementById("driveSpeed3d")?.value || 80
    );
    const speedMps = speedKmh / 3.6;

    driveDistance = Math.min(
      driveTotalDistance,
      driveDistance + speedMps * elapsed
    );

    const position = getDrivePosition(driveDistance);
    const terrainElevation = map3d.queryTerrainElevation(
  { lng: position[0], lat: position[1] },
  { exaggerated: false }
);

// MapLibre permite fijar la posición de la cámara en metros sobre el nivel del mar.
// Así la vista se sitúa aproximadamente a la altura de los ojos de un conductor,
// en lugar de simular la conducción únicamente con zoom y una inclinación extrema.
const groundElevation =
  terrainElevation != null && Number.isFinite(terrainElevation)
    ? terrainElevation
    : 0;

const lookAheadDistance = Math.min(
  CONFIG.vehicleLookAheadMeters,
  Math.max(4, driveTotalDistance - driveDistance)
);
const nextPosition = getDrivePosition(
  Math.min(driveTotalDistance, driveDistance + lookAheadDistance)
);
const bearing = getDriveBearing(position, nextPosition);

try {
  const camera = map3d.getFreeCameraOptions();
  camera.position = maplibregl.MercatorCoordinate.fromLngLat(
    { lng: position[0], lat: position[1] },
    groundElevation + CONFIG.vehicleCameraHeight
  );
  camera.lookAtPoint({
    lng: nextPosition[0],
    lat: nextPosition[1]
  });
  map3d.setFreeCameraOptions(camera);
} catch (cameraError) {
  // Respaldo compatible: mantener el seguimiento si el navegador/MapLibre
  // no permite usar la cámara libre.
  map3d.jumpTo({
    center: position,
    zoom: CONFIG.vehicleCameraZoom,
    pitch: 68,
    bearing
  });
}

const progress = Math.min(
  100,
  (driveDistance / driveTotalDistance) * 100
);

const elevationMessage =
  terrainElevation == null || !Number.isFinite(terrainElevation)
    ? ` · Altura cámara: ${CONFIG.vehicleCameraHeight.toFixed(1)} m (terreno estimado)`
    : ` · Terreno: ${terrainElevation.toFixed(1)} m · Cámara: ${(groundElevation + CONFIG.vehicleCameraHeight).toFixed(1)} m s. n. m.`;

setDriveStatus(
  `${selectedRoute.name} · ${speedKmh} km/h · ` +
  `${progress.toFixed(0)} % · ` +
  `${(driveDistance / 1000).toFixed(2)} / ` +
  `${(driveTotalDistance / 1000).toFixed(2)} km` +
  elevationMessage
);
    if (driveDistance >= driveTotalDistance) {
      stopDriveRoute(true, true);
      return;
    }

    driveAnimationFrame = requestAnimationFrame(animateDriveRoute);
  }

  function stopDriveRoute(restoreCamera = true, completed = false) {
    if (driveAnimationFrame !== null) {
      cancelAnimationFrame(driveAnimationFrame);
      driveAnimationFrame = null;
    }

    const wasActive = driveActive;

    driveActive = false;
    drivePaused = false;
    driveLastFrameTime = 0;

    setDriveButtons(false);

    if (restoreCamera && wasActive && map3d && driveSavedCamera) {
      map3d.easeTo({
        center: driveSavedCamera.center,
        zoom: driveSavedCamera.zoom,
        pitch: driveSavedCamera.pitch,
        bearing: driveSavedCamera.bearing,
        duration: 700
      });
    }

    if (completed) {
      setDriveStatus("Recorrido finalizado. Vista anterior restaurada.");
    } else if (wasActive && restoreCamera) {
      setDriveStatus("Recorrido detenido. Vista anterior restaurada.");
    }
  }
  
  function focusRoute(route) {
    const coords = coordinatesFromGeoJSON(route.data).filter(c => Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90);
    if (!coords.length) { setStatus("Esta ruta no parece estar en EPSG:4326. Reproyecta sus coordenadas antes de visualizarla."); return; }
    const bounds = coords.reduce((b,c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
    map3d.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 40, right: 360 }, duration: 700, maxZoom: 16 });
  }
  $("fitRoute3d")?.addEventListener("click", () => selectedRoute && focusRoute(selectedRoute));
   $("showAllRoutes3d")?.addEventListener("click", () => {
    if (!map3d) return;

    selectedRoute = null;

    const select = $("routeSelect3d");
    if (select) select.value = "";

    updateSelectedRouteStyle();
    clearProfile("Selecciona una ruta para calcular su perfil de elevación.");

    map3d.easeTo({
      center: CONFIG.center,
      zoom: CONFIG.zoom,
      pitch: CONFIG.cameraPitch,
      bearing: CONFIG.cameraBearing,
      duration: 700
    });

    setStatus(`${routes.length} rutas cargadas. Selecciona una para analizarla.`);
  });

  async function calculateProfile(route) {
    const coords = coordinatesFromGeoJSON(route.data).filter(c => Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90);
    if (coords.length < 2) { setStatus("La ruta no tiene suficientes coordenadas válidas en EPSG:4326."); return; }
    if (!map3d || !terrainAvailable || typeof map3d.queryTerrainElevation !== "function") {
      clearProfile("Perfil no disponible: verifica que el DEM Terrarium RGB cargue en dem_tiles/{z}/{x}/{y}.png."); return;
    }
    setStatus("Calculando perfil de elevación…");
    // Interpola puntos a lo largo de los segmentos, máximo 1000 muestras por ruta.
    const samples = densify(coords, 1000);
    const profile = [];
    let distance = 0, gain = 0, loss = 0, maxSlope = 0, prev = null;
    for (const p of samples) {
      if (prev) distance += haversine(prev, p);
      const elevation = map3d.queryTerrainElevation({ lng: p[0], lat: p[1] }, { exaggerated: false });
      if (elevation == null || !Number.isFinite(elevation)) { clearProfile("El DEM no devolvió elevación para algunos puntos. Revisa cobertura/zoom de las teselas."); return; }
      if (profile.length && prev) {
        const delta = elevation - profile[profile.length - 1].elevation;
        if (delta > 0) gain += delta; else loss += Math.abs(delta);
        const segment = haversine(prev, p);
        if (segment > 0) maxSlope = Math.max(maxSlope, Math.abs(delta / (segment * 1000) * 100));
      }
      profile.push({ distance, elevation, coord: p });
      prev = p;
    }
    lastProfile = profile;
    $("distance3d").textContent = `${(distance / 1000).toFixed(2)} km`;
    $("gain3d").textContent = `${gain.toFixed(0)} m`;
    $("loss3d").textContent = `${loss.toFixed(0)} m`;
    $("slope3d").textContent = `${maxSlope.toFixed(1)} %`;
    drawProfile(profile);
    setStatus(`Perfil calculado: ${profile.length} muestras. Pendiente máxima absoluta estimada: ${maxSlope.toFixed(1)}%.`);
  }
  function densify(coords, maxSamples) {
    const result = [coords[0]];
    const totalSegments = coords.length - 1;
    const perSegment = Math.max(1, Math.floor(maxSamples / Math.max(1, totalSegments)));
    for (let i = 0; i < totalSegments; i++) {
      const a = coords[i], b = coords[i+1];
      for (let j = 1; j <= perSegment; j++) {
        const t = j / perSegment;
        result.push([a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t]);
      }
    }
    return result.slice(0, maxSamples);
  }
  function haversine(a,b) {
    const rad = d => d * Math.PI / 180, R = 6371000;
    const dLat = rad(b[1]-a[1]), dLon = rad(b[0]-a[0]);
    const x = Math.sin(dLat/2)**2 + Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(dLon/2)**2;
    return 2*R*Math.asin(Math.sqrt(x));
  }
  function clearProfile(message) {
    lastProfile = [];
    ["distance3d","gain3d","loss3d","slope3d"].forEach(id => { if ($(id)) $(id).textContent = "—"; });
    const c = $("profile3d"); if (c) c.getContext("2d").clearRect(0,0,c.width,c.height);
    setStatus(message);
  }
  function drawProfile(profile) {
    const canvas = $("profile3d"), ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height, pad = 38;
    ctx.clearRect(0,0,w,h); ctx.fillStyle = "#fff"; ctx.fillRect(0,0,w,h);
    const minE = Math.min(...profile.map(p=>p.elevation)), maxE = Math.max(...profile.map(p=>p.elevation));
    const range = Math.max(1, maxE-minE), maxD = Math.max(1, profile[profile.length-1].distance);
    ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 1;
    for(let i=0;i<4;i++){ const y=pad+(h-pad*1.5)*i/3; ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(w-10,y);ctx.stroke(); }
    ctx.strokeStyle = "#0f766e"; ctx.lineWidth = 2.5; ctx.beginPath();
    profile.forEach((p,i)=>{const x=pad+(w-pad-12)*p.distance/maxD;const y=h-pad-(h-pad*1.5)*(p.elevation-minE)/range;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();
    ctx.fillStyle="#334155";ctx.font="11px sans-serif";ctx.fillText(`${minE.toFixed(0)} m`,2,h-pad);ctx.fillText(`${maxE.toFixed(0)} m`,2,pad);ctx.fillText("0 km",pad,h-8);ctx.fillText(`${(maxD/1000).toFixed(1)} km`,w-65,h-8);
  }
})();
