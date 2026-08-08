(function () {
  "use strict";

  // ---------- Constants ----------
  const DATA_START = SOLAR_DATA.DATA_START;
  const DATA_END = SOLAR_DATA.DATA_END; // Jul 2026
  const SERIES = SOLAR_DATA.series;
  const PROJECTION_END = new Date(Date.UTC(2060, 0, 1));
  const MILESTONE_VALUE = 10.0; // W/m^2 above 1970-1999 baseline
  const REGRESSION_WINDOW_YEARS = 30;
  const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365.25;

  const COLOR = {
    dotOld: "#4b3b7a",
    dotMid: "#c9438c",
    dotRecent: "#ffb020",
    trend: "#ffd23f",
    trendDim: "#ff8f5e",
    band: "rgba(255, 107, 53, 0.14)",
    current: "#ffd23f",
    milestone: "#ff3d7f",
  };

  // ---------- Helpers ----------
  function yearFrac(date) {
    return date.getUTCFullYear() + date.getUTCMonth() / 12;
  }
  function dateFromYearFrac(yf) {
    let year = Math.floor(yf);
    let month = Math.round((yf - year) * 12);
    if (month >= 12) {
      month = 0;
      year += 1;
    }
    return new Date(Date.UTC(year, month, 1));
  }
  function formatValue(v) {
    return (v >= 0 ? "+" : "") + v.toFixed(1) + " W/m²";
  }
  const formatMonthYear = d3.utcFormat("%b %Y");

  function linreg(points) {
    const n = points.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (const p of points) {
      sumX += p.x;
      sumY += p.y;
      sumXY += p.x * p.y;
      sumXX += p.x * p.x;
    }
    const denom = n * sumXX - sumX * sumX;
    const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
  }

  function bandHalfWidth(yearsFromAnchor) {
    const t = Math.max(0, yearsFromAnchor);
    return 0.4 + 1.3 * Math.sqrt(t / REGRESSION_WINDOW_YEARS);
  }

  // ---------- Compressed "extrapolate from" timeline scale ----------
  const dataEndYearFrac = yearFrac(DATA_END);
  const anchorMinYearFrac = 1990;
  const timeKnots = [anchorMinYearFrac, 2000, 2012, 2020, 2024, 2025.5, dataEndYearFrac];
  const posKnots = [0, 120, 330, 480, 600, 820, 1000];
  const xAnchorScale = d3.scaleLinear().domain(timeKnots).range(posKnots).clamp(true);

  // ---------- Main chart dimensions ----------
  const WIDTH = 1400;
  const HEIGHT = 620;
  const MARGIN = { top: 24, right: 130, bottom: 50, left: 60 };
  const innerWidth = WIDTH - MARGIN.left - MARGIN.right;
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  const x = d3.scaleUtc().domain([DATA_START, PROJECTION_END]).range([0, innerWidth]);
  const y = d3.scaleLinear().domain([-6, 16]).range([innerHeight, 0]).nice();

  // ---------- Build static SVG scaffold ----------
  const svg = d3
    .select("#chart")
    .append("svg")
    .attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);

  const root = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  // gridlines
  root
    .append("g")
    .attr("class", "gridlines")
    .selectAll("line")
    .data(y.ticks(7))
    .join("line")
    .attr("class", "gridline")
    .attr("x1", 0)
    .attr("x2", innerWidth)
    .attr("y1", (d) => y(d))
    .attr("y2", (d) => y(d));

  // axes
  const xAxis = d3.axisBottom(x).ticks(d3.utcYear.every(5)).tickFormat(d3.utcFormat("%Y")).tickSizeOuter(0);
  const yAxis = d3
    .axisLeft(y)
    .ticks(7)
    .tickFormat((d) => (d >= 0 ? "+" : "") + d + " W/m²")
    .tickSizeOuter(0);

  root.append("g").attr("class", "axis x-axis").attr("transform", `translate(0,${innerHeight})`).call(xAxis);
  root.append("g").attr("class", "axis y-axis").call(yAxis);

  // observed data: gradient line + dots
  const defs = svg.append("defs");
  const gradient = defs
    .append("linearGradient")
    .attr("id", "obsGradient")
    .attr("x1", "0%")
    .attr("x2", "100%")
    .attr("y1", "0%")
    .attr("y2", "0%");
  gradient.append("stop").attr("offset", "0%").attr("stop-color", COLOR.dotOld);
  gradient.append("stop").attr("offset", "55%").attr("stop-color", COLOR.dotMid);
  gradient.append("stop").attr("offset", "100%").attr("stop-color", COLOR.dotRecent);

  // soft neon glow used on the fitted trend line + the current-value marker
  const glow = defs.append("filter").attr("id", "glow").attr("x", "-60%").attr("y", "-60%").attr("width", "220%").attr("height", "220%");
  glow.append("feGaussianBlur").attr("stdDeviation", 3.2).attr("result", "blur");
  const glowMerge = glow.append("feMerge");
  glowMerge.append("feMergeNode").attr("in", "blur");
  glowMerge.append("feMergeNode").attr("in", "SourceGraphic");

  const colorScale = d3.interpolateRgbBasis([COLOR.dotOld, COLOR.dotMid, COLOR.dotRecent]);

  const lineGen = d3
    .line()
    .x((d) => x(d.date))
    .y((d) => y(d.value));

  root
    .append("path")
    .datum(SERIES)
    .attr("class", "observed-line")
    .attr("fill", "none")
    .attr("stroke", "url(#obsGradient)")
    .attr("stroke-width", 1.1)
    .attr("stroke-opacity", 0.55)
    .attr("d", lineGen);

  root
    .append("g")
    .attr("class", "observed-dots")
    .selectAll("circle")
    .data(SERIES)
    .join("circle")
    .attr("cx", (d) => x(d.date))
    .attr("cy", (d) => y(d.value))
    .attr("r", 2)
    .attr("fill", (d, i) => colorScale(i / (SERIES.length - 1)))
    .attr("fill-opacity", 0.9);

  // dynamic layers (updated on slider move)
  const bandArea = d3
    .area()
    .x((d) => x(d.date))
    .y0((d) => y(d.lo))
    .y1((d) => y(d.hi));

  const gBand = root.append("path").attr("class", "band").attr("fill", COLOR.band).attr("stroke", "none");

  const gTrendSolid = root
    .append("path")
    .attr("class", "trend-solid")
    .attr("fill", "none")
    .attr("stroke", COLOR.trend)
    .attr("stroke-width", 2.5)
    .attr("filter", "url(#glow)");

  const gTrendDashed = root
    .append("path")
    .attr("class", "trend-dashed")
    .attr("fill", "none")
    .attr("stroke", COLOR.trendDim)
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "2,3");

  const gCurrentHLine = root
    .append("line")
    .attr("class", "current-hline")
    .attr("stroke", COLOR.current)
    .attr("stroke-width", 1.3)
    .attr("stroke-dasharray", "1,4");

  const gMilestoneHLine = root
    .append("line")
    .attr("class", "milestone-hline")
    .attr("x1", 0)
    .attr("x2", innerWidth)
    .attr("y1", y(MILESTONE_VALUE))
    .attr("y2", y(MILESTONE_VALUE))
    .attr("stroke", COLOR.milestone)
    .attr("stroke-width", 1.3)
    .attr("stroke-dasharray", "1,4");

  root
    .append("text")
    .attr("class", "milestone-label")
    .attr("x", innerWidth + 8)
    .attr("y", y(MILESTONE_VALUE) + 4)
    .attr("fill", COLOR.milestone)
    .attr("font-weight", 600)
    .text(formatValue(MILESTONE_VALUE));

  const gCurrentLabel = root
    .append("text")
    .attr("class", "current-label")
    .attr("x", innerWidth + 8)
    .attr("fill", COLOR.current)
    .attr("font-weight", 600);

  const gAnchorVLine = root
    .append("line")
    .attr("class", "anchor-vline")
    .attr("y2", innerHeight)
    .attr("stroke", COLOR.current)
    .attr("stroke-width", 1.3)
    .attr("stroke-dasharray", "1,4");

  const gAnchorVLabel = root
    .append("text")
    .attr("class", "anchor-vlabel")
    .attr("y", innerHeight + 34)
    .attr("fill", COLOR.current)
    .attr("text-anchor", "middle")
    .attr("font-weight", 600);

  const gAnchorDot = root
    .append("circle")
    .attr("class", "anchor-dot")
    .attr("r", 6)
    .attr("fill", "#0b0718")
    .attr("stroke", COLOR.current)
    .attr("stroke-width", 3)
    .attr("filter", "url(#glow)");

  const gCrossVLine = root
    .append("line")
    .attr("class", "cross-vline")
    .attr("y2", innerHeight)
    .attr("stroke", COLOR.milestone)
    .attr("stroke-width", 1.3)
    .attr("stroke-dasharray", "1,4");

  const gCrossVLabel = root
    .append("text")
    .attr("class", "cross-vlabel")
    .attr("y", innerHeight + 34)
    .attr("fill", COLOR.milestone)
    .attr("text-anchor", "middle")
    .attr("font-weight", 600);

  const gProjectedDiamond = root
    .append("path")
    .attr("class", "projected-diamond")
    .attr("d", d3.symbol(d3.symbolDiamond, 90)())
    .attr("fill", COLOR.milestone);

  // ---------- Render function ----------
  function render(anchorDate, animate) {
    const t = animate ? root.transition().duration(500).ease(d3.easeCubicOut) : root;

    const windowStart = new Date(Math.max(DATA_START.getTime(), anchorDate.getTime() - REGRESSION_WINDOW_YEARS * MS_PER_YEAR));
    const windowPoints = SERIES.filter((p) => p.date >= windowStart && p.date <= anchorDate).map((p) => ({
      x: yearFrac(p.date),
      y: p.value,
    }));
    const { slope, intercept } = linreg(windowPoints);

    const anchorYF = yearFrac(anchorDate);
    const anchorVal = slope * anchorYF + intercept;
    const startVal = slope * yearFrac(windowStart) + intercept;

    // solid fitted trend (regression window)
    (animate ? gTrendSolid.transition(t) : gTrendSolid)
      .attr("d", `M${x(windowStart)},${y(startVal)} L${x(anchorDate)},${y(anchorVal)}`);

    // crossing date for the milestone (if the trend keeps sloping)
    let crossingDate = null;
    if (slope > 0) {
      const crossingYF = (MILESTONE_VALUE - intercept) / slope;
      const candidate = dateFromYearFrac(crossingYF);
      if (candidate > anchorDate && candidate <= PROJECTION_END) {
        crossingDate = candidate;
      }
    }

    // dashed extrapolation path + uncertainty band samples
    const dashedPts = [];
    const bandPts = [];
    const endDate = crossingDate || PROJECTION_END;
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const d = new Date(anchorDate.getTime() + (i / steps) * (endDate.getTime() - anchorDate.getTime()));
      const v = slope * yearFrac(d) + intercept;
      dashedPts.push({ date: d, value: v });
      const yrs = (d - anchorDate) / MS_PER_YEAR;
      const hw = bandHalfWidth(yrs);
      bandPts.push({ date: d, lo: v - hw, hi: v + hw });
    }
    if (crossingDate) {
      // flat continuation at the milestone value out to the projection end
      const flatSteps = 20;
      for (let i = 1; i <= flatSteps; i++) {
        const d = new Date(crossingDate.getTime() + (i / flatSteps) * (PROJECTION_END.getTime() - crossingDate.getTime()));
        dashedPts.push({ date: d, value: MILESTONE_VALUE });
        const yrs = (d - anchorDate) / MS_PER_YEAR;
        const hw = bandHalfWidth(yrs);
        bandPts.push({ date: d, lo: MILESTONE_VALUE - hw, hi: MILESTONE_VALUE + hw });
      }
    }

    const dashedLine = d3.line().x((d) => x(d.date)).y((d) => y(d.value))(dashedPts);
    (animate ? gTrendDashed.transition(t) : gTrendDashed).attr("d", dashedLine);
    (animate ? gBand.transition(t) : gBand).attr("d", bandArea(bandPts));

    // current value guide lines / dot
    (animate ? gCurrentHLine.transition(t) : gCurrentHLine)
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", y(anchorVal))
      .attr("y2", y(anchorVal));
    gCurrentLabel.attr("y", y(anchorVal) + 4);
    (animate ? gCurrentLabel.transition(t) : gCurrentLabel).text(formatValue(anchorVal));

    (animate ? gAnchorVLine.transition(t) : gAnchorVLine).attr("x1", x(anchorDate)).attr("x2", x(anchorDate)).attr("y1", y(anchorVal));
    gAnchorVLabel.attr("x", x(anchorDate));
    (animate ? gAnchorVLabel.transition(t) : gAnchorVLabel).text(formatMonthYear(anchorDate));
    (animate ? gAnchorDot.transition(t) : gAnchorDot).attr("cx", x(anchorDate)).attr("cy", y(anchorVal));

    if (crossingDate) {
      gCrossVLine.style("display", null);
      gCrossVLabel.style("display", null);
      (animate ? gCrossVLine.transition(t) : gCrossVLine)
        .attr("x1", x(crossingDate))
        .attr("x2", x(crossingDate))
        .attr("y1", y(MILESTONE_VALUE));
      gCrossVLabel.attr("x", x(crossingDate));
      (animate ? gCrossVLabel.transition(t) : gCrossVLabel).text(formatMonthYear(crossingDate));
    } else {
      gCrossVLine.style("display", "none");
      gCrossVLabel.style("display", "none");
    }

    const diamondX = x(new Date(Math.min(PROJECTION_END.getTime(), (crossingDate || PROJECTION_END).getTime() + 8 * MS_PER_YEAR)));
    (animate ? gProjectedDiamond.transition(t) : gProjectedDiamond).attr(
      "transform",
      `translate(${diamondX},${y(MILESTONE_VALUE)})`
    );

    // headline text
    document.getElementById("currentValue").textContent = formatValue(anchorVal);
    document.getElementById("currentDate").textContent = formatMonthYear(anchorDate);
    document.getElementById("milestoneValue").textContent = formatValue(MILESTONE_VALUE);
    document.getElementById("milestoneDate").textContent = crossingDate
      ? formatMonthYear(crossingDate)
      : "beyond " + formatMonthYear(PROJECTION_END);
    document.getElementById("anchorLabel").textContent = formatMonthYear(anchorDate);
  }

  // ---------- Mini (compressed) timeline under the slider ----------
  function renderMiniAxis() {
    const miniWidth = 1000;
    const miniHeight = 26;
    const svgMini = d3
      .select("#miniAxis")
      .append("svg")
      .attr("viewBox", `0 0 ${miniWidth} ${miniHeight}`);

    const tickDates = [
      Date.UTC(2000, 0), Date.UTC(2004, 0), Date.UTC(2008, 0), Date.UTC(2012, 0),
      Date.UTC(2016, 0), Date.UTC(2020, 0), Date.UTC(2024, 0),
      Date.UTC(2025, 6), Date.UTC(2026, 0), DATA_END.getTime(),
    ].map((t) => new Date(t));

    const g = svgMini.append("g");
    g.append("line").attr("x1", 0).attr("x2", miniWidth).attr("y1", 0.5).attr("y2", 0.5).attr("stroke", "rgba(255,255,255,0.1)");

    g.selectAll("g.tick")
      .data(tickDates)
      .join("g")
      .attr("class", "tick")
      .attr("transform", (d) => `translate(${xAnchorScale(yearFrac(d))},0)`)
      .call((sel) => {
        sel.append("line").attr("y1", 0).attr("y2", 5).attr("stroke", "#6f6396");
        sel
          .append("text")
          .attr("y", 17)
          .attr("text-anchor", (d, i, nodes) =>
            i === 0 ? "start" : i === nodes.length - 1 ? "end" : "middle"
          )
          .attr("font-family", "JetBrains Mono, monospace")
          .attr("font-size", 10)
          .attr("fill", "#9c90c4")
          .text((d) => (d.getUTCFullYear() >= 2025 ? formatMonthYear(d) : String(d.getUTCFullYear())));
      });
  }

  // ---------- Legend ----------
  function renderLegend() {
    const items = [
      { label: "Trend line", swatch: `<span class="legend-dot" style="background:${COLOR.trend};box-shadow:0 0 8px ${COLOR.trend}"></span>` },
      {
        label: "Observed data",
        swatch: `<span class="legend-swatch" style="background:linear-gradient(90deg, ${COLOR.dotOld}, ${COLOR.dotMid}, ${COLOR.dotRecent})"></span>`,
      },
      {
        label: "Projected estimate",
        swatch: `<svg width="14" height="14" viewBox="0 0 14 14"><path d="M7,1 L13,7 L7,13 L1,7 Z" fill="${COLOR.milestone}"/></svg>`,
      },
      { label: "Uncertainty range", swatch: `<span class="legend-swatch" style="background:${COLOR.band};border:1px solid ${COLOR.dotRecent}66"></span>` },
    ];
    d3.select("#legend")
      .selectAll(".legend-item")
      .data(items)
      .join("div")
      .attr("class", "legend-item")
      .html((d) => d.swatch + `<span>${d.label}</span>`);
  }

  // ---------- Wire up slider ----------
  const slider = document.getElementById("anchorSlider");
  const sliderFill = document.getElementById("sliderFill");
  const sliderSection = document.querySelector(".slider-section");
  slider.min = 0;
  slider.max = 1000;
  slider.step = 1;
  slider.value = 1000;

  function anchorFromSliderValue(v) {
    const yf = xAnchorScale.invert(+v);
    return dateFromYearFrac(yf);
  }

  function updateSliderFill() {
    const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
    sliderFill.style.width = pct + "%";
  }

  slider.addEventListener("input", () => {
    updateSliderFill();
    render(anchorFromSliderValue(slider.value), false);
  });
  slider.addEventListener("change", () => {
    render(anchorFromSliderValue(slider.value), true);
  });
  slider.addEventListener("pointerdown", () => sliderSection.classList.add("dragging"));
  window.addEventListener("pointerup", () => sliderSection.classList.remove("dragging"));

  renderMiniAxis();
  renderLegend();
  updateSliderFill();
  render(DATA_END, false);
})();
