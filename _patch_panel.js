  _updatePanel() {
    if (!this.infoPanel) return;
    const cycleElapsed = (performance.now() - this.cycleStart) % this.dayDuration;
    const pct = Math.round((cycleElapsed / this.dayDuration) * 100);
    const cycleLabel = this.isNight ? '🌙 Nuit' : '☀️ Jour';

    // 🚀 Optimisation DOM : ne rebuilder que si l'état a changé (évite ~1200 node créations/200ms)
    const stateHash = this.entities.map(e =>
      `${e.id}:${e.state}:${Math.round(e.mood * 10)}:${Math.round(e.energy)}:${e === this.selectedEntity ? 1 : 0}`
    ).join('|') + `|${this.dayCount}|${pct}|${this.activeEvent ? this.activeEvent.label : ''}`;
    if (stateHash === this._panelStateHash) return;
    this._panelStateHash = stateHash;

    let html = `<div class="cycle-indicator">${cycleLabel} - Jour ${this.dayCount} (${pct}%)</div>`;

    if (this.activeEvent) {
      const evPct = Math.round(this._eventTimer / this.activeEvent.duration * 100);
      html += `<div class="event-tag" style="border-color:${this.activeEvent.color};color:${this.activeEvent.color}">${this.activeEvent.label} ${evPct}%</div>`;
    }

    html += `<div class="entity-list">`;

    for (const e of this.entities) {
      const moodClass = e.mood > 0.2 ? 'mood-pos' : e.mood < -0.2 ? 'mood-neg' : 'mood-neu';
      const moodBar   = Math.round((e.mood + 1) / 2 * 100);
      const energyPct = Math.round(e.energy);
      const isSelected = (e === this.selectedEntity);
      const isSaturated = (e.state === STATE.SATURE);
      const moodTrend = (() => {
        const hist = e.moodHistory;
        if (hist.length < 3) return '';
        const delta = hist[hist.length - 1] - hist[hist.length - 3];
        return delta > 0.05 ? String.fromCodePoint(0x2191) : delta < -0.05 ? String.fromCodePoint(0x2193) : String.fromCodePoint(0x2192);
      })();
      html += `
        <div class="entity-row${isSelected ? ' entity-row--selected' : ''}" data-id="${e.id}" style="${isSelected ? `border-left:2px solid ${e.color};padding-left:4px` : ''}">
          <span class="entity-dot" style="background:${e.color}"></span>
          <span class="entity-id">${e.id}</span>
          <span class="entity-state state-${e.state.toLowerCase()}">${e.state}</span>
          <span class="entity-stat">⚡${energyPct}</span>
          <span class="entity-stat ${moodClass}">${moodBar}%${moodTrend}</span>
          ${e.successCount > 0 ? `<span class="entity-stat" style="color:#f9ca24">★${e.successCount}</span>` : ''}
          ${isSaturated ? `<span class="entity-stat" style="color:#ff7675">💤</span>` : ''}
        </div>`;
    }

    html += `</div>`;
    html += `<div style="margin-top:8px;font-size:9px;color:#555;text-align:center">Clic sur entité pour inspecter • H = heatmap</div>`;

    this.infoPanel.innerHTML = html;
  }
}