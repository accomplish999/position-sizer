(function () {
  const PS = globalThis.PositionSizer;
  if (!PS) {
    const slot = document.getElementById("perp-out");
    if (slot) slot.textContent = "The calculator bundle did not load.";
    return;
  }

  function num(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
    const abs = Math.abs(value);
    const digits = abs === 0 ? 2 : abs >= 1000 ? 4 : abs >= 1 ? 6 : 8;
    const text = value.toFixed(digits);
    return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
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

  function setSub(name) {
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

  function perpInput() {
    const targets = read("targets")
      .split(",")
      .map(function (part) {
        return part.trim();
      })
      .filter(Boolean)
      .map(Number);
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
      fundingRate: numOf("funding"),
      maintenanceMarginRate: numOf("mmr"),
      marginMode: read("margin-mode"),
      entryFeeFromMargin: document.getElementById("fee-from-margin").checked,
      targets: targets,
    };
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
          const left = ((mark.price - min) / span) * 100;
          return (
            '<div class="mark" style="left:' + left + '%"><b>' + mark.name + "</b>" + num(mark.price) + "<i></i></div>"
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
      const liqText = result.liquidation.price > 0 ? num(result.liquidation.price) : "none above 0";
      let html = "";
      loud.forEach(function (warning) {
        html += '<div class="warning"><p>' + warning.message + "</p></div>";
      });
      notes.forEach(function (warning) {
        html += '<p class="note">' + warning.message + "</p>";
      });
      html += '<p class="hero">' + num(result.qtyBase) + "</p>";
      html += '<p class="hero-label">base. quote size ' + num(result.qtyQuote) + "</p>";
      html += ruler(result);
      html +=
        "<dl>" +
        rows([
          ["Notional", num(result.notional)],
          ["Margin needed", num(result.margin)],
          ["Effective leverage", num(result.effectiveLeverage)],
          ["Fee-adjusted risk", num(result.feeAdjustedRisk)],
          ["Price risk", num(result.priceRisk)],
          ["Entry fee", num(result.entryFee)],
          ["Exit fee at stop", num(result.exitFeeAtStop)],
          ["Funding", num(result.fundingCost)],
          ["Liquidation", liqText],
          ["Distance vs stop", num(result.liquidation.distanceFromStop)],
          ["Stop hits first", result.liquidation.beforeStop ? "no" : "yes"],
          [
            "Liquidation at cap",
            result.liquidationAtCap.price > 0 ? num(result.liquidationAtCap.price) : "none above 0",
          ],
          [
            "Liquidation, full account",
            result.liquidationIfAccountBacksIt.price > 0
              ? num(result.liquidationIfAccountBacksIt.price)
              : "none above 0",
          ],
          ["Bankruptcy", result.bankruptcyPrice > 0 ? num(result.bankruptcyPrice) : "none above 0"],
          ["Binding constraint", result.bindingConstraint],
        ]) +
        "</dl>";
      if (result.targets.length) {
        html += "<h2>Targets</h2><dl>";
        result.targets.forEach(function (target) {
          html += rows([[num(target.price), num(target.rMultiple) + " R"]]);
        });
        html += "</dl>";
      }
      html += jsonBlock({ warnings: result.warnings, result: result });
      slot.innerHTML = html;
      if (scroll) slot.scrollIntoView({ block: "nearest" });
    } catch (err) {
      showError(slot, err);
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
        num(result.ilFraction * 100) +
        "%</p>" +
        '<p class="hero-label">IL versus holding</p><dl>' +
        rows([
          ["Value now", num(result.now.value)],
          ["Hold value", num(result.holdValue)],
          ["IL fraction", num(result.ilFraction)],
          ["Divergence (quote)", num(result.divergenceQuote)],
          ["Drawdown vs deposit", num(result.drawdownQuote)],
          ["Base now", num(result.now.amounts.base)],
          ["Quote now", num(result.now.amounts.quote)],
          ["In range", result.inRange === null ? "n/a" : result.inRange ? "yes" : "no"],
        ]) +
        "</dl>" +
        jsonBlock(result);
      slot.innerHTML = html;
    } catch (err) {
      showError(slot, err);
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
        num(result.deployQuote) +
        '</p><p class="hero-label">quote to deploy</p><dl>' +
        rows([
          ["Loss fraction", num(result.lossFraction)],
          ["IL fraction", num(result.scenario.ilFraction)],
          ["Max loss", num(result.maxLossQuote)],
          ["Scenario loss", num(result.scenarioLossQuote)],
          ["Left undeployed", num(result.unusedQuote)],
          ["Binding", result.bindingConstraint],
        ]) +
        "</dl>" +
        jsonBlock(result);
      slot.innerHTML = html;
    } catch (err) {
      showError(slot, err);
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
      const apr = result.breakevenApr === null ? "none" : num(result.breakevenApr * 100) + "%";
      const html =
        '<p class="hero">' +
        apr +
        '</p><p class="hero-label">fee APR to cover the loss</p><dl>' +
        rows([
          ["Fee income fraction", num(result.feeIncomeFraction)],
          ["Net fraction", num(result.netFraction)],
          ["Fees cover the loss", result.covers ? "yes" : "no"],
        ]) +
        "</dl>" +
        jsonBlock(result);
      slot.innerHTML = html;
    } catch (err) {
      showError(slot, err);
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
        num(result.hedgeBase) +
        '</p><p class="hero-label">base to short</p><dl>' +
        rows([
          ["Hedge notional", num(result.hedgeNotional)],
          ["Hedge ratio", num(result.hedgeRatio)],
          ["Base in pool", num(result.amounts.base)],
          ["Quote in pool", num(result.amounts.quote)],
          ["LP value", num(result.lpValue)],
          ["In range", result.inRange === null ? "n/a" : result.inRange ? "yes" : "no"],
        ]) +
        '</dl><p class="hint">A short of that base size offsets delta at this price. It does not cancel the curved loss.</p>' +
        jsonBlock(result);
      slot.innerHTML = html;
    } catch (err) {
      showError(slot, err);
    }
  }

  document.getElementById("tab-perp").addEventListener("click", function () {
    setTab("perp");
  });
  document.getElementById("tab-defi").addEventListener("click", function () {
    setTab("defi");
  });
  document.getElementById("sub-il").addEventListener("click", function () {
    setSub("il");
  });
  document.getElementById("sub-size").addEventListener("click", function () {
    setSub("size");
  });
  document.getElementById("sub-be").addEventListener("click", function () {
    setSub("be");
  });
  document.getElementById("sub-hedge").addEventListener("click", function () {
    setSub("hedge");
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
    document.getElementById("funding").value = "0";
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
    document.getElementById("funding").value = "0";
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

  renderPerp(false);
})();
