import React from "react";
import { Circle, MapContainer, Marker, Polygon, Polyline, Popup, TileLayer } from "react-leaflet";
import MapEvents from "./MapEvents";
import { markerIcon } from "../map/icons";

function MapScene({
  region,
  draftPoints,
  p1,
  p2,
  result,
  statsVisible,
  popupRef,
  popupPosition,
  onMapClick,
  onMapMove,
  onToggleStats,
  onSetStatsVisible,
  onApplyCoord,
  onMapReady,
  onLandingInteraction,
  landingHidden,
  theme,
}) {
  const tilesUrl =
    theme === "light"
      ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
  const tileAttribution =
    theme === "light"
      ? "&copy; OpenStreetMap contributors"
      : "&copy; OpenStreetMap contributors &copy; CARTO";

  return (
    <div className="map-layer" aria-hidden={!landingHidden}>
      <MapContainer
        className="map-canvas"
        center={[43.67, -80.13]}
        zoom={10}
        zoomControl
        scrollWheelZoom
        whenReady={onMapReady}
      >
        <TileLayer
          url={tilesUrl}
          attribution={tileAttribution}
          maxZoom={20}
          subdomains={["a", "b", "c"]}
        />
        <MapEvents onMapClick={onMapClick} onMapMove={onMapMove} />

        {region.type === "circle" ? (
          <Circle
            center={[region.center.lat, region.center.lng]}
            radius={region.radiusMeters}
            eventHandlers={{ click: () => result && onToggleStats() }}
            pathOptions={{
              color: "#1b7d67",
              weight: 2,
              fillColor: "#65c9ad",
              fillOpacity: 0.16,
            }}
          />
        ) : (
          <Polygon
            positions={region.points}
            eventHandlers={{ click: () => result && onToggleStats() }}
            pathOptions={{
              color: "#1b7d67",
              weight: 2,
              fillColor: "#65c9ad",
              fillOpacity: 0.14,
            }}
          />
        )}

        {draftPoints.length > 0 && (
          <Polyline
            positions={draftPoints}
            pathOptions={{ color: "#b17d2f", weight: 2, dashArray: "5 7" }}
          />
        )}

        <Marker
          position={[p1.lat, p1.lng]}
          icon={markerIcon("#4ab394")}
          draggable
          eventHandlers={{
            drag: (event) => onApplyCoord("p1", event.target.getLatLng()),
            dragend: (event) => onApplyCoord("p1", event.target.getLatLng()),
            click: onLandingInteraction,
          }}
        />
        <Marker
          position={[p2.lat, p2.lng]}
          icon={markerIcon("#c09244")}
          draggable
          eventHandlers={{
            drag: (event) => onApplyCoord("p2", event.target.getLatLng()),
            dragend: (event) => onApplyCoord("p2", event.target.getLatLng()),
            click: onLandingInteraction,
          }}
        />

        {statsVisible && result && (
          <Popup
            ref={popupRef}
            position={popupPosition}
            closeButton
            autoClose={false}
            closeOnClick={false}
            eventHandlers={{ remove: () => onSetStatsVisible(false) }}
          >
            <div className="result-popup">
              <h3>{result.label} Estimate</h3>
              <p>Area: {result.areaKm2.toFixed(2)} km²</p>
              <p>Capacity fit: {result.placements.toLocaleString()}</p>
              <p>Construction cost: ${result.constructionCost.toLocaleString()}</p>
              <p>Equipment cost: ${result.equipmentCost.toLocaleString()}</p>
              <p>
                Estimated production: {result.annualMWh.toLocaleString()} MWh/year
              </p>
              {result.type === "solar" && (
                <>
                  <p>
                    Installed capacity: {result.installedCapacityKw.toLocaleString()} kW
                  </p>
                  <p>Total cost: ${result.totalCost.toLocaleString()}</p>
                  <p>Suitability score: {result.suitabilityScore}</p>
                  <p>{result.suitabilityReason}</p>
                  <p>Weather source: {result.weatherSource}</p>
                </>
              )}
            </div>
          </Popup>
        )}
      </MapContainer>
    </div>
  );
}

export default MapScene;
