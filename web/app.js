(function () {
  function syncFooter() {
    const footer = document.querySelector("footer");
    if (!footer) return;
    const apply = function () {
      document.body.style.setProperty("--foot-h", footer.offsetHeight + "px");
    };
    apply();
    if (typeof ResizeObserver === "function") new ResizeObserver(apply).observe(footer);
    else window.addEventListener("resize", apply);
  }

  syncFooter();

  const PS = globalThis.PositionSizer;
  if (!PS) {
    const slot = document.getElementById("perp-out");
    if (slot) slot.textContent = "The calculator bundle did not load.";
    return;
  }

  function decimalsOf(text) {
    const match = String(text)
      .trim()
      .match(/\.(\d+)/);
    return match ? match[1].length : 0;
  }

  function priceDp() {
    let dp = 0;
    ["entry", "stop"].forEach(function (id) {
      dp = Math.max(dp, decimalsOf(read(id)));
    });
    read("targets")
      .split(",")
      .forEach(function (part) {
        dp = Math.max(dp, decimalsOf(part));
      });
    if (dp < 2) dp = 2;
    if (dp > 8) dp = 8;
    return dp;
  }

  function formatFixed(value, digits) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
    return value.toFixed(digits);
  }

  function formatSig(value, sig) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
    if (value === 0) return "0";
    const abs = Math.abs(value);
    const exp = Math.floor(Math.log10(abs));
    const decimals = sig - 1 - exp;
    if (decimals >= 0) {
      return value
        .toFixed(decimals)
        .replace(/(\.\d*?)0+$/, "$1")
        .replace(/\.$/, "");
    }
    const factor = 10 ** -decimals;
    return String(Math.round(value / factor) * factor);
  }

  function formatPrice(value) {
    return formatFixed(value, priceDp());
  }

  function formatMoney(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
    if (value !== 0 && Math.abs(value) < 0.005) return formatSig(value, 4);
    return value.toFixed(2);
  }

  function formatSize(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
    return formatSig(value, Math.abs(value) >= 1 ? 6 : 4);
  }

  function formatRate(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
    const digits = Math.abs(value) > 0 && Math.abs(value) < 0.001 ? 8 : 6;
    return value
      .toFixed(digits)
      .replace(/(\.\d*?)0+$/, "$1")
      .replace(/\.$/, "");
  }

  function formatFrac(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
    return value
      .toFixed(4)
      .replace(/(\.\d*?)0+$/, "$1")
      .replace(/\.$/, "");
  }

  function formatPct(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
    return value.toFixed(2) + "%";
  }

  function read(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }

  function numOf(id) {
    return Number(read(id));
  }

  function rows(pairs) {
    return pairs
      .map(function (pair) {
        return "<div><dt>" + pair[0] + "</dt><dd>" + pair[1] + "</dd></div>";
      })
      .join("");
  }

  function showError(slot, err) {
    const message = err && err.message ? err.message : String(err);
    slot.innerHTML = '<p class="err"></p>';
    const p = slot.querySelector("p");
    if (p) p.textContent = message;
  }

  function jsonBlock(value) {
    return (
      "<pre>" +
      JSON.stringify(value, null, 2).replace(/[&<>]/g, function (ch) {
        return ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : "&gt;";
      }) +
      "</pre>"
    );
  }

  function setTab(name) {
    const perp = name === "perp";
    document.getElementById("view-perp").hidden = !perp;
    document.getElementById("view-defi").hidden = perp;
    document.getElementById("tab-perp").classList.toggle("on", perp);
    document.getElementById("tab-defi").classList.toggle("on", !perp);
    document.getElementById("tab-perp").setAttribute("aria-selected", perp ? "true" : "false");
    document.getElementById("tab-defi").setAttribute("aria-selected", perp ? "false" : "true");
  }

  let defiTool = "il";

  function setSub(name) {
    defiTool = name;
    ["il", "size", "be", "hedge"].forEach(function (id) {
      const pane = document.getElementById("pane-" + id);
      const button = document.getElementById("sub-" + id);
      const on = id === name;
      if (pane) pane.hidden = !on;
      if (button) button.classList.toggle("on", on);
    });
  }

  function rangeVisibility(modelId, wraps) {
    const show = read(modelId) === "concentrated";
    wraps.forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.hidden = !show;
    });
  }

  function parseTargets(text) {
    return text
      .split(",")
      .map(function (part) {
        return part.trim();
      })
      .filter(Boolean)
      .map(function (part) {
        const colon = part.indexOf(":");
        if (colon === -1) return Number(part);
        let share = part.slice(colon + 1).trim();
        if (share.endsWith("%")) share = share.slice(0, -1).trim();
        return { price: Number(part.slice(0, colon).trim()), closePercent: Number(share) };
      });
  }

  function perpInput() {
    return {
      accountSize: numOf("account"),
      risk: { mode: read("risk-mode"), value: numOf("risk") },
      entry: numOf("entry"),
      stop: numOf("stop"),
      side: read("side"),
      leverageCap: numOf("leverage"),
      takerFee: numOf("taker"),
      makerFee: numOf("maker"),
      entryLiquidity: read("entry-liq"),
      exitLiquidity: read("exit-liq"),
      fundingPer8h: numOf("funding-8h"),
      holdHours: numOf("hold-hours"),
      maintenanceMarginRate: numOf("mmr"),
      marginMode: read("margin-mode"),
      entryFeeFromMargin: document.getElementById("fee-from-margin").checked,
      targets: parseTargets(read("targets")),
    };
  }

  let rulerWatch = null;

  function layoutRuler(ruler) {
    if (!ruler) return;
    const width = ruler.clientWidth;
    if (!(width > 0)) return;
    const key = String(Math.round(width));
    if (ruler.dataset.w === key) return;
    const marks = Array.from(ruler.querySelectorAll(".mark"));
    const gap = 6;
    const tick = 14;
    const items = marks.map(function (mark) {
      const x = Number(mark.dataset.x) * width;
      const lab = mark.querySelector(".lab");
      const w = lab.offsetWidth;
      const h = lab.offsetHeight;
      let left = x - w / 2;
      if (left < 0) left = 0;
      if (left + w > width) left = Math.max(0, width - w);
      return { mark: mark, lab: lab, x: x, w: w, h: h, left: left, row: 0 };
    });
    items.sort(function (a, b) {
      return a.x - b.x;
    });
    const rows = [];
    items.forEach(function (item) {
      let row = 0;
      for (;;) {
        const slots = rows[row] || [];
        const hit = slots.some(function (slot) {
          return item.left < slot.right + gap && item.left + item.w > slot.left - gap;
        });
        if (!hit) {
          if (!rows[row]) rows[row] = [];
          rows[row].push({ left: item.left, right: item.left + item.w });
          item.row = row;
          break;
        }
        row += 1;
        if (row > 12) {
          item.row = row;
          break;
        }
      }
    });
    let maxRow = 0;
    let block = 24;
    items.forEach(function (item) {
      if (item.row > maxRow) maxRow = item.row;
      if (item.h > block) block = item.h;
    });
    const pitch = block + 4;
    ruler.style.height = tick + (maxRow + 1) * pitch + "px";
    items.forEach(function (item) {
      item.mark.style.left = item.x + "px";
      item.lab.style.left = item.left - item.x + "px";
      item.lab.style.bottom = tick + item.row * pitch + "px";
    });
    ruler.dataset.w = key;
  }

  function bindRuler() {
    const ruler = document.querySelector("#perp-out .ruler");
    if (!ruler) return;
    layoutRuler(ruler);
    if (rulerWatch) rulerWatch.disconnect();
    if (typeof ResizeObserver === "function") {
      rulerWatch = new ResizeObserver(function () {
        layoutRuler(ruler);
      });
      rulerWatch.observe(ruler);
    }
  }

  function ruler(result) {
    const marks = [
      { name: "stop", price: result.stop },
      { name: "entry", price: result.entry },
    ];
    if (result.liquidation.price > 0) marks.push({ name: "liq", price: result.liquidation.price });
    result.targets.forEach(function (target) {
      marks.push({ name: "target", price: target.price });
    });
    const prices = marks.map(function (mark) {
      return mark.price;
    });
    const min = Math.min.apply(null, prices);
    const max = Math.max.apply(null, prices);
    const span = max - min || 1;
    return (
      '<div class="ruler">' +
      marks
        .map(function (mark) {
          const x = (mark.price - min) / span;
          return (
            '<div class="mark" data-x="' +
            x +
            '"><span class="lab"><b>' +
            mark.name +
            "</b>" +
            formatPrice(mark.price) +
            "</span><i></i></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderPerp(scroll) {
    const slot = document.getElementById("perp-out");
    try {
      const result = PS.sizePerp(perpInput());
      const loud = result.warnings.filter(function (warning) {
        return warning.severity === "loud";
      });
      const notes = result.warnings.filter(function (warning) {
        return warning.severity !== "loud";
      });
      const liqText = result.liquidation.price > 0 ? formatPrice(result.liquidation.price) : "none above 0";
      let html = "";
      loud.forEach(function (warning) {
        html += '<div class="warning"><p>' + warning.message + "</p></div>";
      });
      notes.forEach(function (warning) {
        html += '<p class="note">' + warning.message + "</p>";
      });
      html += '<p class="hero">' + formatSize(result.qtyBase) + "</p>";
      html += '<p class="hero-label">base. quote size ' + formatMoney(result.qtyQuote) + "</p>";
      html += ruler(result);
      html +=
        "<dl>" +
        rows([
          ["Notional", formatMoney(result.notional)],
          ["Margin needed", formatMoney(result.margin)],
          ["Effective leverage", formatFixed(result.effectiveLeverage, 2)],
          ["Fee-adjusted risk", formatMoney(result.feeAdjustedRisk)],
          ["Price risk", formatMoney(result.priceRisk)],
          ["Entry fee", formatMoney(result.entryFee)],
          ["Exit fee at stop", formatMoney(result.exitFeeAtStop)],
          ["Funding", formatMoney(result.fundingCost)],
          ["Funding per 8h", formatRate(result.fundingPer8h === null ? 0 : result.fundingPer8h)],
          ["Hold hours", formatFixed(result.holdHours === null ? 0 : result.holdHours, 2)],
          ["Breakeven", formatPrice(result.breakevenPrice)],
          ["Liquidation", liqText],
          ["Distance vs stop", formatPrice(result.liquidation.distanceFromStop)],
          ["Stop hits first", result.liquidation.beforeStop ? "no" : "yes"],
          [
            "Liquidation at cap",
            result.liquidationAtCap.price > 0 ? formatPrice(result.liquidationAtCap.price) : "none above 0",
          ],
          [
            "Liquidation, full account",
            result.liquidationIfAccountBacksIt.price > 0
              ? formatPrice(result.liquidationIfAccountBacksIt.price)
              : "none above 0",
          ],
          ["Bankruptcy", result.bankruptcyPrice > 0 ? formatPrice(result.bankruptcyPrice) : "none above 0"],
          ["Binding constraint", result.bindingConstraint],
        ]) +
        "</dl>";
      if (result.targets.length) {
        html += "<h2>Targets</h2><dl>";
        result.targets.forEach(function (target) {
          const name =
            target.closePercent === null
              ? formatPrice(target.price)
              : formatPrice(target.price) + " close " + formatFixed(target.closePercent, 2) + "%";
          html += rows([
            [name, formatFixed(target.rMultiple, 2) + " R"],
            ["Net", formatMoney(target.netPnl)],
          ]);
        });
        if (result.blended) {
          html += rows([
            [
              "Blended " + formatFixed(result.blended.closePercent, 2) + "%",
              formatFixed(result.blended.rMultiple, 2) + " R",
            ],
            ["Blended net", formatMoney(result.blended.netPnl)],
            ["On full risk", formatFixed(result.blended.rOnFullRisk, 2) + " R"],
          ]);
        }
        html += "</dl>";
      }
      html += jsonBlock({ warnings: result.warnings, result: result });
      slot.innerHTML = html;
      bindRuler();
      writeHash();
      if (scroll) slot.scrollIntoView({ block: "nearest" });
    } catch (err) {
      showError(slot, err);
      writeHash();
    }
  }

  function ilInput() {
    const input = {
      model: read("il-model"),
      priceEntry: numOf("il-entry"),
      priceNow: numOf("il-price"),
      depositQuote: numOf("il-deposit"),
    };
    if (input.model === "concentrated") {
      input.priceLower = numOf("il-lower");
      input.priceUpper = numOf("il-upper");
    }
    return input;
  }

  function renderIl() {
    const slot = document.getElementById("il-out");
    try {
      const result = PS.impermanentLoss(ilInput());
      const html =
        '<p class="hero">' +
        formatPct(result.ilFraction * 100) +
        "</p>" +
        '<p class="hero-label">IL versus holding</p><dl>' +
        rows([
          ["Value now", formatMoney(result.now.value)],
          ["Hold value", formatMoney(result.holdValue)],
          ["IL fraction", formatFrac(result.ilFraction)],
          ["Divergence (quote)", formatMoney(result.divergenceQuote)],
          ["Drawdown vs deposit", formatMoney(result.drawdownQuote)],
          ["Base now", formatSize(result.now.amounts.base)],
          ["Quote now", formatMoney(result.now.amounts.quote)],
          ["In range", result.inRange === null ? "n/a" : result.inRange ? "yes" : "no"],
        ]) +
        "</dl>" +
        jsonBlock(result);
      slot.innerHTML = html;
      writeHash();
    } catch (err) {
      showError(slot, err);
      writeHash();
    }
  }

  function renderSize() {
    const slot = document.getElementById("size-out");
    try {
      const input = {
        model: read("size-model"),
        capital: numOf("size-capital"),
        maxLoss: { mode: read("size-loss-mode"), value: numOf("size-loss") },
        kind: read("size-kind"),
        priceEntry: numOf("size-entry"),
        priceScenario: numOf("size-price"),
      };
      const result = PS.sizeLp(input);
      let html = "";
      if (result.scenarioHasNoLoss) {
        html +=
          '<p class="note">That scenario does not produce this kind of loss. The full capital stays deployable.</p>';
      }
      html +=
        '<p class="hero">' +
        formatMoney(result.deployQuote) +
        '</p><p class="hero-label">quote to deploy</p><dl>' +
        rows([
          ["Loss fraction", formatFrac(result.lossFraction)],
          ["IL fraction", formatFrac(result.scenario.ilFraction)],
          ["Max loss", formatMoney(result.maxLossQuote)],
          ["Scenario loss", formatMoney(result.scenarioLossQuote)],
          ["Left undeployed", formatMoney(result.unusedQuote)],
          ["Binding", result.bindingConstraint],
        ]) +
        "</dl>" +
        jsonBlock(result);
      slot.innerHTML = html;
      writeHash();
    } catch (err) {
      showError(slot, err);
      writeHash();
    }
  }

  function renderBe() {
    const slot = document.getElementById("be-out");
    try {
      const result = PS.feeBreakeven({
        lossFraction: numOf("be-loss") / 100,
        horizonDays: numOf("be-days"),
        feeApr: numOf("be-apr") / 100,
        inRangeFraction: numOf("be-in") / 100,
      });
      const apr = result.breakevenApr === null ? "none" : formatPct(result.breakevenApr * 100);
      const html =
        '<p class="hero">' +
        apr +
        '</p><p class="hero-label">fee APR to cover the loss</p><dl>' +
        rows([
          ["Fee income fraction", result.feeIncomeFraction == null ? "n/a" : formatFrac(result.feeIncomeFraction)],
          ["Net fraction", result.netFraction == null ? "n/a" : formatFrac(result.netFraction)],
          ["Fees cover the loss", result.covers ? "yes" : "no"],
        ]) +
        "</dl>" +
        jsonBlock(result);
      slot.innerHTML = html;
      writeHash();
    } catch (err) {
      showError(slot, err);
      writeHash();
    }
  }

  function renderHedge() {
    const slot = document.getElementById("hedge-out");
    try {
      const input = {
        model: read("hedge-model"),
        priceEntry: numOf("hedge-entry"),
        price: numOf("hedge-price"),
        depositQuote: numOf("hedge-deposit"),
      };
      if (input.model === "concentrated") {
        input.priceLower = numOf("hedge-lower");
        input.priceUpper = numOf("hedge-upper");
      }
      const result = PS.hedgeRatio(input);
      const html =
        '<p class="hero">' +
        formatSize(result.hedgeBase) +
        '</p><p class="hero-label">base to short</p><dl>' +
        rows([
          ["Hedge notional", formatMoney(result.hedgeNotional)],
          ["Hedge ratio", formatFrac(result.hedgeRatio)],
          ["Base in pool", formatSize(result.amounts.base)],
          ["Quote in pool", formatMoney(result.amounts.quote)],
          ["LP value", formatMoney(result.lpValue)],
          ["In range", result.inRange === null ? "n/a" : result.inRange ? "yes" : "no"],
        ]) +
        '</dl><p class="hint">A short of that base size offsets delta at this price. It does not cancel the curved loss.</p>' +
        jsonBlock(result);
      slot.innerHTML = html;
      writeHash();
    } catch (err) {
      showError(slot, err);
      writeHash();
    }
  }

  function setField(id, value) {
    if (value === null || value === undefined || value === "") return;
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === "checkbox") el.checked = value === "1" || value === "true";
    else el.value = value;
  }

  function perpParams() {
    const params = new URLSearchParams();
    [
      ["account", "account"],
      ["riskMode", "risk-mode"],
      ["risk", "risk"],
      ["side", "side"],
      ["entry", "entry"],
      ["stop", "stop"],
      ["leverage", "leverage"],
      ["margin", "margin-mode"],
      ["taker", "taker"],
      ["maker", "maker"],
      ["entryLiq", "entry-liq"],
      ["exitLiq", "exit-liq"],
      ["funding8h", "funding-8h"],
      ["holdHours", "hold-hours"],
      ["mmr", "mmr"],
      ["targets", "targets"],
    ].forEach(function (pair) {
      params.set(pair[0], read(pair[1]));
    });
    params.set("feeFromMargin", document.getElementById("fee-from-margin").checked ? "1" : "0");
    return params;
  }

  function defiParams() {
    const params = new URLSearchParams();
    params.set("tool", defiTool);
    const fields = {
      il: [
        ["model", "il-model"],
        ["entry", "il-entry"],
        ["price", "il-price"],
        ["deposit", "il-deposit"],
        ["lower", "il-lower"],
        ["upper", "il-upper"],
      ],
      size: [
        ["model", "size-model"],
        ["capital", "size-capital"],
        ["kind", "size-kind"],
        ["lossMode", "size-loss-mode"],
        ["loss", "size-loss"],
        ["entry", "size-entry"],
        ["price", "size-price"],
      ],
      be: [
        ["loss", "be-loss"],
        ["days", "be-days"],
        ["apr", "be-apr"],
        ["inRange", "be-in"],
      ],
      hedge: [
        ["model", "hedge-model"],
        ["entry", "hedge-entry"],
        ["price", "hedge-price"],
        ["deposit", "hedge-deposit"],
        ["lower", "hedge-lower"],
        ["upper", "hedge-upper"],
      ],
    };
    (fields[defiTool] || []).forEach(function (pair) {
      params.set(pair[0], read(pair[1]));
    });
    return params;
  }

  function writeHash() {
    const perpOn = !document.getElementById("view-perp").hidden;
    const next = "#" + (perpOn ? "perp" : "defi") + "?" + (perpOn ? perpParams() : defiParams()).toString();
    if (location.hash !== next) history.replaceState(null, "", next);
  }

  function renderDefiTool() {
    if (defiTool === "il") renderIl();
    else if (defiTool === "size") renderSize();
    else if (defiTool === "be") renderBe();
    else renderHedge();
  }

  function applyHash() {
    const raw = location.hash.replace(/^#/, "");
    if (!raw) return false;
    const q = raw.indexOf("?");
    const head = (q === -1 ? raw : raw.slice(0, q)).toLowerCase();
    const params = new URLSearchParams(q === -1 ? "" : raw.slice(q + 1));
    if (head === "perp") {
      setField("account", params.get("account"));
      setField("risk-mode", params.get("riskMode"));
      setField("risk", params.get("risk"));
      setField("side", params.get("side"));
      setField("entry", params.get("entry"));
      setField("stop", params.get("stop"));
      setField("leverage", params.get("leverage"));
      setField("margin-mode", params.get("margin"));
      setField("taker", params.get("taker"));
      setField("maker", params.get("maker"));
      setField("entry-liq", params.get("entryLiq"));
      setField("exit-liq", params.get("exitLiq"));
      setField("funding-8h", params.get("funding8h"));
      setField("hold-hours", params.get("holdHours"));
      setField("mmr", params.get("mmr"));
      setField("targets", params.get("targets"));
      setField("fee-from-margin", params.get("feeFromMargin"));
      setTab("perp");
      renderPerp(false);
      return true;
    }
    if (head !== "defi") return false;
    const tool = params.get("tool") || "il";
    if (tool === "size") {
      setField("size-model", params.get("model"));
      setField("size-capital", params.get("capital"));
      setField("size-kind", params.get("kind"));
      setField("size-loss-mode", params.get("lossMode"));
      setField("size-loss", params.get("loss"));
      setField("size-entry", params.get("entry"));
      setField("size-price", params.get("price"));
    } else if (tool === "be") {
      setField("be-loss", params.get("loss"));
      setField("be-days", params.get("days"));
      setField("be-apr", params.get("apr"));
      setField("be-in", params.get("inRange"));
    } else if (tool === "hedge") {
      setField("hedge-model", params.get("model"));
      setField("hedge-entry", params.get("entry"));
      setField("hedge-price", params.get("price"));
      setField("hedge-deposit", params.get("deposit"));
      setField("hedge-lower", params.get("lower"));
      setField("hedge-upper", params.get("upper"));
      rangeVisibility("hedge-model", ["hedge-lower-wrap", "hedge-upper-wrap"]);
    } else {
      setField("il-model", params.get("model"));
      setField("il-entry", params.get("entry"));
      setField("il-price", params.get("price"));
      setField("il-deposit", params.get("deposit"));
      setField("il-lower", params.get("lower"));
      setField("il-upper", params.get("upper"));
      rangeVisibility("il-model", ["il-lower-wrap", "il-upper-wrap"]);
    }
    setTab("defi");
    setSub(tool === "size" || tool === "be" || tool === "hedge" ? tool : "il");
    renderDefiTool();
    return true;
  }

  function copyLink() {
    writeHash();
    const button = document.getElementById("copy-link");
    const url = location.href;
    const done = function () {
      button.textContent = "Copied";
      window.setTimeout(function () {
        button.textContent = "Copy link";
      }, 1200);
    };
    const fallback = function () {
      const input = document.createElement("textarea");
      input.value = url;
      input.setAttribute("readonly", "");
      document.body.appendChild(input);
      input.select();
      try {
        document.execCommand("copy");
      } catch (err) {
        /* The address bar already holds the link. */
      }
      input.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () {
        fallback();
        done();
      });
    } else {
      fallback();
      done();
    }
  }

  document.getElementById("tab-perp").addEventListener("click", function () {
    setTab("perp");
    renderPerp(false);
  });
  document.getElementById("tab-defi").addEventListener("click", function () {
    setTab("defi");
    renderDefiTool();
  });
  document.getElementById("copy-link").addEventListener("click", copyLink);
  document.getElementById("sub-il").addEventListener("click", function () {
    setSub("il");
    renderIl();
  });
  document.getElementById("sub-size").addEventListener("click", function () {
    setSub("size");
    renderSize();
  });
  document.getElementById("sub-be").addEventListener("click", function () {
    setSub("be");
    renderBe();
  });
  document.getElementById("sub-hedge").addEventListener("click", function () {
    setSub("hedge");
    renderHedge();
  });

  document.getElementById("form-perp").addEventListener("submit", function (event) {
    event.preventDefault();
    renderPerp(true);
  });
  document.getElementById("ex-long").addEventListener("click", function () {
    document.getElementById("account").value = "10000";
    document.getElementById("risk-mode").value = "percent";
    document.getElementById("risk").value = "1";
    document.getElementById("side").value = "long";
    document.getElementById("entry").value = "100";
    document.getElementById("stop").value = "95";
    document.getElementById("leverage").value = "10";
    document.getElementById("taker").value = "0.0005";
    document.getElementById("maker").value = "0.0002";
    document.getElementById("entry-liq").value = "taker";
    document.getElementById("exit-liq").value = "taker";
    document.getElementById("funding-8h").value = "0";
    document.getElementById("hold-hours").value = "8";
    document.getElementById("mmr").value = "0.005";
    document.getElementById("margin-mode").value = "isolated";
    document.getElementById("targets").value = "110, 120";
    document.getElementById("fee-from-margin").checked = true;
    renderPerp(true);
  });
  document.getElementById("ex-liq").addEventListener("click", function () {
    document.getElementById("account").value = "10000";
    document.getElementById("risk-mode").value = "percent";
    document.getElementById("risk").value = "1";
    document.getElementById("side").value = "long";
    document.getElementById("entry").value = "100";
    document.getElementById("stop").value = "90";
    document.getElementById("leverage").value = "20";
    document.getElementById("taker").value = "0";
    document.getElementById("maker").value = "0";
    document.getElementById("funding-8h").value = "0";
    document.getElementById("hold-hours").value = "8";
    document.getElementById("mmr").value = "0.005";
    document.getElementById("margin-mode").value = "isolated";
    document.getElementById("targets").value = "110";
    renderPerp(true);
  });

  document.getElementById("il-model").addEventListener("change", function () {
    rangeVisibility("il-model", ["il-lower-wrap", "il-upper-wrap"]);
  });
  document.getElementById("form-il").addEventListener("submit", function (event) {
    event.preventDefault();
    renderIl();
  });
  document.getElementById("ex-4x").addEventListener("click", function () {
    document.getElementById("il-model").value = "constant-product";
    rangeVisibility("il-model", ["il-lower-wrap", "il-upper-wrap"]);
    document.getElementById("il-entry").value = "100";
    document.getElementById("il-price").value = "400";
    document.getElementById("il-deposit").value = "1000";
    renderIl();
  });
  document.getElementById("ex-range").addEventListener("click", function () {
    document.getElementById("il-model").value = "concentrated";
    rangeVisibility("il-model", ["il-lower-wrap", "il-upper-wrap"]);
    document.getElementById("il-entry").value = "100";
    document.getElementById("il-price").value = "121";
    document.getElementById("il-deposit").value = "1000";
    document.getElementById("il-lower").value = "81";
    document.getElementById("il-upper").value = "121";
    renderIl();
  });

  document.getElementById("form-size").addEventListener("submit", function (event) {
    event.preventDefault();
    renderSize();
  });
  document.getElementById("ex-size").addEventListener("click", function () {
    document.getElementById("size-model").value = "constant-product";
    document.getElementById("size-capital").value = "10000";
    document.getElementById("size-kind").value = "il";
    document.getElementById("size-loss-mode").value = "percent";
    document.getElementById("size-loss").value = "1";
    document.getElementById("size-entry").value = "100";
    document.getElementById("size-price").value = "400";
    renderSize();
  });

  document.getElementById("form-be").addEventListener("submit", function (event) {
    event.preventDefault();
    renderBe();
  });
  document.getElementById("ex-be").addEventListener("click", function () {
    document.getElementById("be-loss").value = "20";
    document.getElementById("be-days").value = "30";
    document.getElementById("be-apr").value = "50";
    document.getElementById("be-in").value = "50";
    renderBe();
  });

  document.getElementById("hedge-model").addEventListener("change", function () {
    rangeVisibility("hedge-model", ["hedge-lower-wrap", "hedge-upper-wrap"]);
  });
  document.getElementById("form-hedge").addEventListener("submit", function (event) {
    event.preventDefault();
    renderHedge();
  });
  document.getElementById("ex-hedge").addEventListener("click", function () {
    document.getElementById("hedge-model").value = "constant-product";
    rangeVisibility("hedge-model", ["hedge-lower-wrap", "hedge-upper-wrap"]);
    document.getElementById("hedge-entry").value = "100";
    document.getElementById("hedge-price").value = "100";
    document.getElementById("hedge-deposit").value = "1000";
    renderHedge();
  });

  if (!applyHash()) renderPerp(false);
})();
