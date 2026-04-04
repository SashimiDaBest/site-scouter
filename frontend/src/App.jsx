import { useMemo, useState } from 'react'
import Globe from 'react-globe.gl'
import './App.css'

const SOLAR_MODELS = [
  { name: 'SunForge SF-450', kw: 0.45, areaM2: 2.1 },
  { name: 'HelioMax HX-620', kw: 0.62, areaM2: 2.65 },
  { name: 'Atlas Bifacial AB-700', kw: 0.7, areaM2: 3.0 },
]

const WIND_MODELS = [
  { name: 'AeroSpin 2MW', kw: 2000, spacingM2: 120000 },
  { name: 'VentoCore 3.5MW', kw: 3500, spacingM2: 185000 },
  { name: 'SkyGrid 5MW', kw: 5000, spacingM2: 260000 },
]

const AVERAGE_SOLAR_KWH_PER_KM2 = 1600000
const AVERAGE_WIND_KWH_PER_KM2 = 3100000

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const parseCoordinatePair = (value) => {
  const parts = value.split(',').map((p) => Number(p.trim()))
  if (parts.length !== 2 || parts.some((v) => Number.isNaN(v))) {
    return null
  }

  const [lat, lon] = parts
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return null
  }

  return { lat, lon }
}

const parseRegionInput = (value) => {
  const [first, second] = value.split('|').map((part) => part.trim())
  if (!first || !second) {
    return null
  }

  const p1 = parseCoordinatePair(first)
  const p2 = parseCoordinatePair(second)
  if (!p1 || !p2) {
    return null
  }

  return {
    south: Math.min(p1.lat, p2.lat),
    north: Math.max(p1.lat, p2.lat),
    west: Math.min(p1.lon, p2.lon),
    east: Math.max(p1.lon, p2.lon),
  }
}

const boundsFromPoints = (p1, p2) => ({
  south: Math.min(p1.lat, p2.lat),
  north: Math.max(p1.lat, p2.lat),
  west: Math.min(p1.lng, p2.lng),
  east: Math.max(p1.lng, p2.lng),
})

const rectangleFeature = (bounds) => ({
  type: 'Feature',
  properties: { name: 'Selected Region' },
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [bounds.west, bounds.south],
      [bounds.east, bounds.south],
      [bounds.east, bounds.north],
      [bounds.west, bounds.north],
      [bounds.west, bounds.south],
    ]],
  },
})

const areaKm2FromBounds = (bounds) => {
  const latMid = (bounds.south + bounds.north) / 2
  const latSpan = Math.max(0.01, Math.abs(bounds.north - bounds.south))
  const lonSpan = Math.max(0.01, Math.abs(bounds.east - bounds.west))
  const latKm = latSpan * 111.32
  const lonKm = lonSpan * 111.32 * Math.cos((latMid * Math.PI) / 180)
  return Math.max(1, latKm * Math.abs(lonKm))
}

const classifyAgainstAverage = (actualPerKm2, averagePerKm2) => {
  const ratio = actualPerKm2 / averagePerKm2
  if (ratio >= 1.12) {
    return 'better than average'
  }
  if (ratio <= 0.88) {
    return 'below average'
  }
  return 'average'
}

const computeLocalEstimate = ({ bounds, solarModelName, windModelName }) => {
  const areaKm2 = areaKm2FromBounds(bounds)
  const areaM2 = areaKm2 * 1_000_000

  const solarModel =
    SOLAR_MODELS.find((model) => model.name === solarModelName) || SOLAR_MODELS[0]
  const windModel =
    WIND_MODELS.find((model) => model.name === windModelName) || WIND_MODELS[0]

  const latitudeCenter = (bounds.north + bounds.south) / 2
  const windBias = clamp(Math.abs(latitudeCenter - 38) / 30, 0.4, 1.3)
  const solarBias = clamp(1.2 - Math.abs(latitudeCenter - 33) / 45, 0.65, 1.3)

  const solarCoverage = 0.23
  const windCoverage = 0.38

  const solarUnits = Math.floor((areaM2 * solarCoverage) / solarModel.areaM2)
  const windUnits = Math.floor((areaM2 * windCoverage) / windModel.spacingM2)

  const solarCapacityFactor = 0.2 * solarBias
  const windCapacityFactor = 0.35 * windBias

  const solarKwhYr = Math.round(solarUnits * solarModel.kw * 8760 * solarCapacityFactor)
  const windKwhYr = Math.round(windUnits * windModel.kw * 8760 * windCapacityFactor)

  const solarPerKm2 = solarKwhYr / areaKm2
  const windPerKm2 = windKwhYr / areaKm2

  const recommendation = solarKwhYr >= windKwhYr ? 'solar' : 'wind'

  return {
    source: 'fallback',
    areaKm2,
    recommendation,
    solar: {
      model: solarModel.name,
      units: solarUnits,
      powerKwhYr: solarKwhYr,
      rating: classifyAgainstAverage(solarPerKm2, AVERAGE_SOLAR_KWH_PER_KM2),
    },
    wind: {
      model: windModel.name,
      units: windUnits,
      powerKwhYr: windKwhYr,
      rating: classifyAgainstAverage(windPerKm2, AVERAGE_WIND_KWH_PER_KM2),
    },
  }
}

