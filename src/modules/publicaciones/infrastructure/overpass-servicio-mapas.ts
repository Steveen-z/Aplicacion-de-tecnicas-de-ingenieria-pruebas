import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MapaPublicacion, ServicioMapas } from '../domain/servicio-mapas.port';
import { CategoriaPuntoInteres, PuntoInteres, distanciaMetros } from '../domain/ubicacion-cercania';

interface ElementoOverpass {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface RespuestaOverpass {
  elements?: ElementoOverpass[];
}

const TTL_CACHE_MS = 60 * 60 * 1000;
const MAX_ENTRADAS_CACHE = 500;
const TIMEOUT_MS = 6000;
const MAX_PUNTOS = 40;

const CATEGORIAS_AMENITY: Record<string, CategoriaPuntoInteres> = {
  school: 'EDUCACION',
  kindergarten: 'EDUCACION',
  college: 'EDUCACION',
  university: 'EDUCACION',
  hospital: 'SALUD',
  clinic: 'SALUD',
  doctors: 'SALUD',
  pharmacy: 'SALUD',
  marketplace: 'COMERCIO',
};
const CATEGORIAS_SHOP = new Set(['supermarket', 'convenience', 'mall']);

/**
 * Adaptador del servicio externo de mapas: OpenStreetMap (mapa) + Overpass API (puntos de interés).
 * Si Overpass no responde devuelve null y el detalle de la publicación sigue funcionando.
 */
@Injectable()
export class OverpassServicioMapas implements ServicioMapas {
  private readonly logger = new Logger(OverpassServicioMapas.name);
  private readonly cache = new Map<string, { expira: number; puntos: PuntoInteres[] }>();

  constructor(private readonly config: ConfigService) {}

  obtenerMapa(latitud: number, longitud: number): MapaPublicacion {
    const d = 0.01;
    const bbox = [longitud - d, latitud - d, longitud + d, latitud + d].join(',');
    const marcador = `${latitud},${longitud}`;
    return {
      centro: { latitud, longitud },
      zoom: 15,
      urlIncrustada: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marcador}`,
      urlMapa: `https://www.openstreetmap.org/?mlat=${latitud}&mlon=${longitud}#map=15/${latitud}/${longitud}`,
    };
  }

  async buscarPuntosInteres(
    latitud: number,
    longitud: number,
    radioMetros: number,
  ): Promise<PuntoInteres[] | null> {
    const clave = `${latitud.toFixed(3)},${longitud.toFixed(3)},${radioMetros}`;
    const enCache = this.cache.get(clave);
    if (enCache && enCache.expira > Date.now()) return enCache.puntos;

    try {
      const respuesta = await fetch(this.config.get<string>('OVERPASS_URL') ?? 'https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'InmobiSV-Backend/1.0',
        },
        body: new URLSearchParams({ data: this.construirConsulta(latitud, longitud, radioMetros) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!respuesta.ok) throw new Error(`Overpass respondió ${respuesta.status}`);

      const cuerpo = (await respuesta.json()) as RespuestaOverpass;
      const puntos = this.convertir(cuerpo.elements ?? [], latitud, longitud);
      this.guardarEnCache(clave, puntos);
      return puntos;
    } catch (error) {
      this.logger.warn(`Puntos de interés no disponibles: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private construirConsulta(lat: number, lon: number, radio: number): string {
    const alrededor = `(around:${Math.round(radio)},${lat},${lon})`;
    return `[out:json][timeout:8];(
      nwr${alrededor}[amenity~"^(school|kindergarten|college|university)$"];
      nwr${alrededor}[amenity~"^(hospital|clinic|doctors|pharmacy)$"];
      nwr${alrededor}[highway=bus_stop];
      nwr${alrededor}[shop~"^(supermarket|convenience|mall)$"];
      nwr${alrededor}[amenity=marketplace];
    );out center ${MAX_PUNTOS * 3};`;
  }

  private convertir(elementos: ElementoOverpass[], lat: number, lon: number): PuntoInteres[] {
    const puntos: PuntoInteres[] = [];
    for (const el of elementos) {
      const categoria = this.categorizar(el.tags ?? {});
      const latitud = el.lat ?? el.center?.lat;
      const longitud = el.lon ?? el.center?.lon;
      if (!categoria || latitud === undefined || longitud === undefined) continue;
      puntos.push({
        nombre: el.tags?.name ?? null,
        categoria,
        latitud,
        longitud,
        distanciaM: distanciaMetros(lat, lon, latitud, longitud),
      });
    }
    return puntos.sort((a, b) => a.distanciaM - b.distanciaM).slice(0, MAX_PUNTOS);
  }

  private categorizar(tags: Record<string, string>): CategoriaPuntoInteres | null {
    if (tags.amenity && CATEGORIAS_AMENITY[tags.amenity]) return CATEGORIAS_AMENITY[tags.amenity];
    if (tags.highway === 'bus_stop') return 'TRANSPORTE';
    if (tags.shop && CATEGORIAS_SHOP.has(tags.shop)) return 'COMERCIO';
    return null;
  }

  private guardarEnCache(clave: string, puntos: PuntoInteres[]): void {
    if (this.cache.size >= MAX_ENTRADAS_CACHE) {
      const masAntigua = this.cache.keys().next().value;
      if (masAntigua !== undefined) this.cache.delete(masAntigua);
    }
    this.cache.set(clave, { expira: Date.now() + TTL_CACHE_MS, puntos });
  }
}
