// app.js

// 1. Configuración de usuarios y campos
const usuarios = {
  admin: "1234",
  kevin: "admin2025"
};

const campos = [
  "CODIGO", "NOMBRE", "RUTA", "CEDULA", "TELEFONO", "DISCAPACIDAD", "TIPO HORARIO",
  "CARGO", "AREA", "MODALIDAD DE CONTRATO", "DIRECCION", "HORARIO", "LUGAR TRABAJO",
  "LONGITUD", "LATITUD", "CONTRATO LUZ", "TRANSPORTE"
];

// 2. Variables globales
let geojsonData = null;
let usuarioLogueado = false;
let geojsonLayer = null;
const capasOverlay = {};

// 3. Inicializar mapa Leaflet
const map = L.map('map').setView([-0.180653, -78.467838], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap'
}).addTo(map);

// 4. Cargar GeoJSON de personal desde GitHub
fetch('https://raw.githubusercontent.com/pinwii21/IDE-TRANSPORTE/main/BASE_DATOS_TRANSPORTE_2025.geojson')
  .then(res => res.json())
  .then(data => {
    data.features.forEach((f, i) => f._id = i);
    geojsonData = data;
    crearCamposFormulario();
    mostrarTabla(data);
    mostrarMapa(data);
    centrarMapa(data);
    actualizarListaPersonas(data.features);
  });

// 5. Crear formulario de alta
function crearCamposFormulario() {
  const cont = document.getElementById('camposForm');
  cont.innerHTML = '';
  campos.forEach(campo => {
    const label = document.createElement('label');
    label.textContent = campo + ':';
    const input = document.createElement('input');
    input.id = campo;
    input.type = 'text';
    input.required = ["CODIGO","NOMBRE","LATITUD","LONGITUD"].includes(campo);
    label.appendChild(input);
    cont.appendChild(label);
  });
}

// 6. Mostrar tabla editable
function mostrarTabla(data) {
  const cont = document.getElementById('tabla');
  if (!data.features) return;

  let html = `<table><thead><tr><th>#</th>`;
  campos.forEach(c => html += `<th>${c}</th>`);
  html += `</tr></thead><tbody>`;

  data.features.forEach((f, i) => {
    html += `<tr><td>${i + 1}</td>`;
    campos.forEach(campo => {
      let val = f.properties[campo] || '';
      if (campo === "LATITUD") val = f.geometry?.coordinates[1] || '';
      if (campo === "LONGITUD") val = f.geometry?.coordinates[0] || '';
      html += `<td ${usuarioLogueado ? 'contenteditable="true"' : ''} data-feature-id="${f._id}" data-attr="${campo}">${val}</td>`;
    });
    html += `</tr>`;
  });

  html += `</tbody></table>`;
  cont.innerHTML = html;

  if (usuarioLogueado) asignarEventosEdicion();
}

// 7. Asignar edición en celdas
function asignarEventosEdicion() {
  document.querySelectorAll('td[contenteditable="true"]').forEach(td => {
    td.addEventListener('input', () => {
      const id = parseInt(td.dataset.featureId);
      const campo = td.dataset.attr;
      const valor = td.textContent.trim().toUpperCase();
      const feature = geojsonData.features.find(f => f._id === id);
      if (!feature) return;

      feature.properties[campo] = valor;
      if (campo === "LATITUD" || campo === "LONGITUD") {
        const lat = parseFloat(feature.properties["LATITUD"]);
        const lng = parseFloat(feature.properties["LONGITUD"]);
        if (!isNaN(lat) && !isNaN(lng)) {
          feature.geometry = { type: "Point", coordinates: [lng, lat] };
          mostrarMapa(geojsonData);
          centrarMapa(geojsonData);
        }
      }
    });
  });
}

