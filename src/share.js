/*
 * Wellbeing Recap: share images.
 *
 * Draws one recap card onto a <canvas> so people can post it. Canvas is used
 * instead of screenshotting the DOM because DOM-to-image tricks break on
 * Safari, which is where most Instagram stories are made.
 *
 *   const canvas = await Share.render(spec, { theme: "antalya", format: "story", units });
 *   const file = await Share.toFile(canvas, "recap-steps.png");
 *
 * spec: { id, eyebrow, chip?, headline, body?, big?: [value, label],
 *         viz?: { type: "clock" | "zones" | "bars" | "ba" | "rows" | "tiles", ... },
 *         period, name? }
 *
 * Only the summary ("end") card carries the "Want yours?" invitation with the site address.
 *
 * Formats: "story" 1080×1920 keeps text out of Instagram's top and bottom UI;
 *          "post"  1080×1350 (4:5) fits Instagram feed, LinkedIn and Strava.
 */
(function (root) {
  "use strict";

  const SITE = "recap.mertcangenc.com";
  const FORMATS = {
    story: { w: 1080, h: 1920, top: 250, bottom: 330, scale: 1 },
    post: { w: 1080, h: 1350, top: 110, bottom: 120, scale: 0.84 },
  };

  /* ------------------------------------------------------------------ themes */
  const ANTALYA_BG = { intro: "#0d3a5c", totals: "#ee6420", when: "#0d3a5c", zones: "#0c6b66", stress: "#a8213b", steps: "#0c6b66",
    sleep: "#1e1a3a", sweat: "#ee6420", climb: "#0d3a5c", body: "#ecdcbc", end: "#0c6b66" };
  const DARK_INK = new Set(["totals", "sweat", "body"]);

  const THEMES = {
    antalya: {
      name: "Antalya",
      fonts: { display: '"Unbounded"', body: '"Familjen Grotesk"', mono: '"JetBrains Mono"' },
      weights: { display: 700, big: 900, body: 400, mono: 400 },
      upper: false,
      colors(id) {
        const dark = DARK_INK.has(id);
        return { bg: ANTALYA_BG[id] || "#14112a", ink: dark ? "#1d1528" : "#fff8ee", dim: dark ? "rgba(29,21,40,.82)" : "rgba(255,248,238,.86)",
          accent: dark ? "#1d1528" : "#ee6420", peak: dark ? "#1d1528" : "#ee6420", bar: dark ? "#1d1528" : "#fff8ee", track: dark ? "rgba(29,21,40,.18)" : "rgba(255,248,238,.18)",
          zone: ["#ecdcbc", "#ee6420", "#a8213b"], zoneInk: ["#14112a", "#14112a", "#fff8ee"] };
      },
    },
    bib: {
      name: "Race Bib",
      fonts: { display: '"Big Shoulders Display"', body: '"Barlow"', mono: '"IBM Plex Mono"' },
      weights: { display: 900, big: 900, body: 400, mono: 400 },
      upper: true,
      colors() {
        return { bg: "#fbfbf7", ink: "#111111", dim: "#4d4d48", accent: "#d6261c", peak: "#d6261c", bar: "#d6261c", track: "#e3e3dc",
          zone: ["#c9c9c2", "#111111", "#d6261c"], zoneInk: ["#111111", "#fbfbf7", "#ffffff"] };
      },
    },
    topo: {
      name: "Topo",
      fonts: { display: '"Zilla Slab"', body: '"Work Sans"', mono: '"Space Mono"' },
      weights: { display: 700, big: 700, body: 400, mono: 400 },
      upper: false,
      colors() {
        return { bg: "#d9dcc8", ink: "#1f2b22", dim: "#3b4637", accent: "#b9461c", peak: "#b9461c", bar: "#b9461c", track: "rgba(31,43,34,.16)",
          zone: ["#9aa386", "#5f6b52", "#b9461c"], zoneInk: ["#1f2b22", "#ffffff", "#ffffff"] };
      },
    },
  };

  async function loadFonts(theme) {
    if (!root.document || !document.fonts) return;
    const f = theme.fonts, w = theme.weights;
    await Promise.all([`${w.display} 40px ${f.display}`, `${w.big} 40px ${f.display}`, `${w.body} 40px ${f.body}`, `600 40px ${f.body}`,
      `${w.mono} 40px ${f.mono}`].map(s => document.fonts.load(s, "Aa ğşıİçö 0123").catch(() => null)));
  }

  /* ----------------------------------------------------------------- helpers */
  function wrap(ctx, text, maxW, maxLines) {
    const words = String(text).split(/\s+/), lines = [];
    let line = "";
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…"; }
    return lines;
  }
  function spaced(ctx, px) { if ("letterSpacing" in ctx) ctx.letterSpacing = `${px}px`; }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
  function seeded(seed) { let s = 0; for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) % 233280; return () => (s = (s * 9301 + 49297) % 233280) / 233280; }

  /* ------------------------------------------------------------- backgrounds */
  function background(ctx, F, theme, spec, C) {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, F.w, F.h);
    if (theme === THEMES.antalya && (spec.id === "intro" || spec.id === "end")) {
      const g = spec.id === "end" ? ctx.createLinearGradient(0, 0, F.w * .6, F.h) : ctx.createRadialGradient(F.w * .8, F.h, 0, F.w * .8, F.h, F.h * .7);
      if (spec.id === "end") { g.addColorStop(0, "#0d3a5c"); g.addColorStop(.6, "#0c6b66"); g.addColorStop(1, "#5a6a3c"); }
      else { g.addColorStop(0, "rgba(238,100,32,.95)"); g.addColorStop(1, "rgba(238,100,32,0)"); }
      ctx.fillStyle = g; ctx.fillRect(0, 0, F.w, F.h);
    }
    if (theme === THEMES.topo) {
      const rnd = seeded(spec.id + F.h);
      const hills = [[F.w * (.2 + rnd() * .6), F.h * (.3 + rnd() * .45)]];
      const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
      hills.forEach(([hx, hy], k) => {
        for (let i = 1; i < 26; i++) {
          const base = i * 62;
          ctx.beginPath();
          for (let t = 0; t <= 96; t++) {
            const a = t / 96 * Math.PI * 2;
            const w = 1 + .16 * Math.sin(3 * a + ph[0] + i * .3) + .09 * Math.sin(5 * a + ph[1]) + .06 * Math.sin(7 * a + ph[2] + i * .2);
            const x = hx + Math.cos(a) * base * w * 1.15, y = hy + Math.sin(a) * base * w * .85;
            t ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          ctx.strokeStyle = i % 5 === 0 ? "rgba(31,43,34,.26)" : "rgba(95,107,82,.2)";
          ctx.lineWidth = i % 5 === 0 ? 2.6 : 1.5; ctx.stroke();
        }
      });
    }
  }

  /* -------------------------------------------------------------------- viz */
  function drawViz(ctx, viz, x, y, w, h, theme, C, units) {
    const T = theme.fonts, mono = s => `${theme.weights.mono} ${s}px ${T.mono}`;
    if (!viz) return 0;
    if (viz.type === "clock") {
      const cx = x + w / 2, r0 = h * .2, rmax = h * .44, cy = y + h / 2, vals = Object.values(viz.byHour), max = Math.max(...vals, 1);
      ctx.lineCap = "round";
      for (let hr = 0; hr < 24; hr++) {
        const v = viz.byHour[hr] || 0, a = hr / 24 * Math.PI * 2 - Math.PI / 2 + Math.PI / 24, len = v ? h * .03 + v / max * (rmax - r0 - h * .03) : 4;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
        ctx.strokeStyle = v === max ? C.peak : C.dim; ctx.globalAlpha = v === max ? 1 : .7; ctx.lineWidth = h * .034; ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.fillStyle = C.dim; ctx.font = mono(Math.round(h * .052)); ctx.textAlign = "center";
      [[0, "12 AM"], [6, "6 AM"], [12, "12 PM"], [18, "6 PM"]].forEach(([hr, t]) => { const a = hr / 24 * Math.PI * 2 - Math.PI / 2; ctx.fillText(t, cx + Math.cos(a) * (rmax + h * .07), cy + Math.sin(a) * (rmax + h * .07) + h * .018); });
      ctx.textAlign = "left"; return h;
    }
    if (viz.type === "zones") {
      const bh = h * .26, by = y + h * .3, segs = [viz.shares.easy, viz.shares.mid, viz.shares.hard], labels = ["easy", "tempo", "hard"];
      let cxp = x;
      ctx.save(); roundRect(ctx, x, by, w, bh, bh * .3); ctx.clip();
      segs.forEach((s, i) => { const sw = s * w; ctx.fillStyle = C.zone[i]; ctx.fillRect(cxp, by, sw + 1, bh);
        if (sw > w * .2) { ctx.fillStyle = C.zoneInk[i]; ctx.font = `600 ${Math.round(bh * .42)}px ${T.body}`; ctx.textAlign = "center"; ctx.fillText(`${labels[i]} ${Math.round(s * 100)}%`, cxp + sw / 2, by + bh * .64); ctx.textAlign = "left"; }
        cxp += sw; });
      ctx.restore();
      const tx = x + .8 * w; ctx.setLineDash([10, 10]); ctx.strokeStyle = C.ink; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(tx, by - h * .12); ctx.lineTo(tx, by - 6); ctx.moveTo(tx, by + bh + 6); ctx.lineTo(tx, by + bh + h * .12); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(tx - 12, by - 8); ctx.lineTo(tx + 12, by - 8); ctx.lineTo(tx, by + 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = C.ink; ctx.font = mono(Math.round(h * .07)); ctx.textAlign = "center"; ctx.fillText("80% easy target", tx, by - h * .16); ctx.textAlign = "left";
      ctx.fillStyle = C.dim; ctx.fillText("Zones 1–2", x, by + bh + h * .22); ctx.textAlign = "right"; ctx.fillText("Zones 4–5", x + w, by + bh + h * .22); ctx.textAlign = "left";
      return h;
    }
    if (viz.type === "bars") {
      const rows = viz.rows, vals = rows.map(r => r[1]), lo = Math.min(...vals) - (Math.max(...vals) - Math.min(...vals) || 4) * .6, hi = Math.max(...vals), bw = w / rows.length, chartH = h * .74;
      rows.forEach(([lab, v], i) => {
        const bh = Math.max(8, (v - lo) / (hi - lo || 1) * chartH), bx = x + i * bw + bw * .12, top = y + h * .1 + chartH - bh;
        ctx.fillStyle = v === hi ? C.bar : C.dim;
        ctx.globalAlpha = v === hi ? 1 : .45; roundRect(ctx, bx, top, bw * .76, bh, 10); ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = C.ink; ctx.font = mono(Math.round(h * .07)); ctx.textAlign = "center"; ctx.fillText(String(Math.round(v)), bx + bw * .38, top - h * .03);
        ctx.fillStyle = C.dim; ctx.fillText(lab, bx + bw * .38, y + h * .1 + chartH + h * .1); ctx.textAlign = "left";
      });
      return h;
    }
    if (viz.type === "ba") {
      const rh = h / Math.max(viz.rows.length, 1);
      viz.rows.forEach((r, i) => {
        const ry = y + i * rh; ctx.strokeStyle = C.track; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, ry); ctx.lineTo(x + w, ry); ctx.stroke();
        ctx.fillStyle = C.dim; ctx.font = mono(Math.round(rh * .17)); ctx.fillText(r.label.toUpperCase(), x, ry + rh * .3);
        // label sits on its own line; numbers right-aligned underneath so long labels never collide
        const unitW = r.unit ? rh * .62 : 0, base = ry + rh * .84;
        ctx.textAlign = "right";
        if (r.unit) { ctx.fillStyle = C.dim; ctx.font = mono(Math.round(rh * .16)); ctx.fillText(r.unit, x + w, base); }
        ctx.fillStyle = C.ink; ctx.font = `${theme.weights.big} ${Math.round(rh * .46)}px ${T.display}`;
        const toRight = x + w - unitW; ctx.fillText(r.to, toRight, base);
        const toW = ctx.measureText(r.to).width;
        ctx.fillStyle = C.dim; ctx.font = `${theme.weights.display} ${Math.round(rh * .28)}px ${T.display}`;
        const arrowRight = toRight - toW - rh * .2; ctx.fillText("→", arrowRight, base - rh * .04);
        const arrowW = ctx.measureText("→").width, fromRight = arrowRight - arrowW - rh * .2;
        ctx.fillText(r.from, fromRight, base - rh * .04); const fw = ctx.measureText(r.from).width;
        ctx.strokeStyle = C.dim; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(fromRight - fw, base - rh * .13); ctx.lineTo(fromRight, base - rh * .13); ctx.stroke();
        ctx.textAlign = "left";
      });
      return h;
    }
    if (viz.type === "rows") {
      const rh = Math.min(h / Math.max(viz.rows.length, 1), 150);
      viz.rows.forEach(([lab, right, frac], i) => {
        const ry = y + i * rh;
        ctx.fillStyle = C.ink; ctx.font = `600 ${Math.round(rh * .32)}px ${T.body}`; ctx.fillText(lab.charAt(0).toUpperCase() + lab.slice(1), x, ry + rh * .38);
        ctx.fillStyle = C.dim; ctx.font = mono(Math.round(rh * .24)); ctx.textAlign = "right"; ctx.fillText(right, x + w, ry + rh * .38); ctx.textAlign = "left";
        ctx.fillStyle = C.track; roundRect(ctx, x, ry + rh * .52, w, rh * .16, rh * .08); ctx.fill();
        ctx.fillStyle = C.ink; roundRect(ctx, x, ry + rh * .52, Math.max(rh * .16, w * frac), rh * .16, rh * .08); ctx.fill();
      });
      return viz.rows.length * rh;
    }
    if (viz.type === "tiles") {
      const cols = 2, rowsN = Math.ceil(viz.tiles.length / cols), th = Math.min(h / rowsN, 190), tw = w / cols;
      viz.tiles.forEach(([v, k], i) => {
        const tx = x + (i % cols) * tw, ty = y + Math.floor(i / cols) * th;
        ctx.strokeStyle = C.track; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + tw - 24, ty); ctx.stroke();
        ctx.fillStyle = C.ink; ctx.font = `${theme.weights.display} ${Math.round(th * (String(v).length > 10 ? .22 : .3))}px ${T.display}`;
        const lines = wrap(ctx, theme.upper ? String(v).toUpperCase() : v, tw - 40, 2);
        lines.forEach((l, j) => ctx.fillText(l, tx, ty + th * .4 + j * th * .28));
        ctx.fillStyle = C.dim; ctx.font = mono(Math.round(th * .14)); ctx.fillText(String(k).toUpperCase(), tx, ty + th * (lines.length > 1 ? .9 : .66));
      });
      return rowsN * th;
    }
    return 0;
  }

  /* ------------------------------------------------------------------ render */
  async function render(spec, { theme: themeKey = "antalya", format = "story" } = {}) {
    const theme = THEMES[themeKey] || THEMES.antalya, F = FORMATS[format] || FORMATS.story, C = theme.colors(spec.id), s = F.scale;
    await loadFonts(theme);
    const canvas = document.createElement("canvas"); canvas.width = F.w; canvas.height = F.h;
    const ctx = canvas.getContext("2d"); ctx.textBaseline = "alphabetic";
    const T = theme.fonts, X = 96, W = F.w - X * 2;
    const mono = px => `${theme.weights.mono} ${Math.round(px * s)}px ${T.mono}`;
    background(ctx, F, theme, spec, C);
    let y = F.top;

    // theme chrome at the top
    if (theme === THEMES.bib) {
      const bandY = F.top - 150 * s, bandH = 120 * s;
      ctx.fillStyle = C.accent; ctx.fillRect(0, bandY, F.w, bandH);
      ctx.fillStyle = "#ffffff"; ctx.font = `900 ${Math.round(64 * s)}px ${T.display}`; spaced(ctx, 4);
      ctx.fillText(`RECAP ${spec.year || ""}`.trim(), X, bandY + bandH * .7); spaced(ctx, 0);
      ctx.font = mono(26); ctx.textAlign = "right"; ctx.fillText(String(spec.eyebrow).toUpperCase().slice(0, 28), F.w - X, bandY + bandH * .64); ctx.textAlign = "left";
      ctx.fillStyle = "#121019"; [[40, bandY + bandH + 40], [F.w - 40, bandY + bandH + 40], [40, F.h - F.bottom + 10], [F.w - 40, F.h - F.bottom + 10]].forEach(([px, py]) => { ctx.beginPath(); ctx.arc(px, py, 14, 0, Math.PI * 2); ctx.fill(); });
      y = bandY + bandH + 70 * s;
    } else {
      ctx.fillStyle = C.dim; ctx.font = mono(30); spaced(ctx, 6);
      ctx.fillText(String(spec.eyebrow).toUpperCase(), X, y); spaced(ctx, 0);
      if (theme === THEMES.topo && spec.period && spec.period !== spec.eyebrow) { ctx.textAlign = "right"; ctx.fillText(String(spec.period).toUpperCase(), F.w - X, y); ctx.textAlign = "left"; }
      y += 70 * s;
    }

    // Content between the header and the footer is laid out twice: once on a scratch canvas to
    // measure it, then for real, shifted so the block sits a little above the middle of the free space.
    // only the last (summary) card carries the invitation, so it needs room above the footer
    const cta = spec.id === "end";
    const footerTop = F.h - F.bottom - (theme === THEMES.bib ? 60 * s : 20 * s) - (cta ? 190 * s : 0);
    const contentTop = y;
    let vizH = null;
    const drawContent = (ctx, y) => {
      // persona chip
      if (spec.chip) {
        const label = String(spec.chip).toUpperCase(); ctx.font = mono(28); spaced(ctx, 3);
        const cw = ctx.measureText(label).width + 48 * s, ch = 60 * s;
        if (theme === THEMES.antalya) { ctx.strokeStyle = C.ink; ctx.lineWidth = 3; roundRect(ctx, X, y - ch * .72, cw, ch, ch / 2); ctx.stroke(); ctx.fillStyle = C.ink; }
        else { ctx.fillStyle = theme === THEMES.bib ? C.ink : C.accent; roundRect(ctx, X, y - ch * .72, cw, ch, theme === THEMES.bib ? 0 : 6); ctx.fill(); ctx.fillStyle = C.bg; }
        ctx.fillText(label, X + 24 * s, y - ch * .72 + ch * .66); spaced(ctx, 0);
        y += 80 * s;
      }
      // headline
      if (spec.headline) {
        const size = Math.round((theme === THEMES.bib ? 116 : 84) * s);
        ctx.fillStyle = C.ink; ctx.font = `${theme.weights.display} ${size}px ${T.display}`;
        const lines = wrap(ctx, theme.upper ? String(spec.headline).toUpperCase() : spec.headline, W, 4);
        lines.forEach(l => { y += size * 1.04; ctx.fillText(l, X, y); });
        y += 50 * s;
      }
      // big number
      if (spec.big) {
        let size = Math.round((theme === THEMES.bib ? 300 : 230) * s);
        ctx.font = `${theme.weights.big} ${size}px ${T.display}`;
        while (ctx.measureText(spec.big[0]).width > W && size > 80) { size -= 8; ctx.font = `${theme.weights.big} ${size}px ${T.display}`; }
        ctx.fillStyle = C.ink; y += size * .84; ctx.fillText(spec.big[0], X, y);
        ctx.fillStyle = C.dim; ctx.font = mono(32); y += 74 * s; ctx.fillText(spec.big[1], X, y); y += 50 * s;
      }
      // body lines are measured first so the visual can take whatever room is left
      ctx.font = `${theme.weights.body} ${Math.round(44 * s)}px ${T.body}`;
      const bodyLines = spec.body ? wrap(ctx, spec.body, W, 5) : [];
      const bodyH = bodyLines.length ? bodyLines.length * 60 * s + 20 * s : 0;
      if (spec.viz) {
        if (vizH === null) {
          const room = footerTop - y - bodyH - 40 * s;
          const cap = { clock: W * .8, zones: 300 * s, bars: 460 * s }[spec.viz.type] ?? 640 * s;
          vizH = Math.min(room, cap);
        }
        if (vizH > 120) { y += 10 * s; y += drawViz(ctx, spec.viz, X, y, W, vizH, theme, C) + 34 * s; }
      }
      if (bodyLines.length) {
        ctx.fillStyle = C.ink; ctx.font = `${theme.weights.body} ${Math.round(44 * s)}px ${T.body}`;
        bodyLines.forEach(l => { y += 60 * s; ctx.fillText(l, X, y); });
      }
      return y;
    };
    const scratch = document.createElement("canvas"); scratch.width = F.w; scratch.height = F.h;
    const used = drawContent(scratch.getContext("2d"), contentTop) - contentTop;
    const free = footerTop - contentTop - used;
    drawContent(ctx, contentTop + Math.max(0, free * .4));

    // invitation on the summary card only: "Want yours?" + where to get it
    if (cta) {
      const cy = F.h - F.bottom - (theme === THEMES.bib ? 70 : 30) * s;
      ctx.strokeStyle = C.track; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X, cy - 150 * s); ctx.lineTo(F.w - X, cy - 150 * s); ctx.stroke();
      ctx.fillStyle = C.ink; ctx.font = `${theme.weights.display} ${Math.round(66 * s)}px ${T.display}`;
      ctx.fillText(theme.upper ? "WANT YOURS?" : "Want yours?", X, cy - 62 * s);
      ctx.fillStyle = theme === THEMES.antalya ? C.ink : C.accent; ctx.font = mono(34);
      ctx.fillText(`${SITE} · free`, X, cy);
    }

    // footer: the period only; the site address lives on the summary card's invitation
    const fy = F.h - F.bottom + 40 * s, footLabel = cta ? "" : String(spec.period || "").toUpperCase();
    if (theme === THEMES.bib) {
      ctx.strokeStyle = "#cfcfc7"; ctx.lineWidth = 4; ctx.setLineDash([16, 12]); ctx.beginPath(); ctx.moveTo(0, fy - 50 * s); ctx.lineTo(F.w, fy - 50 * s); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = C.dim; ctx.font = mono(28); ctx.fillText(footLabel, X, fy + 10 * s);
      let bx = F.w - X - 220; for (const bw of [6, 3, 9, 3, 3, 6, 12, 3, 6, 3, 9, 6, 3, 3, 9, 3, 6, 6, 3, 12]) { ctx.fillStyle = C.ink; ctx.fillRect(bx, fy - 26 * s, bw, 50 * s); bx += bw + 4; }
    } else if (theme === THEMES.topo) {
      ctx.fillStyle = C.ink; ctx.fillRect(X, fy - 20 * s, 90 * s, 12 * s); ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.strokeRect(X + 90 * s, fy - 20 * s, 90 * s, 12 * s);
      ctx.font = mono(26); ctx.fillText(footLabel, X, fy + 30 * s);
      ctx.textAlign = "center"; ctx.font = `700 ${Math.round(40 * s)}px ${T.display}`; ctx.fillText("▲", F.w - X - 20, fy - 10 * s); ctx.fillText("N", F.w - X - 20, fy + 34 * s); ctx.textAlign = "left";
    } else {
      ctx.fillStyle = C.dim; ctx.font = mono(28); spaced(ctx, 4);
      ctx.fillText(footLabel, X, fy); spaced(ctx, 0);
    }
    return canvas;
  }

  function toFile(canvas, name) {
    return new Promise((res, rej) => canvas.toBlob(b => (b ? res(new File([b], name, { type: "image/png" })) : rej(new Error("Could not create image"))), "image/png"));
  }

  root.Share = { render, toFile, THEMES, FORMATS };
})(typeof window !== "undefined" ? window : globalThis);