const normalizeApiResponse = ({ data, localEstimate, selectedModels }) => {
  if (!data || typeof data !== 'object') {
    return localEstimate
  }

  const solarPower =
    data.solar?.powerKwhYr ??
    data.solar_kwh_yr ??
    data.solarPowerKwhYr ??
    localEstimate.solar.powerKwhYr
  const windPower =
    data.wind?.powerKwhYr ??
    data.wind_kwh_yr ??
    data.windPowerKwhYr ??
    localEstimate.wind.powerKwhYr

  const solarUnits =
    data.solar?.units ??
    data.solar_count ??
    data.solarUnits ??
    localEstimate.solar.units
  const windUnits =
    data.wind?.units ??
    data.wind_count ??
    data.windUnits ??
    localEstimate.wind.units

  const areaKm2 = data.area_km2 ?? data.areaKm2 ?? localEstimate.areaKm2
  const recommendation = data.recommendation ?? localEstimate.recommendation
  const solarPerKm2 = Number(solarPower) / areaKm2
  const windPerKm2 = Number(windPower) / areaKm2

  return {
    source: 'api',
    areaKm2,
    recommendation,
    solar: {
      model: data.solar?.model ?? selectedModels.solar,
      units: Number(solarUnits),
      powerKwhYr: Number(solarPower),
      rating:
        data.solar?.rating ??
        classifyAgainstAverage(solarPerKm2, AVERAGE_SOLAR_KWH_PER_KM2),
    },
    wind: {
      model: data.wind?.model ?? selectedModels.wind,
      units: Number(windUnits),
      powerKwhYr: Number(windPower),
      rating:
        data.wind?.rating ??
        classifyAgainstAverage(windPerKm2, AVERAGE_WIND_KWH_PER_KM2),
    },
  }
}

const formatNumber = (value) => Intl.NumberFormat('en-US').format(Math.round(value))

