// 1. CONFIGURACIÓN DE USUARIOS Y CAMPOS
const usuarios = {
  admin: "1234",
  kevin: "admin2025"
};

const campos = [
  "CODIGO", "NOMBRE", "RUTA", "CEDULA", "TELEFONO", "DISCAPACIDAD", "TIPO HORARIO",
  "CARGO", "AREA", "MODALIDAD DE CONTRATO", "DIRECCION", "HORARIO", "LUGAR TRABAJO",
  "LONGITUD", "LATITUD", "CONTRATO LUZ", "TRANSPORTE"
];

// Variables globales
let geojsonData = null;
let usuarioLogueado = false;
let geojsonLayer = null;
const capasOverlay = {};

// 2. INICIALIZACIÓN DEL MAPA LEAFLET
const map = L.map('map').setView([-0.180653, -78.467838], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap'
}).addTo(map);

// 3. CARGAR GEOJSON PRINCIPAL
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

// 4. CARGAR RUTAS (ENTRADA Y SALIDA)
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

  L.control.layers(null, capasOverlay, { collapsed: false }).addTo(map);
  inicializarFiltrosRutas();
}
cargarIndexYCapas();

// 5. CAMPOS FORMULARIO
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

// 6. MOSTRAR TABLA
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

// 7. EDICIÓN EN TABLA
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

// 8. MOSTRAR MAPA DE PUNTOS
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

// 9. CENTRAR MAPA
function centrarMapa(data) {
  if (!data.features.length) return;
  const coords = data.features.map(f => f.geometry?.coordinates).filter(c => Array.isArray(c));
  const lats = coords.map(c => c[1]);
  const lngs = coords.map(c => c[0]);
  const bounds = [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]];
  map.fitBounds(bounds, { padding: [40, 40] });
}

// 10. FILTRO DE PERSONAL
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

// 11. ACTUALIZAR SELECT
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

// 12. LOGIN / LOGOUT
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

// 13. AGREGAR NUEVO PERSONAL
const addForm = document.getElementById('addForm');
if (addForm) {
  addForm.addEventListener('submit', async (e) => {
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
    alert("Nuevo personal agregado correctamente. Ahora puedes descargar el archivo actualizado.");
  });
}

// 14. DESCARGAR GEOJSON
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

// 15. FILTRO DOBLE AUTOMÁTICO EN RUTAS
function inicializarFiltrosRutas() {
  const camposFiltro = ["RUTA", "NUMERO_RUTA", "HORARIO", "DESTINO", "TIPO_UNIDAD", "FRECUENCIA", "TIPO_HORARIO", "KM", "KM_ACT"];
  const campo1 = document.getElementById("campo1");
  const campo2 = document.getElementById("campo2");
  const valor1 = document.getElementById("valor1");
  const valor2 = document.getElementById("valor2");

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

  function actualizarValoresFiltro(campo, selectDestino, callback) {
    if (!campo) return;
    const valores = new Set();

    for (const grupo of Object.values(capasOverlay)) {
      grupo.eachLayer(capa => {
        if (!capa.feature && capa.eachLayer) {
          capa.eachLayer(layer => {
            const props = layer.feature?.properties || {};

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
