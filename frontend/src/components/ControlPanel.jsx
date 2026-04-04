import React from "react";

function ControlPanel({
  p1Text,
  p2Text,
  p1Error,
  p2Error,
  onCoordChange,
  onCoordFocus,
  advancedOpen,
  onToggleAdvanced,
  drawMode,
  onDrawModeChange,
  onFinalizePolygon,
  onRemoveLastPoint,
  onUseRectangle,
  hasDraftPoints,
  energyType,
  modelMode,
  selectedModel,
  customModel,
  modelOptions,
  onEnergyTypeChange,
  onModelModeChange,
  onSelectedModelChange,
  onCustomModelChange,
  submitError,
  isReady,
  searching,
  onRunAnalysis,
}) {
  return (
    <section className="bottom-panel" aria-label="Inputs">
      <div className="coords-row">
        <label>
          Point 1
          <input
            value={p1Text}
            onChange={(event) => onCoordChange("p1", event.target.value)}
            onFocus={() => onCoordFocus("p1")}
            placeholder={"43°43'25.7\"N 80°11'38.5\"W"}
          />
          {p1Error && <small className="field-error">{p1Error}</small>}
        </label>

        <label>
          Point 2
          <input
            value={p2Text}
            onChange={(event) => onCoordChange("p2", event.target.value)}
            onFocus={() => onCoordFocus("p2")}
            placeholder={"43°43'25.7\"N 80°11'38.5\"W"}
          />
          {p2Error && <small className="field-error">{p2Error}</small>}
        </label>
      </div>

      <div className="advanced-block">
        <button
          type="button"
          className={advancedOpen ? "expanded" : ""}
          onClick={onToggleAdvanced}
        >
          Advanced Settings
        </button>

        <div className={`advanced-menu ${advancedOpen ? "open" : ""}`}>
          <div className="mode-row">
            <button
              type="button"
              className={drawMode === "circle" ? "active" : ""}
              onClick={() => onDrawModeChange("circle")}
            >
              Circle tool
            </button>
            <button
              type="button"
              className={drawMode === "polygon" ? "active" : ""}
              onClick={() => onDrawModeChange("polygon")}
            >
              Polygon tool
            </button>
            <button type="button" onClick={onFinalizePolygon}>
              Close polygon
            </button>
            <button type="button" onClick={onRemoveLastPoint} disabled={!hasDraftPoints}>
              Undo point
            </button>
            <button type="button" onClick={onUseRectangle}>
              Use rectangle
            </button>
          </div>
          <p className="helper">
            Click a coordinate field then map to populate it. In circle mode click center
            then edge. In polygon mode click vertices then Close polygon.
          </p>
        </div>
      </div>

      <div className="energy-row">
        <label>
          Energy type
          <select value={energyType} onChange={(event) => onEnergyTypeChange(event.target.value)}>
            <option value="">Select type</option>
            <option value="solar">Solar panels</option>
            <option value="wind">Wind turbines</option>
          </select>
        </label>

        {energyType && (
          <label>
            Model source
            <select value={modelMode} onChange={(event) => onModelModeChange(event.target.value)}>
              <option value="predefined">Predefined models</option>
              <option value="custom">Custom specification</option>
            </select>
          </label>
        )}

        {energyType && modelMode === "predefined" && (
          <label>
            Model
            <select
              value={selectedModel}
              onChange={(event) => onSelectedModelChange(event.target.value)}
            >
              <option value="">Select model</option>
              {modelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
        )}

        {energyType && modelMode === "custom" && (
          <label>
            Custom spec
            <input
              value={customModel}
              onChange={(event) => onCustomModelChange(event.target.value)}
              placeholder="Enter custom model or specs"
            />
          </label>
        )}
      </div>

      {submitError && <p className="submit-error">{submitError}</p>}

      <div className="actions-row">
        <button
          type="button"
          className="primary"
          disabled={!isReady || searching}
          onClick={onRunAnalysis}
        >
          {searching ? "Computing..." : "Search"}
        </button>
      </div>
    </section>
  );
}

export default ControlPanel;
