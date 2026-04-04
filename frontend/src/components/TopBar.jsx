import React from "react";

function TopBar({ theme, onToggleTheme, userMovedMap, onRefocus }) {
  return (
    <header className="top-strip">
      <div>
        <h1>Renewables Site Scout</h1>
        <p>Select a region and estimate practical solar or wind deployment outcomes.</p>
      </div>
      <div className="top-actions">
        <button type="button" onClick={onToggleTheme}>
          {theme === "light" ? "Dark mode" : "Light mode"}
        </button>
        {userMovedMap && (
          <button type="button" onClick={onRefocus}>
            Refocus region
          </button>
        )}
      </div>
    </header>
  );
}

export default TopBar;
