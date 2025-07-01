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
    html += `<tr><td>${i+1}</td>`;
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
  actualizarListaPersonas(filtrados); // ← actualizar el select también
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

// 12. Buscar y mostrar ruta más cercana al clickar en "Calcular"
document.getElementById("findRouteBtn").addEventListener("click", () => {
  const select = document.getElementById("personSelect");
  const selectedId = parseInt(select.value);

  if (isNaN(selectedId)) return alert("Selecciona una persona válida.");
  const persona = geojsonData.features.find(f => f._id === selectedId);
  if (!persona || !persona.geometry) return alert("No se encontró ubicación para esta persona.");

  const [lng, lat] = persona.geometry.coordinates;
  const punto = L.latLng(lat, lng);
  let distanciaMinima = Infinity;
  let rutaMasCercana = null;

  Object.values(capasOverlay).forEach(grupo => {
    grupo.eachLayer(layer => {
      if (layer instanceof L.GeoJSON) {
        layer.eachLayer(featureLayer => {
          if (featureLayer.getLatLngs) {
            const coords = featureLayer.getLatLngs().flat();
            coords.forEach(coord => {
              const d = punto.distanceTo(coord);
              if (d < distanciaMinima) {
                distanciaMinima = d;
                rutaMasCercana = featureLayer;
              }
            });
          }
        });
      }
    });
  });

  if (rutaMasCercana) {
    rutaMasCercana.setStyle({ color: "#ff9900", weight: 6 });
    map.fitBounds(rutaMasCercana.getBounds(), { padding: [30, 30] });
    alert("Ruta más cercana resaltada en naranja.");
  } else {
    alert("No se encontró ninguna ruta cercana.");
  }
});
