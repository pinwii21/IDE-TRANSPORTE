// === CONFIGURACIÓN GENERAL ===

// Usuarios permitidos
const usuarios = {
  admin: "1234",
  kevin: "admin2025"
};

// Campos a mostrar en el formulario y tabla
const campos = [
  "CODIGO TRABAJADOR", "NOMBRE", "RUTA", "CEDULA", "TELEFONO", "DISCAPACIDAD", "HORARIO DE TRABAJO",
  "LUGAR DE TRABAJO","AREA", "DIRECCION", "SUBSIDIO DE TRANSPORTE", "LATITUD", "LONGITUD", "VERIFICACION", 
];

// Variables globales
let geojsonData = null;
let usuarioLogueado = false;
let geojsonLayer = null;
const capasOverlay = {};


// === INICIALIZACIÓN DEL MAPA LEAFLET ===

// Capas base
const osmBase = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors', maxZoom: 19
});

const googlemaps = L.tileLayer('https://mt1.google.com/vt/lyrs=r&x={x}&y={y}&z={z}', {
  attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community', maxZoom: 25
});

const googleBase = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
  attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community', maxZoom: 25
});

// Crear mapa centrado en Quito
const map = L.map('map', {
  center: [-0.180653, -78.467838],
  zoom: 13,
  layers: [osmBase]
});

const mapasBase = {
  "OpenStreetMap": osmBase,
  "Google Maps": googlemaps,
  "Google Satelital": googleBase
};


// === CARGAR DATOS GEOJSON PRINCIPAL ===
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


// === CARGAR RUTAS DE ENTRADA Y SALIDA ===
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
        try {
          const geojsonUrl = `https://raw.githubusercontent.com/pinwii21/IDE-TRANSPORTE/main/${dir}/${fichero}`;
          const res = await fetch(geojsonUrl);
          if (!res.ok) throw new Error(`Error al cargar: ${geojsonUrl}`);
          const data = await res.json();

          const capa = L.geoJSON(data, {
            style: { color, weight: 3 },
            onEachFeature: (feature, layer) => {
              let popup = `<b>${fichero}</b><br>`;
              for (const k in feature.properties) {
                popup += `<b>${k}:</b> ${feature.properties[k]}<br>`;
              }
              layer.bindPopup(popup);
            }
          });

          capa._nombreArchivo = fichero;
          capa.addTo(grupo);
        } catch (error) {
          console.warn(`Error en ${fichero}:`, error.message);
        }
      }

      capasOverlay[name] = grupo;
      grupo.addTo(map);
    } catch (error) {
      console.error(`Error en carpeta ${dir}:`, error.message);
    }
  }

  L.control.layers(mapasBase, capasOverlay, { collapsed: false }).addTo(map);
  inicializarFiltrosRutas();
}
cargarIndexYCapas();


// === FUNCIONES PARA MOSTRAR FORMULARIO Y TABLA ===
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
  crearTogglesColumnas();
  if (usuarioLogueado) asignarEventosEdicion();
}