function App() {
  const [regionInput, setRegionInput] = useState('33.30,-112.15 | 33.95,-111.70')
  const [solarModel, setSolarModel] = useState(SOLAR_MODELS[0].name)
  const [windModel, setWindModel] = useState(WIND_MODELS[0].name)
  const [apiEndpoint, setApiEndpoint] = useState(
    import.meta.env.VITE_SCOUT_API_URL || 'http://localhost:8000/scout',
  )
  const [drawMode, setDrawMode] = useState(false)
  const [drawPoints, setDrawPoints] = useState([])
  const [regionBounds, setRegionBounds] = useState(parseRegionInput(regionInput))
  const [result, setResult] = useState(null)
  const [showStats, setShowStats] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const selectedFeature = useMemo(
    () => (regionBounds ? [rectangleFeature(regionBounds)] : []),
    [regionBounds],
  )

  const cornerPoints = useMemo(() => {
    if (!regionBounds) {
      return []
    }

    return [
      { lat: regionBounds.north, lng: regionBounds.west, size: 0.25 },
      { lat: regionBounds.north, lng: regionBounds.east, size: 0.25 },
      { lat: regionBounds.south, lng: regionBounds.west, size: 0.25 },
      { lat: regionBounds.south, lng: regionBounds.east, size: 0.25 },
    ]
  }, [regionBounds])

  const applyTypedRegion = () => {
    const parsed = parseRegionInput(regionInput)
    if (!parsed) {
      setError('Region must be two points: lat,lon | lat,lon')
      return
    }

    setRegionBounds(parsed)
    setError('')
  }

  const onGlobeClick = (coords) => {
    if (!drawMode) {
      return
    }

    setDrawPoints((current) => {
      const next = [...current, { lat: coords.lat, lng: coords.lng }].slice(-2)
      if (next.length === 2) {
        const bounds = boundsFromPoints(next[0], next[1])
        setRegionBounds(bounds)
        setRegionInput(
          `${bounds.south.toFixed(4)},${bounds.west.toFixed(4)} | ${bounds.north.toFixed(4)},${bounds.east.toFixed(4)}`,
        )
        setDrawMode(false)
        setError('')
      }
      return next
    })
  }

  const handleSearch = async () => {
    if (!regionBounds) {
      setError('Create a valid region before searching.')
      return
    }

    setError('')
    setIsLoading(true)
    setShowStats(false)

    const localEstimate = computeLocalEstimate({
      bounds: regionBounds,
      solarModelName: solarModel,
      windModelName: windModel,
    })

    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region: {
            south: regionBounds.south,
            west: regionBounds.west,
            north: regionBounds.north,
            east: regionBounds.east,
          },
          solar_model: solarModel,
          wind_model: windModel,
        }),
      })

      if (!response.ok) {
        throw new Error(`API status ${response.status}`)
      }

      const data = await response.json()
      const normalized = normalizeApiResponse({
        data,
        localEstimate,
        selectedModels: { solar: solarModel, wind: windModel },
      })
      setResult(normalized)
      setShowStats(true)
    } catch {
      setResult(localEstimate)
      setShowStats(true)
      setError('API unavailable. Showing local estimate based on region size and model assumptions.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="app-shell">
      <section className="globe-stage">
        <header className="headline">
          <p className="eyebrow">Catapult 2026</p>
          <h1>Renewable Yield Scout</h1>
          <p>Draw or type a region, pick hardware models, then run a power-density search.</p>
        </header>

        <div className="globe-wrap">
          <Globe
            globeImageUrl="https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
            bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
            backgroundImageUrl="https://unpkg.com/three-globe/example/img/night-sky.png"
            polygonsData={selectedFeature}
            polygonCapColor={() => 'rgba(255, 180, 42, 0.42)'}
            polygonSideColor={() => 'rgba(255, 120, 26, 0.5)'}
            polygonStrokeColor={() => '#ff8f1f'}
            polygonAltitude={() => 0.012}
            pointsData={cornerPoints}
            pointLat="lat"
            pointLng="lng"
            pointAltitude={() => 0.025}
            pointRadius={0.24}
            pointColor={() => '#ffe39c'}
            onGlobeClick={onGlobeClick}
            onPolygonClick={() => {
              if (result) {
                setShowStats((open) => !open)
              }
            }}
          />

          {isLoading && (
            <div className="loading-overlay">
              <div className="loader-card">
                <p className="loader-title">Running site analysis...</p>
                <p>
                  Region: {regionBounds.south.toFixed(3)}, {regionBounds.west.toFixed(3)} to{' '}
                  {regionBounds.north.toFixed(3)}, {regionBounds.east.toFixed(3)}
                </p>
              </div>
            </div>
          )}

          {result && showStats && !isLoading && (
            <aside className="stats-popover">
              <div className="stats-head">
                <h2>Selection Summary</h2>
                <button type="button" onClick={() => setShowStats(false)}>
                  Close
                </button>
              </div>
              <p className="meta">
                Recommendation: <strong>{result.recommendation}</strong> • Area:{' '}
                <strong>{result.areaKm2.toFixed(1)} km²</strong>
              </p>
              <div className="stat-grid">
                <article>
                  <h3>Solar</h3>
                  <p>{result.solar.model}</p>
                  <p>{formatNumber(result.solar.units)} units</p>
                  <p>{formatNumber(result.solar.powerKwhYr)} kWh/yr</p>
                  <p className="rating">{result.solar.rating}</p>
                </article>
                <article>
                  <h3>Wind</h3>
                  <p>{result.wind.model}</p>
                  <p>{formatNumber(result.wind.units)} units</p>
                  <p>{formatNumber(result.wind.powerKwhYr)} kWh/yr</p>
                  <p className="rating">{result.wind.rating}</p>
                </article>
              </div>
              <p className="meta">
                Data source: <strong>{result.source}</strong>. Click selected region to reopen this card.
              </p>
            </aside>
          )}
        </div>

        <section className="control-dock">
          <label>
            Region (lat,lon | lat,lon)
            <input
              value={regionInput}
              onChange={(event) => setRegionInput(event.target.value)}
              placeholder="33.30,-112.15 | 33.95,-111.70"
            />
          </label>
          <button type="button" onClick={applyTypedRegion}>
            Apply Region
          </button>
          <button
            type="button"
            className={drawMode ? 'active' : ''}
            onClick={() => {
              setDrawMode((active) => !active)
              setDrawPoints([])
            }}
          >
            {drawMode
              ? `Drawing: select corner ${Math.min(drawPoints.length + 1, 2)} of 2`
              : 'Draw Region On Globe'}
          </button>

          <label>
            Solar panel model
            <select value={solarModel} onChange={(event) => setSolarModel(event.target.value)}>
              {SOLAR_MODELS.map((model) => (
                <option key={model.name} value={model.name}>
                  {model.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Wind turbine model
            <select value={windModel} onChange={(event) => setWindModel(event.target.value)}>
              {WIND_MODELS.map((model) => (
                <option key={model.name} value={model.name}>
                  {model.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            API endpoint
            <input
              value={apiEndpoint}
              onChange={(event) => setApiEndpoint(event.target.value)}
              placeholder="http://localhost:8000/scout"
            />
          </label>

          <button type="button" className="search" onClick={handleSearch}>
            Search
          </button>
        </section>

        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  )
}

export default App