// 8. Mostrar puntos en el mapa
function mostrarMapa(data) {
  if (geojsonLayer) map.removeLayer(geojsonLayer);
  geojsonLayer = L.geoJSON(data, {
    pointToLayer: (f, latlng) => L.circleMarker(latlng, {
      radius: 6,
      fillColor: getComputedStyle(document.documentElement).getPropertyValue('--color-primario').trim() || '#004d99',
      color: "#000",
      weight: 1,
      opacity: 1,
      fillOpacity: 0.9
    }),
    onEachFeature: (f, layer) => {
      let popup = '';
      for (const k in f.properties) {
        popup += `<b>${k}:</b> ${f.properties[k]}<br>`;
      }
      layer.bindPopup(popup);
    }
  }).addTo(map);
}

// 9. Centrar el mapa según datos
function centrarMapa(data) {
  if (!data.features.length) return;
  const coords = data.features.map(f => f.geometry?.coordinates).filter(c => Array.isArray(c));
  const lats = coords.map(c => c[1]);
  const lngs = coords.map(c => c[0]);
  const bounds = [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]];
  map.fitBounds(bounds, { padding: [40, 40] });
}

// 10. Filtrar datos
const searchInput = document.getElementById("searchInput");
const filterField = document.getElementById("filterField");
searchInput.addEventListener("input", filtrarDatos);
filterField.addEventListener("change", filtrarDatos);

function filtrarDatos() {
  const campo = filterField.value;
  const texto = searchInput.value.toLowerCase();
  const filtrados = geojsonData.features.filter(f => (f.properties[campo] || "").toLowerCase().includes(texto));
  const dataset = { type: "FeatureCollection", features: filtrados };
  mostrarTabla(dataset);
  mostrarMapa(dataset);
  centrarMapa(dataset);
  actualizarListaPersonas(filtrados);
}

// 11. Lista desplegable de personas
function actualizarListaPersonas(lista) {
  const select = document.getElementById("personSelect");
  if (!select) return;
  select.innerHTML = '<option value="">-- Selecciona persona --</option>';
  lista.forEach(f => {
    const nombre = f.properties?.NOMBRE || "SIN NOMBRE";
    const codigo = f.properties?.CODIGO || "SIN CÓDIGO";
    const value = f._id;
    const option = document.createElement("option");
    option.value = value;
    option.textContent = `${nombre} (${codigo})`;
    select.appendChild(option);
  });
}

// 12. Cargar rutas desde carpetas
const carpetas = [
  { dir: 'Rutas_de_ENTRADA', name: 'Rutas de ENTRADA', color: '#28a745' },
  { dir: 'Rutas_de_SALIDA', name: 'Rutas de SALIDA', color: '#dc3545' }
];

async function cargarIndexYCapas() {
  for (const { dir, name, color } of carpetas) {
    try {
      const indexUrl = `https://raw.githubusercontent.com/pinwii21/IDE-TRANSPORTE/main/${dir}/index.json`;
      const idxRes = await fetch(indexUrl);
      if (!idxRes.ok) throw new Error(`No se pudo cargar: ${indexUrl}`);

      const lista = await idxRes.json();
      const grupo = L.layerGroup();

      for (const fichero of lista) {
        const geojsonUrl = `https://raw.githubusercontent.com/pinwii21/IDE-TRANSPORTE/main/${dir}/${fichero}`;
        try {
          const r = await fetch(geojsonUrl);
          if (!r.ok) throw new Error(`Error al cargar: ${geojsonUrl}`);
          const data = await r.json();

          const layer = L.geoJSON(data, {
            style: { color, weight: 3 },
            onEachFeature: (feature, layer) => {
              let popup = `<b>${fichero}</b><br>`;
              for (const k in feature.properties) {
                popup += `<b>${k}:</b> ${feature.properties[k]}<br>`;
              }
              layer.bindPopup(popup);
            }
          });
          layer.addTo(grupo);
        } catch (err) {
          console.warn("GeoJSON inválido o no accesible:", err.message);
        }
      }

      capasOverlay[name] = grupo;
      grupo.addTo(map);
    } catch (err) {
      console.error(`Error en carpeta ${dir}:`, err.message);
    }
  }

  L.control.layers(null, capasOverlay, { collapsed: false }).addTo(map);
}

// Iniciar carga de rutas
cargarIndexYCapas();