// === 7. EDICIÓN EN TABLA ===
// Permite editar los valores directamente en la tabla si el usuario está logueado
function asignarEventosEdicion() {
  document.querySelectorAll('td[contenteditable="true"]').forEach(td => {
    td.addEventListener('input', () => {
      const id = parseInt(td.dataset.featureId);
      const campo = td.dataset.attr;
      const valor = td.textContent.trim().toUpperCase();
      const feature = geojsonData.features.find(f => f._id === id);
      if (!feature) return;

      // Actualiza la propiedad correspondiente
      feature.properties[campo] = valor;

      // Si se edita latitud o longitud, actualizar la geometría del punto y refrescar el mapa
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
// === 8. MOSTRAR MAPA DE PUNTOS ===
// === 8. MOSTRAR MAPA DE PUNTOS ===
function mostrarMapa(data) {
  if (geojsonLayer) map.removeLayer(geojsonLayer);
  geojsonLayer = L.geoJSON(data, {
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
      radius: 6,
      fillColor: getComputedStyle(document.documentElement).getPropertyValue('--color-primario').trim() || '#004d99',
      color: "#000",
      weight: 1,
      opacity: 1,
      fillOpacity: 0.9
    }),
    onEachFeature: (feature, layer) => {
      let popup = '';
      for (const key in feature.properties) {
        popup += `<b>${key}:</b> ${feature.properties[key]}<br>`;
      }
      layer.bindPopup(popup);

      layer.on('click', () => {
        const row = document.querySelector(`td[data-feature-id='${feature._id}']`);
        if (row) {
          const tr = row.closest('tr');
          document.querySelectorAll("#tabla tr").forEach(r => r.classList.remove("resaltado"));
          tr.classList.add("resaltado");
          tr.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    }
  }).addTo(map);
}

// === 9. CENTRAR MAPA EN LOS PUNTOS VISIBLES ===
// Ajusta la vista para mostrar todos los puntos
function centrarMapa(data) {
  if (!data.features.length) return;
  const coords = data.features.map(f => f.geometry?.coordinates).filter(c => Array.isArray(c));
  if (coords.length === 0) return;
  const lats = coords.map(c => c[1]);
  const lngs = coords.map(c => c[0]);
  const bounds = [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)]
  ];
  map.fitBounds(bounds, { padding: [40, 40] });
}

// === 10. FILTRO DOBLE DE PERSONAL ===
// Referencias a inputs y select para filtros
const searchInput1 = document.getElementById("searchInput1");
const filterField1 = document.getElementById("filterField1");
const searchInput2 = document.getElementById("searchInput2");
const filterField2 = document.getElementById("filterField2");

// Referencias a los datalist para autocompletar filtros
const suggestions1 = document.getElementById("suggestions1");
const suggestions2 = document.getElementById("suggestions2");

// Escuchar cambios para filtrar datos
searchInput1.addEventListener("input", filtrarDatos);
filterField1.addEventListener("change", () => {
  actualizarSugerencias(filterField1.value, suggestions1);
  filtrarDatos();
});
searchInput2.addEventListener("input", filtrarDatos);
filterField2.addEventListener("change", () => {
  actualizarSugerencias(filterField2.value, suggestions2);
  filtrarDatos();
});

// Función que filtra los datos según los dos filtros activos
function filtrarDatos() {
  const campo1 = filterField1.value;
  const texto1 = searchInput1.value.toLowerCase();

  const campo2 = filterField2.value;
  const texto2 = searchInput2.value.toLowerCase();

  const filtrados = geojsonData.features.filter(f => {
    const valor1 = (f.properties[campo1] || "").toLowerCase();
    const cumpleFiltro1 = valor1.includes(texto1);

    let cumpleFiltro2 = true;
    if (campo2 && texto2) {
      const valor2 = (f.properties[campo2] || "").toLowerCase();
      cumpleFiltro2 = valor2.includes(texto2);
    }

    return cumpleFiltro1 && cumpleFiltro2;
  });

  const dataset = { type: "FeatureCollection", features: filtrados };
  mostrarTabla(dataset);
  mostrarMapa(dataset);
  centrarMapa(dataset);
  actualizarListaPersonas(filtrados);
}

// Actualiza el datalist con valores únicos para ayudar en el autocompletado
function actualizarSugerencias(campo, datalistElement) {
  if (!campo || !geojsonData) return;

  // Obtiene valores únicos del campo
  const valoresUnicos = [...new Set(
    geojsonData.features.map(f => f.properties[campo]).filter(v => v != null)
  )].sort();

  // Limpia y rellena el datalist
  datalistElement.innerHTML = "";
  valoresUnicos.forEach(valor => {
    const option = document.createElement("option");
    option.value = valor;
    datalistElement.appendChild(option);
  });
}

// Inicializa sugerencias al cargar si ya hay campos seleccionados
if (filterField1.value) actualizarSugerencias(filterField1.value, suggestions1);
if (filterField2.value) actualizarSugerencias(filterField2.value, suggestions2);

// === 11. ACTUALIZAR SELECT DE PERSONAS ===
// Llena el select con las personas filtradas o todas
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

// === 12. LOGIN / LOGOUT ===
// Manejo de formulario de login para mostrar/ocultar funciones según usuario logueado
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
      const descargarBtn = document.getElementById("descargarGeoJSONBtn");
      if (descargarBtn) descargarBtn.style.display = 'inline-block';
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
    const descargarBtn = document.getElementById("descargarGeoJSONBtn");
    if (descargarBtn) descargarBtn.style.display = 'none';
    mostrarTabla(geojsonData);
  });
}

// === 13. AGREGAR NUEVO PERSONAL ===
// Captura datos del formulario, valida y agrega un nuevo punto/persona al GeoJSON y actualiza vistas
const addForm = document.getElementById('addForm');
if (addForm) {
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nuevo = {};
    let valid = true;

    // Recorre todos los campos y valida los obligatorios
    for (const campo of campos) {
      const val = document.getElementById(campo).value.trim();
      if (["CODIGO TRABAJADOR", "NOMBRE", "LATITUD", "LONGITUD"].includes(campo) && !val) {
        alert(`El campo ${campo} es obligatorio`);
        valid = false;
        break;
      }
      nuevo[campo] = val.toUpperCase();
    }

    if (!valid) return;

    // Valida latitud y longitud como números
    const lat = parseFloat(nuevo["LATITUD"]);
    const lng = parseFloat(nuevo["LONGITUD"]);
    if (isNaN(lat) || isNaN(lng)) {
      alert("LATITUD y LONGITUD deben ser números válidos");
      return;
    }

    // Construye la nueva feature
    const nuevoFeature = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: nuevo,
      _id: geojsonData.features.length
    };

    // Agrega al dataset y actualiza vistas
    geojsonData.features.push(nuevoFeature);
    mostrarTabla(geojsonData);
    mostrarMapa(geojsonData);
    centrarMapa(geojsonData);
    actualizarListaPersonas(geojsonData.features);

    addForm.reset();
    alert("Nuevo personal agregado correctamente. Ahora puedes descargar el archivo actualizado.");
  });
}

