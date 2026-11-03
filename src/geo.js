/*
 * Move Recap: workout start coordinates → city and country, offline.
 *
 * The city list (GeoNames via all-the-cities, CC BY 4.0) is built into js/cities.js and only loaded
 * when a full export is opened. Nothing is looked up online: coordinates never leave the page.
 *
 * nearest(lat, lon): the most populous listed city within 25 km (so districts such as Muratpaşa
 * or Konyaaltı roll up into Antalya), else the closest one within 60 km, else null.
 */
(function (root) {
  "use strict";
  let rows = null;
  const cache = new Map();
  function setData(text) {
    rows = text ? text.split("\n").map(l => { const [name, cc, lat, lon, pop] = l.split("|"); return { name, cc, lat: +lat, lon: +lon, pop: +pop }; }) : null;
    cache.clear();
  }
  const km = (a, lat, lon) => {
    const dx = (a.lon - lon) * 111.32 * Math.cos(lat * Math.PI / 180), dy = (a.lat - lat) * 110.57;
    return Math.sqrt(dx * dx + dy * dy);
  };
  function nearest(lat, lon) {
    if (!rows || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    if (cache.has(key)) return cache.get(key);
    let big = null, close = null, closeD = Infinity;
    for (const r of rows) {
      if (Math.abs(r.lat - lat) > 0.6) continue;               // ~65 km: skip most of the world cheaply
      const d = km(r, lat, lon);
      if (d <= 25 && (!big || r.pop > big.pop)) big = r;
      if (d <= 60 && d < closeD) { close = r; closeD = d; }
    }
    const hit = big || close, out = hit ? { city: hit.name, cc: hit.cc } : null;
    cache.set(key, out);
    return out;
  }
  let names = null;
  function countryName(cc) {
    try { names ||= new Intl.DisplayNames(["en"], { type: "region" }); return names.of(cc) || cc; } catch { return cc; }
  }
  const api = { setData, nearest, countryName, ready: () => !!rows };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Geo = api;
})(typeof window !== "undefined" ? window : globalThis);
