import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import "./App.css";
import ControlPanel from "./components/ControlPanel";
import LandingOverlay from "./components/LandingOverlay";
import MapScene from "./components/MapScene";
import TopBar from "./components/TopBar";
import { SOLAR_MODELS, WIND_MODELS } from "./constants/models";
import { analyzeSolarRegion } from "./lib/solarAnalysisApi";
import {
  clamp,
  haversineMeters,
  normLng,
  rectangleFromTwoPoints,
  regionAreaKm2,
  regionCenter,
} from "./utils/geo";
import { formatDmsPair, parseDmsPair } from "./utils/dms";

function App() {
  const mapRef = useRef(null);
  const popupRef = useRef(null);

  const [theme, setTheme] = useState("light");
  const [landingState, setLandingState] = useState("visible");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [activeCoordField, setActiveCoordField] = useState(null);
  const [userMovedMap, setUserMovedMap] = useState(false);

  const [p1, setP1] = useState({ lat: 43.7238, lng: -80.194 });
  const [p2, setP2] = useState({ lat: 43.6118, lng: -80.0706 });
  const [p1Text, setP1Text] = useState(
    formatDmsPair({ lat: 43.7238, lng: -80.194 }),
  );
  const [p2Text, setP2Text] = useState(
    formatDmsPair({ lat: 43.6118, lng: -80.0706 }),
  );
  const [p1Error, setP1Error] = useState("");
  const [p2Error, setP2Error] = useState("");

  const [drawMode, setDrawMode] = useState("circle");
  const [draftPoints, setDraftPoints] = useState([]);
  const [region, setRegion] = useState({
    type: "polygon",
    points: rectangleFromTwoPoints(
      { lat: 43.7238, lng: -80.194 },
      { lat: 43.6118, lng: -80.0706 },
    ),
    source: "rectangle",
  });

  const [energyType, setEnergyType] = useState("");
  const [modelMode, setModelMode] = useState("predefined");
  const [selectedModel, setSelectedModel] = useState("");
  const [customModel, setCustomModel] = useState("");

  const [submitError, setSubmitError] = useState("");
  const [searching, setSearching] = useState(false);
  const [statsVisible, setStatsVisible] = useState(false);
  const [result, setResult] = useState(null);

  const enterApp = useCallback(() => {
    if (landingState !== "visible") return;
    setLandingState("fading");
    window.setTimeout(() => setLandingState("hidden"), 320);
  }, [landingState]);

  useEffect(() => {
    if (landingState === "hidden") return undefined;
    const onKey = () => enterApp();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enterApp, landingState]);

  const applyCoord = (id, coord) => {
    const next = {
      lat: clamp(coord.lat, -89.999, 89.999),
      lng: normLng(coord.lng),
    };

    if (id === "p1") {
      setP1(next);
      setP1Text(formatDmsPair(next));
      setP1Error("");
    } else {
      setP2(next);
      setP2Text(formatDmsPair(next));
      setP2Error("");
    }

    setRegion({
      type: "polygon",
      points: rectangleFromTwoPoints(
        id === "p1" ? next : p1,
        id === "p2" ? next : p2,
      ),
      source: "rectangle",
    });
  };

  const onCoordChange = (id, value) => {
    if (id === "p1") setP1Text(value);
    else setP2Text(value);

    const parsed = parseDmsPair(value);
    if (!parsed.ok) {
      if (id === "p1") setP1Error(parsed.message);
      else setP2Error(parsed.message);
      return;
    }

    applyCoord(id, parsed.value);
  };

  const onMapClick = (latlng) => {
    if (landingState !== "hidden") enterApp();

    if (activeCoordField) {
      applyCoord(activeCoordField, latlng);
      setActiveCoordField(null);
      return;
    }

    if (!advancedOpen) return;

    if (drawMode === "circle") {
      setDraftPoints((current) => {
        const next = [...current, [latlng.lat, latlng.lng]];
        if (next.length === 2) {
          setRegion({
            type: "circle",
            center: { lat: next[0][0], lng: next[0][1] },
            radiusMeters: haversineMeters(
              { lat: next[0][0], lng: next[0][1] },
              { lat: next[1][0], lng: next[1][1] },
            ),
            source: "circle",
          });
          return [];
        }
        return next;
      });
      return;
    }

    if (drawMode === "polygon") {
      setDraftPoints((current) => [...current, [latlng.lat, latlng.lng]]);
    }
  };

  const finalizePolygon = () => {
    if (draftPoints.length < 3) {
      setSubmitError("Polygon needs at least three points.");
      return;
    }
    setRegion({ type: "polygon", points: draftPoints, source: "polygon" });
    setDraftPoints([]);
    setSubmitError("");
  };

  const removeLastPolygonPoint = () => {
    setDraftPoints((current) => current.slice(0, -1));
  };

  const useRectangleRegion = () => {
    setRegion({
      type: "polygon",
      points: rectangleFromTwoPoints(p1, p2),
      source: "rectangle",
    });
    setDraftPoints([]);
    setSubmitError("");
  };

  const mapBounds = useMemo(() => {
    if (region.type === "circle") {
      const c = region.center;
      const radiusKm = region.radiusMeters / 1000;
      const latDelta = radiusKm / 111.32;
      const lngDelta =
        radiusKm / (111.32 * Math.max(0.25, Math.cos((c.lat * Math.PI) / 180)));
      return [
        [c.lat - latDelta, c.lng - lngDelta],
        [c.lat + latDelta, c.lng + lngDelta],
      ];
    }

    return region.points;
  }, [region]);

  const fitRegion = useCallback(
    (duration = 0.6) => {
      const map = mapRef.current;
      if (!map) return;

      map.fitBounds(mapBounds, {
        padding: [56, 56],
        animate: true,
        duration,
      });
    },
    [mapBounds],
  );

  const modelOptions =
    energyType === "solar"
      ? SOLAR_MODELS
      : energyType === "wind"
        ? WIND_MODELS
        : [];
  const modelValue =
    modelMode === "predefined" ? selectedModel : customModel.trim();

  const isReady =
    !!energyType &&
    !!modelValue &&
    !p1Error &&
    !p2Error &&
    !!region &&
    (region.type !== "circle" || region.radiusMeters > 1) &&
    (region.type !== "polygon" || region.points.length >= 3);

  const runAnalysis = async () => {
    const errors = [];
    if (p1Error || p2Error) errors.push("Fix coordinate formatting first.");
    if (!energyType) errors.push("Choose an energy type.");
    if (!modelValue) errors.push("Choose or enter a model.");
    if (!region) errors.push("Define a region on the map.");

    if (errors.length) {
      setSubmitError(errors.join(" "));
      return;
    }

    setSubmitError("");
    setSearching(true);
    fitRegion(0.55);

    try {
      if (energyType === "solar") {
        const solarResult = await analyzeSolarRegion(region);
        setResult({
          type: "solar",
          label: "Solar panels",
          areaKm2: solarResult.area_km2,
          placements: solarResult.panel_count,
          equipmentCost: solarResult.panel_cost_usd,
          constructionCost: solarResult.construction_cost_usd,
          totalCost: solarResult.total_project_cost_usd,
          annualMWh: solarResult.estimated_annual_output_kwh / 1000,
          installedCapacityKw: solarResult.installed_capacity_kw,
          suitabilityScore: solarResult.suitability_score,
          suitabilityReason: solarResult.suitability_reason,
          weatherSource: solarResult.weather_source,
          suitable: solarResult.suitable,
        });
      } else {
        await new Promise((resolve) => {
          window.setTimeout(resolve, 900);
        });

        const areaKm2 = Math.max(0.1, regionAreaKm2(region));
        const placements = Math.floor(areaKm2 * 4.6);
        const equipmentCost = placements * 1_850_000;
        const constructionCost = areaKm2 * 680_000;
        const annualMWh = areaKm2 * 4_900;

        setResult({
          type: "wind",
          areaKm2,
          placements,
          equipmentCost,
          constructionCost,
          annualMWh,
          label: "Wind turbines",
        });
      }

      setStatsVisible(true);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "The backend could not analyze this region.",
      );
    } finally {
      setSearching(false);
    }
  };

  const popupPosition = useMemo(() => {
    const c = regionCenter(region);
    return [c.lat, c.lng];
  }, [region]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (searching || statsVisible || userMovedMap) return;
    fitRegion(0);
  }, [fitRegion, searching, statsVisible, userMovedMap]);

  return (
    <main className={`app-root theme-${theme}`}>
      <MapScene
        region={region}
        draftPoints={draftPoints}
        p1={p1}
        p2={p2}
        result={result}
        statsVisible={statsVisible}
        popupRef={popupRef}
        popupPosition={popupPosition}
        onMapClick={onMapClick}
        onMapMove={() => setUserMovedMap(true)}
        onToggleStats={() => setStatsVisible((value) => !value)}
        onSetStatsVisible={setStatsVisible}
        onApplyCoord={applyCoord}
        onMapReady={(event) => {
          mapRef.current = event.target;
          fitRegion(0);
        }}
        onLandingInteraction={enterApp}
        landingHidden={landingState === "hidden"}
        theme={theme}
      />

      <div className="ui-layer">
        <TopBar
          theme={theme}
          onToggleTheme={() =>
            setTheme((value) => (value === "light" ? "dark" : "light"))
          }
          userMovedMap={userMovedMap}
          onRefocus={() => {
            fitRegion(0.55);
            setUserMovedMap(false);
          }}
        />

        <ControlPanel
          p1Text={p1Text}
          p2Text={p2Text}
          p1Error={p1Error}
          p2Error={p2Error}
          onCoordChange={onCoordChange}
          onCoordFocus={setActiveCoordField}
          advancedOpen={advancedOpen}
          onToggleAdvanced={() => setAdvancedOpen((value) => !value)}
          drawMode={drawMode}
          onDrawModeChange={(mode) => {
            setDrawMode(mode);
            setDraftPoints([]);
          }}
          onFinalizePolygon={finalizePolygon}
          onRemoveLastPoint={removeLastPolygonPoint}
          onUseRectangle={useRectangleRegion}
          hasDraftPoints={draftPoints.length > 0}
          energyType={energyType}
          modelMode={modelMode}
          selectedModel={selectedModel}
          customModel={customModel}
          modelOptions={modelOptions}
          onEnergyTypeChange={(nextType) => {
            setEnergyType(nextType);
            setSelectedModel("");
            setCustomModel("");
          }}
          onModelModeChange={setModelMode}
          onSelectedModelChange={setSelectedModel}
          onCustomModelChange={setCustomModel}
          submitError={submitError}
          isReady={isReady}
          searching={searching}
          onRunAnalysis={runAnalysis}
        />
      </div>

      <LandingOverlay landingState={landingState} onEnter={enterApp} />
    </main>
  );
}

export default App;
