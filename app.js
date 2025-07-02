// 1. CONFIGURACIÓN DE USUARIOS Y CAMPOS

// Usuarios autorizados con sus claves
const usuarios = {
  admin: "1234",
  kevin: "admin2025"
};

// Campos que forman parte de cada registro de personal
const campos = [
  "CODIGO", "NOMBRE", "RUTA", "CEDULA", "TELEFONO", "DISCAPACIDAD", "TIPO HORARIO",
  "CARGO", "AREA", "MODALIDAD DE CONTRATO", "DIRECCION", "HORARIO", "LUGAR TRABAJO",
  "LONGITUD", "LATITUD", "CONTRATO LUZ", "TRANSPORTE"
];

// Variables globales
let geojsonData = null;             // Almacena los datos cargados desde el GeoJSON
let usuarioLogueado = false;        // Controla si el usuario está autenticado
let geojsonLayer = null;            // Capa de puntos en el mapa
const capasOverlay = {};            // Capa de rutas agrupadas por tipo (entrada/salida)


// 2. INICIALIZACIÓN DEL MAPA LEAFLET

// Crea el mapa centrado en Quito con nivel de zoom 13
const map = L.map('map').setView([-0.180653, -78.467838], 13);

// Agrega la capa base

// OpenStreetMap
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
});

// Esri World Imagery
const esriSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles © Esri'
});

// Google Streets (requiere plugin GoogleMutant más abajo)
let googleStreets; // se define después al cargar el plugin

// Crear el mapa con capa base inicial
const map = L.map('map', {
  center: [-0.180653, -78.467838],
  zoom: 13,
  layers: [osm] // Capa base inicial
});

// Diccionario de mapas base
const baseMaps = {
  "OpenStreetMap": osm,
  "Esri Satelital": esriSat,
  // Google Streets se añadirá dinámicamente
};

// 3. CARGAR ARCHIVO GEOJSON DE PERSONAL DESDE GITHUB

fetch('https://raw.githubusercontent.com/pinwii21/IDE-TRANSPORTE/main/BASE_DATOS_TRANSPORTE_2025.geojson')
  .then(res => res.json())
  .then(data => {
    data.features.forEach((f, i) => f._id = i);  // Se asigna un ID único a cada feature
    geojsonData = data;                          // Se guarda el dataset para uso global
    crearCamposFormulario();                     // Se generan los inputs del formulario
    mostrarTabla(data);                          // Se muestra la tabla de personal
    mostrarMapa(data);                           // Se dibujan los puntos en el mapa
    centrarMapa(data);                           // Se ajusta el mapa para mostrar todos los puntos
    actualizarListaPersonas(data.features);      // Se actualiza el select de personas
  });


// 4. CARGAR RUTAS DE ENTRADA Y SALIDA DESDE CARPETAS EN GITHUB

const carpetas = [
  { dir: 'Rutas_de_ENTRADA', name: 'Rutas de ENTRADA', color: '#28a745' },
  { dir: 'Rutas_de_SALIDA', name: 'Rutas de SALIDA', color: '#dc3545' }
];

async function cargarIndexYCapas() {
  for (const { dir, name, color } of carpetas) {
    try {
      // Obtiene el índice de archivos (index.json) dentro de cada carpeta
      const indexUrl = `https://raw.githubusercontent.com/pinwii21/IDE-TRANSPORTE/main/${dir}/index.json`;
      const idxRes = await fetch(indexUrl);
      if (!idxRes.ok) throw new Error(`No se pudo cargar: ${indexUrl}`);

      const lista = await idxRes.json();  // Lista de archivos GeoJSON
      const grupo = L.layerGroup();       // Grupo de capas para esa categoría

      for (const fichero of lista) {
        try {
          // Construye la URL completa de cada ruta
          const geojsonUrl = `https://raw.githubusercontent.com/pinwii21/IDE-TRANSPORTE/main/${dir}/${fichero}`;
          const res = await fetch(geojsonUrl);
          if (!res.ok) throw new Error(`Error al cargar: ${geojsonUrl}`);
          const data = await res.json();

          // Crea una capa para la ruta con estilo personalizado
          const capa = L.geoJSON(data, {
            style: { color, weight: 3 },
            onEachFeature: (feature, layer) => {
              // Genera un popup con la información de la ruta
              let popup = `<b>${fichero}</b><br>`;
              for (const k in feature.properties) {
                popup += `<b>${k}:</b> ${feature.properties[k]}<br>`;
              }
              layer.bindPopup(popup);
            }
          });

          capa._nombreArchivo = fichero;  // Guarda el nombre del archivo para poder filtrar
          capa.addTo(grupo);              // Agrega la capa al grupo correspondiente
        } catch (error) {
          console.warn(`Error en ${fichero}:`, error.message);
        }
      }

      capasOverlay[name] = grupo;   // Agrega el grupo al objeto global
      grupo.addTo(map);             // Muestra el grupo en el mapa
    } catch (error) {
      console.error(`Error en carpeta ${dir}:`, error.message);
    }
  }

  // Agrega control para alternar visibilidad de grupos de rutas
L.control.layers(baseMaps, capasOverlay, { collapsed: false }).addTo(map);
}