// === 14. DESCARGAR GEOJSON ACTUALIZADO ===
// Permite descargar el archivo GeoJSON actualizado con los datos editados o nuevos
function descargarGeoJSON() {
  if (!geojsonData) return;
  const blob = new Blob([JSON.stringify(geojsonData, null, 2)], { type: "application/geo+json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "BASE_DATOS_TRANSPORTE_2025_actualizado.geojson";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const descargarBtn = document.getElementById('descargarGeoJSONBtn');
if (descargarBtn) {
  descargarBtn.addEventListener('click', descargarGeoJSON);
}

// === 15. FILTRO DOBLE AUTOMÁTICO EN RUTAS ===
// Inicializa filtros para las capas de rutas (entrada y salida) y permite filtrar según dos atributos y sus valores
function inicializarFiltrosRutas() {
  const camposFiltro = ["RUTA", "NUMERO_RUTA", "HORARIO", "DESTINO", "TIPO_UNIDAD", "FRECUENCIA", "TIPO_HORARIO", "KM", "KM_ACT"];
  const campo1 = document.getElementById("campo1");
  const campo2 = document.getElementById("campo2");
  const valor1 = document.getElementById("valor1");
  const valor2 = document.getElementById("valor2");

  // Llena los selects con las opciones de campos disponibles
  camposFiltro.forEach(c => {
    const opt1 = document.createElement("option");
    const opt2 = document.createElement("option");
    opt1.value = c;
    opt2.value = c;
    opt1.textContent = c;
    opt2.textContent = c;
    campo1.appendChild(opt1);
    campo2.appendChild(opt2);
  });

  // Eventos para actualizar opciones y aplicar filtros encadenados
  campo1.addEventListener("change", () => {
    actualizarValoresFiltro(campo1.value, valor1, () => {
      actualizarValoresFiltro(campo2.value, valor2, aplicarFiltroMultiple);
    });
  });

  campo2.addEventListener("change", () => {
    actualizarValoresFiltro(campo2.value, valor2, aplicarFiltroMultiple);
  });

  valor1.addEventListener("change", () => {
    actualizarValoresFiltro(campo2.value, valor2, aplicarFiltroMultiple);
  });

  valor2.addEventListener("change", aplicarFiltroMultiple);

  // Actualiza los valores posibles para un campo dado, tomando en cuenta el filtro primario
  function actualizarValoresFiltro(campo, selectDestino, callback) {
    if (!campo) return;
    const valores = new Set();

    for (const grupo of Object.values(capasOverlay)) {
      grupo.eachLayer(capa => {
        // Algunos grupos pueden tener subcapas, iteramos recursivamente
        if (!capa.feature && capa.eachLayer) {
          capa.eachLayer(layer => {
            const props = layer.feature?.properties || {};

            // Aplicar filtro primario para refinar valores posibles en el segundo filtro
            const filtroPrimario = campo1.value;
            const valorPrimario = valor1.value;
            if (filtroPrimario && valorPrimario && campo !== filtroPrimario) {
              const match = (props[filtroPrimario] || "").toLowerCase() === valorPrimario.toLowerCase();
              if (!match) return;
            }

            const valor = props[campo];
            if (valor) valores.add(valor);
          });
        }
      });
    }

    selectDestino.innerHTML = '<option value="">-- Todos --</option>';
    [...valores].sort().forEach(v => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      selectDestino.appendChild(opt);
    });

    if (callback) callback();
  }

  // Aplica el filtro para mostrar solo las capas que coinciden con ambos filtros
  function aplicarFiltroMultiple() {
    const c1 = campo1.value;
    const v1 = valor1.value;
    const c2 = campo2.value;
    const v2 = valor2.value;

    for (const grupo of Object.values(capasOverlay)) {
      grupo.eachLayer(capa => {
        if (!capa.feature && capa.eachLayer) {
          capa.eachLayer(layer => {
            const props = layer.feature?.properties || {};
            const visible1 = !v1 || (props[c1] + '').toLowerCase() === v1.toLowerCase();
            const visible2 = !v2 || (props[c2] + '').toLowerCase() === v2.toLowerCase();
            const visible = visible1 && visible2;

            if (visible) {
              if (!map.hasLayer(layer)) layer.addTo(map);
            } else {
              if (map.hasLayer(layer)) map.removeLayer(layer);
            }
          });
        }
      });
    }
  }
}

// === 16. FUNCIONES PARA TOGGLE DE COLUMNAS EN TABLA ===
// Muestra u oculta el menú de columnas
function toggleColumnMenu() {
  const menu = document.getElementById("columnMenu");
  menu.style.display = menu.style.display === "none" || !menu.style.display ? "block" : "none";
}

// Crea un listado de checkboxes para mostrar/ocultar columnas en la tabla
function crearTogglesColumnas() {
  const contenedor = document.getElementById("columnToggles");
  if (!contenedor) return;
  contenedor.innerHTML = "";

  campos.forEach((campo, i) => {
    const label = document.createElement("label");
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.gap = "8px";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.dataset.colIndex = i + 1; // +1 porque la primera columna es #

    // Al cambiar checkbox se oculta o muestra la columna respectiva
    checkbox.addEventListener("change", () => {
      const colIndex = parseInt(checkbox.dataset.colIndex);
      document.querySelectorAll(`#tabla table tr`).forEach(row => {
        const celda = row.children[colIndex];
        if (celda) celda.style.display = checkbox.checked ? "" : "none";
      });
    });

    label.appendChild(checkbox);
    label.append(document.createTextNode(campo));
    contenedor.appendChild(label);
  });
}



