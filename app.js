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
      fillColor: getComputedStyle(document.documentElement)
                  .getPropertyValue('--color-primario').trim() || '#004d99',
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
  const coords = data.features
    .map(f => f.geometry?.coordinates)
    .filter(c => Array.isArray(c));
  const lats = coords.map(c => c[1]);
  const lngs = coords.map(c => c[0]);
  const bounds = [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)]
  ];
  map.fitBounds(bounds, { padding: [40, 40] });
}

// 10. Filtrar datos
document.getElementById("searchInput").addEventListener("input", filtrarDatos);
document.getElementById("filterField").addEventListener("change", filtrarDatos);

function filtrarDatos() {
  const campo = document.getElementById("filterField").value;
  const texto = document.getElementById("searchInput").value.toLowerCase();
  const filtrados = geojsonData.features.filter(f =>
    (f.properties[campo] || "").toLowerCase().includes(texto)
  );
  mostrarTabla({ type: "FeatureCollection", features: filtrados });
  mostrarMapa({ type: "FeatureCollection", features: filtrados });
  centrarMapa({ type: "FeatureCollection", features: filtrados });
}

// 11. Añadir nuevo personal
document.getElementById("addForm").addEventListener("submit", e => {
  e.preventDefault();
  const nuevo = {
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates: [0, 0] }
  };
  campos.forEach(c => {
    const val = document.getElementById(c).value.trim().toUpperCase();
    nuevo.properties[c] = val;
    if (c === "LONGITUD") nuevo.geometry.coordinates[0] = parseFloat(val);
    if (c === "LATITUD")  nuevo.geometry.coordinates[1] = parseFloat(val);
  });
  if (isNaN(nuevo.geometry.coordinates[0]) || isNaN(nuevo.geometry.coordinates[1])) {
    return alert("LATITUD o LONGITUD inválida.");
  }
  nuevo._id = geojsonData.features.length;
  geojsonData.features.push(nuevo);
  mostrarTabla(geojsonData);
  mostrarMapa(geojsonData);
  centrarMapa(geojsonData);
  e.target.reset();
});

// 12. Descargar GeoJSON
document.getElementById("downloadBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(geojsonData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "datos_personal.geojson";
  a.click();
  URL.revokeObjectURL(url);
});

// 13. Login / Logout
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");

loginBtn.addEventListener("click", () => {
  const user = document.getElementById("usuario").value.trim();
  const pass = document.getElementById("clave").value.trim();
  if (usuarios[user] === pass) {
    usuarioLogueado = true;
    alert(`¡Bienvenido, ${user}!`);
    document.getElementById("addForm").style.display = "block";
    logoutBtn.style.display = "inline-flex";
    loginBtn.style.display = "none";
    document.getElementById("usuario").disabled = true;
    document.getElementById("clave").disabled = true;
    mostrarTabla(geojsonData);
  } else {
    alert("Usuario o contraseña incorrectos.");
  }
});

logoutBtn.addEventListener("click", () => {
  usuarioLogueado = false;
  document.getElementById("addForm").style.display = "none";
  logoutBtn.style.display = "none";
  loginBtn.style.display = "inline-flex";
  document.getElementById("usuario").disabled = false;
  document.getElementById("clave").disabled = false;
  document.getElementById("usuario").value = "";
  document.getElementById("clave").value = "";
  mostrarTabla(geojsonData);
});

// 14. Cargar rutas y calcular ruta más cercana
const carpetas=[
  {dir:'Rutas_de_ENTRADA',name:'Rutas de ENTRADA',color:'#28a745'},
  {dir:'Rutas_de_SALIDA', name:'Rutas de SALIDA', color:'#dc3545'}
];

function poblarSelectPersonas(){
  const sel=document.getElementById('personSelect');
  sel.innerHTML='<option value="">-- Selecciona --</option>';
  geojsonData.features.forEach(f=>{
    const opt=document.createElement('option');
    opt.value=f._id; opt.text=`${f.properties.NOMBRE} (${f.properties.CODIGO})`;
    sel.appendChild(opt);
  });
}

async function cargarIndexYCapas(){
  for(const {dir,name,color} of carpetas){
    try{
      const r=await fetch(`${dir}/index.json`);
      if(!r.ok) throw 0;
      const lista=await r.json(), grupo=L.layerGroup();
      for(const file of lista){
        try{
          const rr=await fetch(`${dir}/${encodeURIComponent(file)}`);
          if(!rr.ok) throw 0;
          const data=await rr.json();
          L.geoJSON(data,{style:{color,weight:3}}).addTo(grupo);
        }catch{}
      }
      rutasCapas[name]=grupo; grupo.addTo(map);
    }catch(e){console.error(name,'indice falló');}
  }
  L.control.layers(null,rutasCapas,{collapsed:false}).addTo(map);
}

// función para calcular y resaltar ruta más cercana
async function encontrarRuta(){
  const id=document.getElementById('personSelect').value;
  if(id==='') return alert('Seleccione una persona');
  const f=geojsonData.features.find(x=>x._id==id);
  const punto=turf.point(f.geometry.coordinates);
  let min=Infinity, selLayer=null;
  Object.values(rutasCapas).forEach(gr=>{
    gr.eachLayer(layer=>{
      const dist=turf.pointToLineDistance(punto,layer.feature,{units:'meters'});
      if(dist<min){min=dist; selLayer=layer;}
    });
  });
  if(selLayer){
    map.fitBounds(selLayer.getBounds(),{padding:[20,20]});
    selLayer.setStyle({color:'#FF0000',weight:5});
    setTimeout(()=>selLayer.setStyle({color:selLayer.options.style.color,weight:3}),5000);
  }
}
document.getElementById('findRouteBtn').addEventListener('click',encontrarRuta);
// iniciar carga de rutas\cargarIndexYCapas();