cargarIndexYCapas();  // Ejecuta la función al cargar la página


// FILTRAR RUTAS POR TEXTO (nombre del archivo)
const inputFiltroRuta = document.getElementById("filterRouteInput");
if (inputFiltroRuta) {
  inputFiltroRuta.addEventListener("input", () => {
    const texto = inputFiltroRuta.value.toLowerCase();

    for (const grupoNombre in capasOverlay) {
      const grupo = capasOverlay[grupoNombre];
      grupo.eachLayer(capa => {
        const visible = (capa._nombreArchivo || "").toLowerCase().includes(texto);
        if (visible) {
          if (!map.hasLayer(capa)) capa.addTo(map);
        } else {
          if (map.hasLayer(capa)) map.removeLayer(capa);
        }
      });
    }
  });
}


// 5. CREAR CAMPOS DEL FORMULARIO DE NUEVO PERSONAL
function crearCamposFormulario() {
  const cont = document.getElementById('camposForm');
  cont.innerHTML = '';
  campos.forEach(campo => {
    const label = document.createElement('label');
    label.textContent = campo + ':';
    const input = document.createElement('input');
    input.id = campo;
    input.type = 'text';
    input.required = ["CODIGO", "NOMBRE", "LATITUD", "LONGITUD"].includes(campo);
    label.appendChild(input);
    cont.appendChild(label);
  });
}


// 6. MOSTRAR TABLA DE PERSONAL EDITABLE (SI SE INICIÓ SESIÓN)
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

  if (usuarioLogueado) asignarEventosEdicion();  // Permite editar si hay sesión iniciada
}


// 7. DETECTAR CAMBIOS EN LAS CELDAS Y ACTUALIZAR DATOS GEOJSON
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


// 8. MOSTRAR PUNTOS DE PERSONAL EN EL MAPA
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


// 9. CENTRAR EL MAPA A TODOS LOS PUNTOS
function centrarMapa(data) {
  if (!data.features.length) return;
  const coords = data.features.map(f => f.geometry?.coordinates).filter(c => Array.isArray(c));
  const lats = coords.map(c => c[1]);
  const lngs = coords.map(c => c[0]);
  const bounds = [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]];
  map.fitBounds(bounds, { padding: [40, 40] });
}


// 10. FILTRAR PERSONAL POR CAMPO Y TEXTO
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


// 11. ACTUALIZAR SELECT CON LISTA DE PERSONAS
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


// 12. LOGIN Y LOGOUT DE USUARIOS
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const usuario = document.getElementById('usuario').value.trim();
    const clave = document.getElementById('clave').value.trim();

    if (usuarios[usuario] && usuarios[usuario] === clave) {
      usuarioLogueado = true;
      document.getElementById('loginContainer').style.display = 'none';
      document.getElementById('addForm').style.display = 'block';
      document.getElementById('logoutBtn').style.display = 'inline-block';
      mostrarTabla(geojsonData);
    } else {
      alert('Usuario o clave incorrectos');
    }
  });
}

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    usuarioLogueado = false;
    document.getElementById('loginContainer').style.display = 'block';
    document.getElementById('addForm').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'none';
    mostrarTabla(geojsonData);
  });
}


// 13. AGREGAR NUEVO PERSONAL
const addForm = document.getElementById('addForm');
if (addForm) {
  addForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const nuevo = {};
    let valid = true;

    for (const campo of campos) {
      const val = document.getElementById(campo).value.trim();
      if (["CODIGO", "NOMBRE", "LATITUD", "LONGITUD"].includes(campo) && !val) {
        alert(`El campo ${campo} es obligatorio`);
        valid = false;
        break;
      }
      nuevo[campo] = val.toUpperCase();
    }

    if (!valid) return;

    const lat = parseFloat(nuevo["LATITUD"]);
    const lng = parseFloat(nuevo["LONGITUD"]);
    if (isNaN(lat) || isNaN(lng)) {
      alert("LATITUD y LONGITUD deben ser números válidos");
      return;
    }

    const nuevoFeature = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: nuevo,
      _id: geojsonData.features.length
    };

    geojsonData.features.push(nuevoFeature);
    mostrarTabla(geojsonData);
    mostrarMapa(geojsonData);
    centrarMapa(geojsonData);
    actualizarListaPersonas(geojsonData.features);

    document.getElementById('addForm').reset();
  });
}



