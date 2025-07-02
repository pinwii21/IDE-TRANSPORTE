
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.post('/subirGeojson', async (req, res) => {
  const geojsonData = req.body;

  if (!geojsonData || !geojsonData.features) {
    return res.status(400).json({ error: "Datos inválidos" });
  }

  const owner = 'pinwii21';
  const repo = 'IDE-TRANSPORTE';
  const path = 'BASE_DATOS_TRANSPORTE_2025.geojson';
  const token = process.env.GITHUB_TOKEN;

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  try {
    const resGet = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json"
      }
    });

    const dataGet = await resGet.json();
    const sha = dataGet.sha;

    const contenido = JSON.stringify(geojsonData, null, 2);
    const contenidoBase64 = Buffer.from(contenido, 'utf-8').toString('base64');

    const resPut = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: "Actualización desde IDE Transporte",
        content: contenidoBase64,
        sha: sha
      })
    });

    if (!resPut.ok) {
      const error = await resPut.text();
      return res.status(500).json({ error });
    }

    res.json({ mensaje: "Archivo actualizado correctamente en GitHub ✅" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al actualizar el archivo" });
  }
});

app.get("/", (req, res) => {
  res.send("✅ API IDE Transporte funcionando.");
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
