"""
Genera teselas PNG XYZ compatibles con MapLibre raster-dem (encoding="mapbox")
a partir de un DEM GeoTIFF en EPSG:4326.

Ejecutar con el Python de QGIS que incluya GDAL, NumPy y Pillow.
No modifica el DEM original. Genera zooms 6 a 11 en dem_tiles/z/x/y.png.
Codificación Mapbox: elevación (m) = -10000 + (R*65536 + G*256 + B)*0.1
"""
import math
from pathlib import Path

import numpy as np
from osgeo import gdal, osr
from PIL import Image

INPUT_DEM = r"C:\Users\kpilliza\Downloads\prubas 3d\IDE_TRANSPORTE_3D_integracion\srtm_copia.tif"
OUTPUT_DIR = r"C:\Users\kpilliza\Downloads\prubas 3d\IDE_TRANSPORTE_3D_integracion\dem_tiles"
MIN_ZOOM = 6
MAX_ZOOM = 11
TILE_SIZE = 256
WEBMERCATOR_LIMIT = 85.0511287798066
RADIUS = 6378137.0
ORIGIN = math.pi * RADIUS
INITIAL_RESOLUTION = 2 * ORIGIN / TILE_SIZE


def lonlat_to_pixel(lon, lat, z):
    lat = max(-WEBMERCATOR_LIMIT, min(WEBMERCATOR_LIMIT, lat))
    mx = RADIUS * math.radians(lon)
    my = RADIUS * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    res = INITIAL_RESOLUTION / (2 ** z)
    return (mx + ORIGIN) / res, (ORIGIN - my) / res


def tile_bounds_3857(x, y, z):
    res = INITIAL_RESOLUTION / (2 ** z)
    minx = x * TILE_SIZE * res - ORIGIN
    maxx = (x + 1) * TILE_SIZE * res - ORIGIN
    maxy = ORIGIN - y * TILE_SIZE * res
    miny = ORIGIN - (y + 1) * TILE_SIZE * res
    return minx, miny, maxx, maxy


def main():
    src_path = Path(INPUT_DEM)
    out_root = Path(OUTPUT_DIR)
    if not src_path.exists():
        raise FileNotFoundError(
            f"No se encuentra el DEM: {src_path}. Corrige INPUT_DEM al inicio del script."
        )

    src = gdal.Open(str(src_path), gdal.GA_ReadOnly)
    if src is None:
        raise RuntimeError("GDAL no pudo abrir el DEM.")

    srs = osr.SpatialReference()
    srs.ImportFromWkt(src.GetProjection())
    if not srs.IsGeographic():
        raise RuntimeError(
            "El DEM debe estar en coordenadas geográficas EPSG:4326. "
            "Reproyéctalo en QGIS y vuelve a ejecutar."
        )

    gt = src.GetGeoTransform()
    min_lon = gt[0]
    max_lat = gt[3]
    max_lon = min_lon + gt[1] * src.RasterXSize
    min_lat = max_lat + gt[5] * src.RasterYSize

    print(f"DEM: {src.RasterXSize} x {src.RasterYSize}")
    print(f"Cobertura: {min_lon:.6f}, {min_lat:.6f}, {max_lon:.6f}, {max_lat:.6f}")
    print(f"Salida: {out_root}")
    print(f"Zooms: {MIN_ZOOM}-{MAX_ZOOM}")
    out_root.mkdir(parents=True, exist_ok=True)

    total = 0
    for z in range(MIN_ZOOM, MAX_ZOOM + 1):
        px0, py0 = lonlat_to_pixel(min_lon, max_lat, z)
        px1, py1 = lonlat_to_pixel(max_lon, min_lat, z)
        x0 = max(0, int(math.floor(px0 / TILE_SIZE)))
        x1 = min(2**z - 1, int(math.floor((px1 - 1e-7) / TILE_SIZE)))
        y0 = max(0, int(math.floor(py0 / TILE_SIZE)))
        y1 = min(2**z - 1, int(math.floor((py1 - 1e-7) / TILE_SIZE)))
        count = max(0, x1 - x0 + 1) * max(0, y1 - y0 + 1)
        print(f"Zoom {z}: {count} teselas")

        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                bounds = tile_bounds_3857(x, y, z)
                tile_ds = gdal.Warp(
                    "", src, format="MEM", dstSRS="EPSG:3857",
                    outputBounds=bounds, width=TILE_SIZE, height=TILE_SIZE,
                    resampleAlg="bilinear", dstNodata=-9999,
                    outputType=gdal.GDT_Float32
                )
                if tile_ds is None:
                    raise RuntimeError(f"No se pudo reproyectar tesela z={z}, x={x}, y={y}")

                band = tile_ds.GetRasterBand(1)
                heights = band.ReadAsArray().astype(np.float32)
                nodata = band.GetNoDataValue()
                valid = np.isfinite(heights)
                if nodata is not None:
                    valid &= heights != nodata
                valid &= heights > -10000  # rango inferior válido de la codificación Mapbox

                # Mapbox Terrain-RGB: elevation = -10000 + encoded * 0.1
                encoded = np.clip(
                    np.rint((heights + 10000.0) * 10.0), 0, 16777215
                ).astype(np.uint32)

                rgba = np.zeros((TILE_SIZE, TILE_SIZE, 4), dtype=np.uint8)
                rgba[:, :, 0] = (encoded >> 16) & 255
                rgba[:, :, 1] = (encoded >> 8) & 255
                rgba[:, :, 2] = encoded & 255
                rgba[:, :, 3] = np.where(valid, 255, 0).astype(np.uint8)

                out_file = out_root / str(z) / str(x) / f"{y}.png"
                out_file.parent.mkdir(parents=True, exist_ok=True)
                Image.fromarray(rgba, mode="RGBA").save(out_file, optimize=True)
                total += 1
                tile_ds = None
        print(f"Zoom {z} completado")

    (out_root / "metadata.txt").write_text(
        "Mapbox Terrain-RGB PNG, estructura XYZ (z/x/y.png)\n"
        f"Zoom mínimo: {MIN_ZOOM}\nZoom máximo: {MAX_ZOOM}\n"
        f"Extensión WGS84: {min_lon},{min_lat},{max_lon},{max_lat}\n"
        "Elevación (m) = -10000 + (R*65536 + G*256 + B)*0.1\n"
        "El canal alfa indica píxeles con elevación válida.\n",
        encoding="utf-8"
    )
    src = None
    print(f"FINALIZADO: {total} teselas en {out_root}")


if __name__ == "__main__":
    main()
