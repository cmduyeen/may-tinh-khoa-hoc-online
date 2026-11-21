/**
 * VN-580 Plus Web Scientific Calculator Controller
 */
(() => {
  "use strict";

  const Engine = window.CasioEngine;
  const Modes = window.CasioModes;

  // ==================== STATE ====================
  const state = {
    mode: "COMP", // COMP | CMPLX | BASE-N | MATRIX | VECTOR | STAT | TABLE | EQUATION | INEQ
    overlay: null, // null | MENU | SETUP | OPTN | CALC | SOLVE | RCL
    angleUnit: "DEG", // DEG | RAD | GRAD
    fixDigits: null, // null (Norm) or 0..9
    shift: false,
    alpha: false,
    sto: false,

    expr: "",
    cursor: 0,
    lastRawResult: null, // number | Complex | null
    lastWasError: false,
    justEvaluated: false,
    sdState: 0, // 0: exact/auto, 1: decimal, 2: mixed fraction, 3: DMS
    factActive: false,

    vars: {
      A: 0, B: 0, C: 0, D: 0, E: 0, F: 0,
      x: 0, y: 0, M: 0,
      Ans: 0, PreAns: 0,
    },
    history: [], // { expr, resultText, raw }
    exprHistoryIdx: -1,

    // Mode-specific persistent data
    matrices: {
      A: [[1, 0], [0, 1]],
      B: [[1, 2], [3, 4]],
      C: [[0, 0], [0, 0]],
    },
    vectors: {
      A: [1, 0, 0],
      B: [0, 1, 0],
      C: [0, 0, 1],
    },
  };

  // ==================== DOM REFS ====================
  const el = {
    indShift: document.getElementById("ind-shift"),
    indAlpha: document.getElementById("ind-alpha"),
    indSto: document.getElementById("ind-sto"),
    indMem: document.getElementById("ind-mem"),
    indAngle: document.getElementById("ind-angle"),
    indMode: document.getElementById("ind-mode"),

    compView: document.getElementById("comp-view"),
    lcdExpr: document.getElementById("lcd-expr"),
    lcdResult: document.getElementById("lcd-result"),
    modePanel: document.getElementById("mode-panel"),

    btnShift: document.getElementById("btn-shift"),
    btnAlpha: document.getElementById("btn-alpha"),
    varStrip: document.getElementById("var-strip"),
    historyList: document.getElementById("history-list"),
  };

  // ==================== RENDERING ====================
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function updateIndicators() {
    el.indShift.classList.toggle("active", state.shift);
    el.indAlpha.classList.toggle("active", state.alpha);
    el.indSto.classList.toggle("active", state.sto);
    el.indMem.classList.toggle("active", Math.abs(state.vars.M) > 1e-13);

    el.btnShift.classList.toggle("armed", state.shift);
    el.btnAlpha.classList.toggle("armed", state.alpha);

    el.indAngle.textContent =
      state.angleUnit === "DEG" ? "D" : state.angleUnit === "RAD" ? "R" : "G";

    const modeLabels = {
      COMP: "1:COMP",
      CMPLX: "2:CMPLX",
      "BASE-N": "3:BASE-N",
      MATRIX: "4:MATRIX",
      VECTOR: "5:VECTOR",
      STAT: "6:STAT",
      TABLE: "8:TABLE",
      EQUATION: "9:EQN",
      INEQ: "A:INEQ",
    };
    el.indMode.textContent = modeLabels[state.mode] || state.mode;
  }

  function renderExpr() {
    const left = escapeHtml(state.expr.slice(0, state.cursor));
    const right = escapeHtml(state.expr.slice(state.cursor));
    el.lcdExpr.innerHTML = `${left}<span class="lcd-cursor"></span>${right}`;
  }

  function renderResult(customHtml = null, isError = false) {
    el.lcdResult.classList.toggle("error", isError);
    if (customHtml !== null) {
      el.lcdResult.innerHTML = customHtml;
      return;
    }
    const val = state.lastRawResult;
    if (val === null || val === undefined) {
      el.lcdResult.textContent = "0";
      return;
    }
    if (val instanceof Engine.Complex) {
      if (!val.isReal()) {
        el.lcdResult.textContent = Engine.formatComplex(val, state.sdState === 1, state.angleUnit);
        return;
      }
      // Real number inside Complex
      return renderRealResult(val.re);
    }
    renderRealResult(val);
  }

  function renderRealResult(num) {
    if (state.sdState === 3) {
      el.lcdResult.textContent = Engine.toDMS(num);
      return;
    }
    if (state.sdState === 2) {
      const mixed = Engine.toMixedFraction(num);
      if (mixed) {
        el.lcdResult.innerHTML = mixed.html;
        return;
      }
    }
    if (state.sdState === 0 && state.fixDigits === null) {
      const exact = Engine.toExactSymbolic(num);
      if (exact) {
        el.lcdResult.innerHTML = exact.html;
        return;
      }
    }
    el.lcdResult.textContent = Engine.formatNumber(num, state.fixDigits);
  }

  function renderVars() {
    const keys = ["A", "B", "C", "D", "E", "F", "x", "y", "M", "Ans"];
    el.varStrip.innerHTML = keys
      .map((k) => {
        const v = state.vars[k];
        const disp =
          v instanceof Engine.Complex
            ? Engine.formatComplex(v)
            : Engine.formatNumber(v || 0);
        return `<span class="var-chip"><strong>${k}</strong>=${escapeHtml(disp)}</span>`;
      })
      .join("");
  }

  function renderHistory() {
    if (!state.history.length) {
      el.historyList.innerHTML =
        '<p class="empty-hint">Chưa có phép tính nào. Bấm = hoặc Enter để tính.</p>';
      return;
    }
    el.historyList.innerHTML = state.history
      .map(
        (item, idx) =>
          `<button class="history-item" type="button" data-hist="${idx}">
            <span>${escapeHtml(item.expr)}</span>
            <strong>${escapeHtml(item.resultText)}</strong>
          </button>`
      )
      .join("");
  }

  function syncScreen() {
    updateIndicators();
    const showComp =
      (state.mode === "COMP" || state.mode === "CMPLX") && !state.overlay;
    el.compView.hidden = !showComp;
    el.modePanel.hidden = showComp;
    if (showComp) {
      renderExpr();
      renderResult(null, state.lastWasError);
    }
    renderVars();
  }

  // ==================== EXPRESSION EDITING ====================
  function insertToken(token, cursorOffset = 0) {
    if (state.justEvaluated) {
      if (/^[+\-×÷^CP∠]/.test(token)) {
        state.expr = "Ans";
        state.cursor = 3;
      } else {
        state.expr = "";
        state.cursor = 0;
      }
      state.justEvaluated = false;
    }
    state.expr =
      state.expr.slice(0, state.cursor) + token + state.expr.slice(state.cursor);
    state.cursor += token.length + cursorOffset;
    state.lastWasError = false;
    syncScreen();
  }

  function deleteChar() {
    if (state.cursor <= 0) return;
    // Smart delete for multi-char tokens like Ans, sin(, PreAns
    const before = state.expr.slice(0, state.cursor);
    const multi = [
      "PreAns", "RanInt#", "sin⁻¹(", "cos⁻¹(", "tan⁻¹(",
      "sinh(", "cosh(", "tanh(", "Conjg(", "d/dx(", "GCD(", "LCM(",
      "sin(", "cos(", "tan(", "log(", "ln(", "Abs(", "Arg(", "Pol(", "Rec(",
      "Ran#", "Intg(", "Int(", "Rnd(", "Ans", "×10^",
    ];
    let delLen = 1;
    for (const m of multi) {
      if (before.endsWith(m)) {
        delLen = m.length;
        break;
      }
    }
    state.expr =
      state.expr.slice(0, state.cursor - delLen) +
      state.expr.slice(state.cursor);
    state.cursor -= delLen;
    state.justEvaluated = false;
    syncScreen();
  }

  function clearAll() {
    state.expr = "";
    state.cursor = 0;
    state.justEvaluated = false;
    state.lastWasError = false;
    state.shift = false;
    state.alpha = false;
    state.sto = false;
    state.overlay = null;
    if (state.mode !== "COMP" && state.mode !== "CMPLX") {
      renderCurrentModePanel();
    }
    syncScreen();
  }

  function evaluateCurrent(forceDecimal = false) {
    if (!state.expr.trim()) return;
    try {
      const val = Engine.evaluateExpression(state.expr, {
        angleUnit: state.angleUnit,
        complexMode: state.mode === "CMPLX",
        vars: state.vars,
      });
      state.vars.PreAns = state.vars.Ans;
      state.vars.Ans = val;
      state.lastRawResult = val;
      state.lastWasError = false;
      state.justEvaluated = true;
      state.sdState = forceDecimal ? 1 : 0;

      syncScreen();
      const dispText = el.lcdResult.textContent;
      state.history.unshift({ expr: state.expr, resultText: dispText, raw: val });
      state.history = state.history.slice(0, 20);
      try {
        localStorage.setItem("vn580_history", JSON.stringify(
          state.history.map((h) => ({ expr: h.expr, resultText: h.resultText }))
        ));
      } catch {}
      state.exprHistoryIdx = -1;
      renderHistory();
    } catch (err) {
      state.lastWasError = true;
      state.justEvaluated = false;
      syncScreen();
      renderResult(escapeHtml(err.message || "Syntax ERROR"), true);
    }
  }

  // ==================== OVERLAYS: MENU, SETUP, OPTN, CALC, SOLVE, RCL ====================
  function openMenu() {
    state.overlay = "MENU";
    el.compView.hidden = true;
    el.modePanel.hidden = false;
    const items = [
      { id: "COMP", label: "1: Tính toán (COMP)" },
      { id: "CMPLX", label: "2: Số phức (CMPLX)" },
      { id: "BASE-N", label: "3: Hệ cơ số (BASE-N)" },
      { id: "MATRIX", label: "4: Ma trận (MATRIX)" },
      { id: "VECTOR", label: "5: Vector (VECTOR)" },
      { id: "STAT", label: "6: Thống kê (STAT)" },
      { id: "TABLE", label: "8: Bảng giá trị (TABLE)" },
      { id: "EQUATION", label: "9: Giải PT / Hệ PT" },
      { id: "INEQ", label: "A: Bất phương trình" },
    ];
    el.modePanel.innerHTML = `
      <div><strong>MENU — Chọn chế độ VN-580</strong></div>
      <div class="menu-grid">
        ${items
          .map(
            (m) =>
              `<button class="menu-item ${state.mode === m.id ? "active" : ""}" data-select-mode="${m.id}">${m.label}</button>`
          )
          .join("")}
      </div>`;
    el.modePanel.querySelectorAll("[data-select-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.mode = btn.dataset.selectMode;
        state.overlay = null;
        if (state.mode === "COMP" || state.mode === "CMPLX") {
          clearAll();
        } else {
          renderCurrentModePanel();
          syncScreen();
        }
      });
    });
    updateIndicators();
  }

  function openSetup() {
    state.overlay = "SETUP";
    el.compView.hidden = true;
    el.modePanel.hidden = false;
    el.modePanel.innerHTML = `
      <div class="mode-form">
        <strong>SETUP — Cài đặt máy tính</strong>
        <div class="mode-row">
          <span>Đơn vị góc:</span>
          <button class="mode-btn ${state.angleUnit === "DEG" ? "" : "ghost"}" data-ang="DEG">1: Độ (DEG)</button>
          <button class="mode-btn ${state.angleUnit === "RAD" ? "" : "ghost"}" data-ang="RAD">2: Rad (RAD)</button>
          <button class="mode-btn ${state.angleUnit === "GRAD" ? "" : "ghost"}" data-ang="GRAD">3: Grad</button>
        </div>
        <div class="mode-row">
          <span>Làm tròn (FIX):</span>
          <select id="setup-fix" class="mode-input">
            <option value="norm" ${state.fixDigits === null ? "selected" : ""}>Norm (Mặc định)</option>
            ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
              .map((d) => `<option value="${d}" ${state.fixDigits === d ? "selected" : ""}>Fix ${d}</option>`)
              .join("")}
          </select>
          <button class="mode-btn" id="setup-done">Xong</button>
        </div>
      </div>`;
    el.modePanel.querySelectorAll("[data-ang]").forEach((b) => {
      b.addEventListener("click", () => {
        state.angleUnit = b.dataset.ang;
        openSetup();
        updateIndicators();
      });
    });
    document.getElementById("setup-fix").addEventListener("change", (e) => {
      state.fixDigits = e.target.value === "norm" ? null : Number(e.target.value);
    });
    document.getElementById("setup-done").addEventListener("click", () => {
      state.overlay = null;
      syncScreen();
    });
  }

  function openOptn() {
    state.overlay = "OPTN";
    el.compView.hidden = true;
    el.modePanel.hidden = false;
    el.modePanel.innerHTML = `
      <div><strong>OPTN — Hàm mở rộng</strong></div>
      <div class="menu-grid">
        <button class="menu-item" data-ins="sinh(">sinh(</button>
        <button class="menu-item" data-ins="cosh(">cosh(</button>
        <button class="menu-item" data-ins="tanh(">tanh(</button>
        <button class="menu-item" data-ins="Π(">Π(tích dãy)</button>
        <button class="menu-item" data-ins="Arg(">Arg(z)</button>
        <button class="menu-item" data-ins="Conjg(">Conjg(z)</button>
      </div>
      <div style="margin-top:6px"><button class="mode-btn ghost" id="optn-close">Đóng</button></div>`;
    el.modePanel.querySelectorAll("[data-ins]").forEach((b) => {
      b.addEventListener("click", () => {
        state.overlay = null;
        insertToken(b.dataset.ins);
      });
    });
    document.getElementById("optn-close").addEventListener("click", () => {
      state.overlay = null;
      syncScreen();
    });
  }

  function openCalcDialog(isSolve = false) {
    if (!state.expr.trim()) return;
    let vars = [];
    try {
      vars = Engine.extractVariables(state.expr.replace(/=/g, "-"));
    } catch {
      vars = ["x"];
    }
    if (!vars.length) vars = ["x"];

    state.overlay = isSolve ? "SOLVE" : "CALC";
    el.compView.hidden = true;
    el.modePanel.hidden = false;

    el.modePanel.innerHTML = `
      <div class="mode-form">
        <strong>${isSolve ? "SOLVE (Tìm nghiệm gần đúng)" : "CALC (Tính giá trị biểu thức)"}</strong>
        <div style="font-family:monospace;font-size:11px;">${escapeHtml(state.expr)}</div>
        ${vars
          .map(
            (v) =>
              `<div class="mode-row">
                <label>${v} =</label>
                <input class="mode-input" type="number" step="any" data-calc-var="${v}" value="${
                typeof state.vars[v] === "number" ? state.vars[v] : 0
              }">
              </div>`
          )
          .join("")}
        <div class="mode-row">
          <button class="mode-btn" id="calc-run">${isSolve ? "Giải (Solve)" : "Tính (=)"}</button>
          <button class="mode-btn ghost" id="calc-cancel">Hủy</button>
        </div>
        <div class="mode-output" id="calc-out" hidden></div>
      </div>`;

    document.getElementById("calc-cancel").addEventListener("click", () => {
      state.overlay = null;
      syncScreen();
    });

    document.getElementById("calc-run").addEventListener("click", () => {
      el.modePanel.querySelectorAll("[data-calc-var]").forEach((inp) => {
        state.vars[inp.dataset.calcVar] = Number(inp.value) || 0;
      });
      if (!isSolve) {
        state.overlay = null;
        evaluateCurrent(false);
        return;
      }
      const out = document.getElementById("calc-out");
      out.hidden = false;
      try {
        const targetVar = vars.includes("x") ? "x" : vars[0];
        const guess = state.vars[targetVar] || 0;
        const res = Engine.solveEquation(state.expr, targetVar, guess, {
          angleUnit: state.angleUnit,
          vars: state.vars,
        });
        state.vars[targetVar] = res.root;
        state.vars.Ans = res.root;
        state.lastRawResult = res.root;
        const exact = Engine.toExactSymbolic(res.root);
        const exactStr = exact && exact.type !== "int" ? ` (${exact.text})` : "";
        out.innerHTML = `<strong>${targetVar} = ${Engine.formatNumber(res.root)}${escapeHtml(exactStr)}</strong><br>L - R = ${Engine.formatNumber(res.residual)}`;
        renderVars();
      } catch (err) {
        out.textContent = err.message || "Can't Solve";
      }
    });
  }

  function openRecallOverlay() {
    state.overlay = "RCL";
    el.compView.hidden = true;
    el.modePanel.hidden = false;
    const keys = ["A", "B", "C", "D", "E", "F", "x", "y", "M"];
    el.modePanel.innerHTML = `
      <div><strong>RCL — Gọi giá trị biến nhớ</strong></div>
      <div class="menu-grid">
        ${keys
          .map((k) => {
            const v = state.vars[k];
            const disp = v instanceof Engine.Complex ? Engine.formatComplex(v) : Engine.formatNumber(v);
            return `<button class="menu-item" data-rcl="${k}"><span>${k}</span><span>${escapeHtml(disp)}</span></button>`;
          })
          .join("")}
      </div>
      <div style="margin-top:6px"><button class="mode-btn ghost" id="rcl-close">Đóng</button></div>`;
    el.modePanel.querySelectorAll("[data-rcl]").forEach((b) => {
      b.addEventListener("click", () => {
        state.overlay = null;
        insertToken(b.dataset.rcl);
      });
    });
    document.getElementById("rcl-close").addEventListener("click", () => {
      state.overlay = null;
      syncScreen();
    });
  }

  function openConstOverlay() {
    state.overlay = "CONST";
    el.compView.hidden = true;
    el.modePanel.hidden = false;
    const consts = [
      { label: "c (Tốc độ ánh sáng)", val: "299792458" },
      { label: "g (Gia tốc trọng trường)", val: "9.80665" },
      { label: "h (Hằng số Planck)", val: "6.62607015E-34" },
      { label: "Nₐ (Avogadro)", val: "6.02214076E23" },
      { label: "R (Hằng số khí lý tưởng)", val: "8.314462618" },
      { label: "e (Điện tích nguyên tố)", val: "1.602176634E-19" },
      { label: "mₑ (Khối lượng electron)", val: "9.1093837E-31" },
      { label: "G (Hấp dẫn)", val: "6.6743E-11" },
    ];
    el.modePanel.innerHTML = `
      <div><strong>CONST — Hằng số Vật lý & Hóa học</strong></div>
      <div class="menu-grid">
        ${consts
          .map((c) => `<button class="menu-item" data-cval="${c.val}"><span>${c.label}</span></button>`)
          .join("")}
      </div>
      <div style="margin-top:6px"><button class="mode-btn ghost" id="const-close">Đóng</button></div>`;
    el.modePanel.querySelectorAll("[data-cval]").forEach((b) => {
      b.addEventListener("click", () => {
        state.overlay = null;
        insertToken(b.dataset.cval);
      });
    });
    document.getElementById("const-close").addEventListener("click", () => {
      state.overlay = null;
      syncScreen();
    });
  }

  function openConvOverlay() {
    state.overlay = "CONV";
    el.compView.hidden = true;
    el.modePanel.hidden = false;
    const convs = [
      { id: "kmh_ms", label: "km/h → m/s", fn: (v) => v / 3.6 },
      { id: "ms_kmh", label: "m/s → km/h", fn: (v) => v * 3.6 },
      { id: "c_f", label: "°C → °F", fn: (v) => v * 1.8 + 32 },
      { id: "f_c", label: "°F → °C", fn: (v) => (v - 32) / 1.8 },
      { id: "atm_pa", label: "atm → Pa", fn: (v) => v * 101325 },
      { id: "ev_j", label: "eV → J", fn: (v) => v * 1.602176634e-19 },
      { id: "cal_j", label: "cal → J", fn: (v) => v * 4.184 },
      { id: "inch_cm", label: "inch → cm", fn: (v) => v * 2.54 },
    ];
    el.modePanel.innerHTML = `
      <div class="mode-form">
        <strong>CONV — Đổi đơn vị nhanh</strong>
        <div class="mode-row">
          <input id="conv-val" class="mode-input" type="number" step="any" value="1">
          <select id="conv-type" class="mode-input wide">
            ${convs.map((c) => `<option value="${c.id}">${c.label}</option>`).join("")}
          </select>
          <button class="mode-btn" id="conv-run">Đổi</button>
          <button class="mode-btn ghost" id="conv-close">Đóng</button>
        </div>
        <div class="mode-output" id="conv-out"></div>
      </div>`;
    const run = () => {
      const val = Number(document.getElementById("conv-val").value) || 0;
      const item = convs.find((c) => c.id === document.getElementById("conv-type").value);
      document.getElementById("conv-out").innerHTML = `<strong>${Engine.formatNumber(item.fn(val))}</strong>`;
    };
    document.getElementById("conv-run").addEventListener("click", run);
    document.getElementById("conv-type").addEventListener("change", run);
    document.getElementById("conv-close").addEventListener("click", () => {
      state.overlay = null;
      syncScreen();
    });
    run();
  }

  function openClearOverlay() {
    state.overlay = "CLR";
    el.compView.hidden = true;
    el.modePanel.hidden = false;
    el.modePanel.innerHTML = `
      <div class="mode-form">
        <strong>CLR — Xóa dữ liệu</strong>
        <div class="menu-grid">
          <button class="menu-item" id="clr-setup">1: Reset Cài đặt (DEG/Norm)</button>
          <button class="menu-item" id="clr-mem">2: Xóa Biến nhớ (A-F, x, y, M)</button>
          <button class="menu-item" id="clr-all">3: Xóa Tất cả</button>
          <button class="menu-item" id="clr-cancel">Hủy</button>
        </div>
      </div>`;
    document.getElementById("clr-setup").addEventListener("click", () => {
      state.angleUnit = "DEG";
      state.fixDigits = null;
      state.overlay = null;
      syncScreen();
    });
    document.getElementById("clr-mem").addEventListener("click", () => {
      Object.keys(state.vars).forEach((k) => (state.vars[k] = 0));
      state.overlay = null;
      syncScreen();
    });
    document.getElementById("clr-all").addEventListener("click", () => {
      state.angleUnit = "DEG";
      state.fixDigits = null;
      Object.keys(state.vars).forEach((k) => (state.vars[k] = 0));
      state.history = [];
      try { localStorage.removeItem("vn580_history"); } catch {}
      renderHistory();
      clearAll();
    });
    document.getElementById("clr-cancel").addEventListener("click", () => {
      state.overlay = null;
      syncScreen();
    });
  }

  // ==================== SPECIALIZED MODE PANELS ====================
  function renderCurrentModePanel() {
    el.compView.hidden = true;
    el.modePanel.hidden = false;
    if (state.mode === "EQUATION") renderEquationMode();
    else if (state.mode === "INEQ") renderIneqMode();
    else if (state.mode === "TABLE") renderTableMode();
    else if (state.mode === "BASE-N") renderBaseNMode();
    else if (state.mode === "MATRIX") renderMatrixMode();
    else if (state.mode === "VECTOR") renderVectorMode();
    else if (state.mode === "STAT") renderStatMode();
  }

  function renderEquationMode(subType = "poly2") {
    el.modePanel.innerHTML = `
      <div class="mode-form">
        <div class="mode-row">
          <strong>9:EQUATION</strong>
          <select id="eqn-type" class="mode-input wide">
            <option value="sys2" ${subType === "sys2" ? "selected" : ""}>Hệ PT 2 ẩn (ax+by=c)</option>
            <option value="sys3" ${subType === "sys3" ? "selected" : ""}>Hệ PT 3 ẩn</option>
            <option value="sys4" ${subType === "sys4" ? "selected" : ""}>Hệ PT 4 ẩn</option>
            <option value="poly2" ${subType === "poly2" ? "selected" : ""}>PT bậc 2 (ax²+bx+c=0)</option>
            <option value="poly3" ${subType === "poly3" ? "selected" : ""}>PT bậc 3 (ax³+bx²+cx+d=0)</option>
            <option value="poly4" ${subType === "poly4" ? "selected" : ""}>PT bậc 4 (ax⁴+...+e=0)</option>
          </select>
        </div>
        <div id="eqn-inputs"></div>
        <div class="mode-row">
          <button class="mode-btn" id="eqn-solve">Giải (=)</button>
        </div>
        <div class="mode-output" id="eqn-out" hidden></div>
      </div>`;

    const sel = document.getElementById("eqn-type");
    const box = document.getElementById("eqn-inputs");

    if (subType.startsWith("sys")) {
      const n = Number(subType.slice(3));
      const vars = ["x", "y", "z", "t"];
      let html = "";
      for (let r = 0; r < n; r++) {
        html += `<div class="mode-row">`;
        for (let c = 0; c <= n; c++) {
          const placeholder = c < n ? vars[c] : "=";
          html += `<input class="mode-input" style="width:46px" type="number" step="any" data-r="${r}" data-c="${c}" placeholder="${placeholder}" value="${c === r ? 1 : c === n ? r + 1 : 0}">`;
        }
        html += `</div>`;
      }
      box.innerHTML = html;
    } else {
      const deg = Number(subType.slice(4));
      const names = ["a", "b", "c", "d", "e"];
      const defaults = deg === 2 ? [1, -5, 6] : deg === 3 ? [1, -6, 11, -6] : [1, 0, -5, 0, 4];
      box.innerHTML = `<div class="mode-row">${defaults
        .map((val, i) => `<label>${names[i]}=</label><input class="mode-input" style="width:52px" type="number" step="any" data-p="${i}" value="${val}">`)
        .join("")}</div>`;
    }

    sel.addEventListener("change", () => renderEquationMode(sel.value));
    document.getElementById("eqn-solve").addEventListener("click", () => {
      const out = document.getElementById("eqn-out");
      out.hidden = false;
      try {
        if (subType.startsWith("sys")) {
          const n = Number(subType.slice(3));
          const aug = Array.from({ length: n }, () => Array(n + 1).fill(0));
          box.querySelectorAll("input").forEach((inp) => {
            aug[Number(inp.dataset.r)][Number(inp.dataset.c)] = Number(inp.value) || 0;
          });
          const res = Modes.solveLinearSystem(aug);
          if (res.status !== "unique") {
            out.textContent = res.message;
          } else {
            out.innerHTML = res.solutions
              .map((s) => `<div><strong>${s.name} = ${escapeHtml(s.display)}</strong></div>`)
              .join("");
          }
        } else {
          const coeffs = [...box.querySelectorAll("input")].map((i) => Number(i.value) || 0);
          const res = Modes.solvePolynomial(coeffs);
          let html = res.roots
            .map((r) => `<div><strong>${r.name} = ${escapeHtml(r.display)}</strong></div>`)
            .join("");
          if (res.extrema.length) {
            html += `<hr style="border:0;border-top:1px solid rgba(0,0,0,0.15);margin:4px 0">`;
            html += res.extrema
              .map((ex) => `<div>${escapeHtml(ex.label)}: x=${escapeHtml(ex.x)}, y=${escapeHtml(ex.y)}</div>`)
              .join("");
          }
          out.innerHTML = html;
        }
      } catch (err) {
        out.textContent = err.message || "Math ERROR";
      }
    });
  }

  function renderIneqMode() {
    el.modePanel.innerHTML = `
      <div class="mode-form">
        <div class="mode-row">
          <strong>A:INEQ — Giải Bất Phương Trình</strong>
          <select id="ineq-deg" class="mode-input">
            <option value="2">Bậc 2</option>
            <option value="3">Bậc 3</option>
          </select>
          <select id="ineq-op" class="mode-input">
            <option value=">">&gt; 0</option>
            <option value="<">&lt; 0</option>
            <option value=">=">&ge; 0</option>
            <option value="<=">&le; 0</option>
          </select>
        </div>
        <div class="mode-row" id="ineq-coeffs"></div>
        <div class="mode-row"><button class="mode-btn" id="ineq-solve">Giải (=)</button></div>
        <div class="mode-output" id="ineq-out" hidden></div>
      </div>`;

    const degSel = document.getElementById("ineq-deg");
    const box = document.getElementById("ineq-coeffs");
    const drawCoeffs = () => {
      const deg = Number(degSel.value);
      const defs = deg === 2 ? [1, -5, 6] : [1, -6, 11, -6];
      const names = ["a", "b", "c", "d"];
      box.innerHTML = defs
        .map((v, i) => `<label>${names[i]}=</label><input class="mode-input" style="width:52px" type="number" step="any" value="${v}">`)
        .join("");
    };
    drawCoeffs();
    degSel.addEventListener("change", drawCoeffs);

    document.getElementById("ineq-solve").addEventListener("click", () => {
      const out = document.getElementById("ineq-out");
      out.hidden = false;
      try {
        const coeffs = [...box.querySelectorAll("input")].map((i) => Number(i.value) || 0);
        const op = document.getElementById("ineq-op").value;
        out.innerHTML = `<strong>${escapeHtml(Modes.solveInequality(coeffs, op))}</strong>`;
      } catch (err) {
        out.textContent = err.message || "Math ERROR";
      }
    });
  }

  function renderTableMode() {
    el.modePanel.innerHTML = `
      <div class="mode-form">
        <strong>8:TABLE — Bảng giá trị hàm số</strong>
        <div class="mode-row">
          <label>f(x)=</label><input id="tbl-f" class="mode-input wide" value="x^2 - 4*x + 3">
        </div>
        <div class="mode-row">
          <label>g(x)=</label><input id="tbl-g" class="mode-input wide" placeholder="(tùy chọn)">
        </div>
        <div class="mode-row">
          <label>Start</label><input id="tbl-start" class="mode-input" style="width:52px" type="number" step="any" value="0">
          <label>End</label><input id="tbl-end" class="mode-input" style="width:52px" type="number" step="any" value="5">
          <label>Step</label><input id="tbl-step" class="mode-input" style="width:52px" type="number" step="any" value="1">
          <button class="mode-btn" id="tbl-run">Tạo bảng</button>
        </div>
        <div id="tbl-out"></div>
      </div>`;

    document.getElementById("tbl-run").addEventListener("click", () => {
      const out = document.getElementById("tbl-out");
      try {
        const fExpr = document.getElementById("tbl-f").value;
        const gExpr = document.getElementById("tbl-g").value;
        const start = Number(document.getElementById("tbl-start").value);
        const end = Number(document.getElementById("tbl-end").value);
        const step = Number(document.getElementById("tbl-step").value);
        const rows = Modes.generateTable(fExpr, gExpr, start, end, step, {
          angleUnit: state.angleUnit,
          vars: state.vars,
        });
        const hasG = rows.some((r) => r.gx !== null);
        out.innerHTML = `
          <table class="mode-table">
            <thead><tr><th>x</th><th>f(x)</th>${hasG ? "<th>g(x)</th>" : ""}</tr></thead>
            <tbody>
              ${rows
                .map(
                  (r) =>
                    `<tr><td>${escapeHtml(r.x)}</td><td>${escapeHtml(r.fx)}</td>${
                      hasG ? `<td>${escapeHtml(r.gx)}</td>` : ""
                    }</tr>`
                )
                .join("")}
            </tbody>
          </table>`;
      } catch (err) {
        out.innerHTML = `<div class="mode-output">${escapeHtml(err.message || "Error")}</div>`;
      }
    });
  }

  function renderBaseNMode() {
    el.modePanel.innerHTML = `
      <div class="mode-form">
        <strong>3:BASE-N — Hệ cơ số & Phép toán Bit (32-bit)</strong>
        <div class="mode-row">
          <select id="base-from" class="mode-input">
            <option value="10">DEC (10)</option>
            <option value="16">HEX (16)</option>
            <option value="2">BIN (2)</option>
            <option value="8">OCT (8)</option>
          </select>
          <input id="base-val" class="mode-input wide" value="255" placeholder="Nhập số A">
          <button class="mode-btn" id="base-run">Đổi</button>
        </div>
        <div class="mode-row">
          <select id="base-op" class="mode-input">
            <option value="AND">AND</option>
            <option value="OR">OR</option>
            <option value="XOR">XOR</option>
            <option value="NOT">NOT A</option>
          </select>
          <input id="base-val-b" class="mode-input wide" value="15" placeholder="Nhập số B (cùng hệ)">
          <button class="mode-btn" id="base-bit-run">Tính Bit</button>
        </div>
        <div class="mode-output" id="base-out"></div>
      </div>`;

    const showResult = (val) => {
      const res = Modes.baseConvert(String(val), 10);
      document.getElementById("base-out").innerHTML = `
        <div>DEC: <strong>${res.DEC}</strong> | HEX: <strong>${res.HEX}</strong></div>
        <div>BIN: <strong>${res.BIN}</strong></div>
        <div>OCT: <strong>${res.OCT}</strong></div>`;
    };

    const calc = () => {
      const out = document.getElementById("base-out");
      try {
        const res = Modes.baseConvert(
          document.getElementById("base-val").value,
          Number(document.getElementById("base-from").value)
        );
        showResult(res.val);
      } catch (err) {
        out.textContent = err.message || "Syntax ERROR";
      }
    };

    document.getElementById("base-run").addEventListener("click", calc);
    document.getElementById("base-bit-run").addEventListener("click", () => {
      const out = document.getElementById("base-out");
      try {
        const base = Number(document.getElementById("base-from").value);
        const a = Modes.baseConvert(document.getElementById("base-val").value, base).val;
        const op = document.getElementById("base-op").value;
        if (op === "NOT") {
          showResult(~a);
          return;
        }
        const b = Modes.baseConvert(document.getElementById("base-val-b").value, base).val;
        const r = op === "AND" ? a & b : op === "OR" ? a | b : a ^ b;
        showResult(r);
      } catch (err) {
        out.textContent = err.message || "Syntax ERROR";
      }
    });
    calc();
  }

  function renderMatrixMode() {
    const parseMat = (text) =>
      text
        .trim()
        .split(/\n|;/)
        .map((row) => row.trim().split(/[\s,]+/).map(Number));
    const fmtMat = (M) =>
      M.map((r) => `[ ${r.map((v) => Engine.formatNumber(v)).join("  ")} ]`).join("<br>");

    el.modePanel.innerHTML = `
      <div class="mode-form">
        <strong>4:MATRIX — Tính toán Ma trận</strong>
        <div class="mode-row">
          <div><small>MatA (dòng cách bởi dấu ; hoặc Enter):</small><br>
            <textarea id="mat-a" class="mode-input" style="width:150px;height:46px">1 2; 3 4</textarea></div>
          <div><small>MatB:</small><br>
            <textarea id="mat-b" class="mode-input" style="width:150px;height:46px">2 0; 1 2</textarea></div>
        </div>
        <div class="mode-row">
          <button class="mode-btn" data-mop="add">A + B</button>
          <button class="mode-btn" data-mop="sub">A - B</button>
          <button class="mode-btn" data-mop="mul">A × B</button>
          <button class="mode-btn" data-mop="det">Det(A)</button>
          <button class="mode-btn" data-mop="inv">A⁻¹</button>
          <button class="mode-btn" data-mop="trn">Trn(A)</button>
        </div>
        <div class="mode-output" id="mat-out" hidden></div>
      </div>`;

    el.modePanel.querySelectorAll("[data-mop]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const out = document.getElementById("mat-out");
        out.hidden = false;
        try {
          const A = parseMat(document.getElementById("mat-a").value);
          const B = parseMat(document.getElementById("mat-b").value);
          const op = btn.dataset.mop;
          if (op === "add") out.innerHTML = fmtMat(Modes.matAdd(A, B, 1));
          else if (op === "sub") out.innerHTML = fmtMat(Modes.matAdd(A, B, -1));
          else if (op === "mul") out.innerHTML = fmtMat(Modes.matMul(A, B));
          else if (op === "det") out.innerHTML = `Det(A) = <strong>${Engine.formatNumber(Modes.matDet(A))}</strong>`;
          else if (op === "inv") out.innerHTML = fmtMat(Modes.matInverse(A));
          else if (op === "trn") out.innerHTML = fmtMat(Modes.matTranspose(A));
        } catch (err) {
          out.textContent = err.message || "Dimension ERROR";
        }
      });
    });
  }

  function renderVectorMode() {
    const parseVec = (s) => s.trim().split(/[\s,;]+/).map(Number);
    el.modePanel.innerHTML = `
      <div class="mode-form">
        <strong>5:VECTOR — Tính toán Vector (2D / 3D)</strong>
        <div class="mode-row">
          <label>VctA:</label><input id="vec-a" class="mode-input wide" value="1, 2, 3">
        </div>
        <div class="mode-row">
          <label>VctB:</label><input id="vec-b" class="mode-input wide" value="4, -1, 2">
        </div>
        <div class="mode-row">
          <button class="mode-btn" data-vop="add">A + B</button>
          <button class="mode-btn" data-vop="dot">A • B</button>
          <button class="mode-btn" data-vop="cross">A × B</button>
          <button class="mode-btn" data-vop="abs">|A|</button>
          <button class="mode-btn" data-vop="ang">Góc(A,B)</button>
        </div>
        <div class="mode-output" id="vec-out" hidden></div>
      </div>`;

    el.modePanel.querySelectorAll("[data-vop]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const out = document.getElementById("vec-out");
        out.hidden = false;
        try {
          const A = parseVec(document.getElementById("vec-a").value);
          const B = parseVec(document.getElementById("vec-b").value);
          const op = btn.dataset.vop;
          if (op === "add") out.textContent = `(${Modes.vecAdd(A, B).join(", ")})`;
          else if (op === "dot") out.textContent = `A • B = ${Engine.formatNumber(Modes.vecDot(A, B))}`;
          else if (op === "cross") out.textContent = `(${Modes.vecCross(A, B).join(", ")})`;
          else if (op === "abs") out.textContent = `|A| = ${Engine.formatNumber(Modes.vecAbs(A))}`;
          else if (op === "ang") out.textContent = `∠(A,B) = ${Engine.formatNumber(Modes.vecAngle(A, B, state.angleUnit))} ${state.angleUnit}`;
        } catch (err) {
          out.textContent = err.message || "Dimension ERROR";
        }
      });
    });
  }

  function renderStatMode(statType = "1var") {
    el.modePanel.innerHTML = `
      <div class="mode-form">
        <div class="mode-row">
          <strong>6:STAT</strong>
          <select id="stat-type" class="mode-input wide">
            <option value="1var" ${statType === "1var" ? "selected" : ""}>1-VAR (Thống kê 1 biến)</option>
            <option value="2var" ${statType === "2var" ? "selected" : ""}>2-VAR (Hồi quy y = a + bx)</option>
          </select>
        </div>
        <div class="mode-row">
          <label>Dữ liệu x:</label>
          <input id="stat-x" class="mode-input wide" value="${statType === "1var" ? "5, 7, 8, 8, 9, 10, 12" : "1, 2, 3, 4, 5"}">
        </div>
        ${
          statType === "2var"
            ? `<div class="mode-row"><label>Dữ liệu y:</label><input id="stat-y" class="mode-input wide" value="2, 4, 5, 4, 5"></div>`
            : ""
        }
        <div class="mode-row">
          <button class="mode-btn" id="stat-run">Tính</button>
        </div>
        <div class="mode-output" id="stat-out" hidden></div>
      </div>`;

    document.getElementById("stat-type").addEventListener("change", (e) => {
      renderStatMode(e.target.value);
    });

    document.getElementById("stat-run").addEventListener("click", () => {
      const out = document.getElementById("stat-out");
      out.hidden = false;
      try {
        const xs = document
          .getElementById("stat-x")
          .value.trim()
          .split(/[\s,;]+/)
          .filter(Boolean)
          .map(Number);
        if (statType === "1var") {
          const s = Modes.compute1VarStats(xs);
          out.innerHTML = `
            n=${s.n} | x̄=<strong>${Engine.formatNumber(s.mean)}</strong> | Σx=${Engine.formatNumber(s.sum)}<br>
            σx=${Engine.formatNumber(s.popSd)} | sx=${s.sampleSd !== null ? Engine.formatNumber(s.sampleSd) : "-"}<br>
            Min=${s.min} | Q1=${s.q1} | Med=${s.med} | Q3=${s.q3} | Max=${s.max}`;
        } else {
          const ys = document
            .getElementById("stat-y")
            .value.trim()
            .split(/[\s,;]+/)
            .filter(Boolean)
            .map(Number);
          const s = Modes.compute2VarStats(xs, ys);
          out.innerHTML = `
            y = <strong>${Engine.formatNumber(s.a)} + ${Engine.formatNumber(s.b)}x</strong><br>
            Hệ số tương quan r = <strong>${Engine.formatNumber(s.r)}</strong><br>
            x̄ = ${Engine.formatNumber(s.meanX)} | ȳ = ${Engine.formatNumber(s.meanY)}`;
        }
      } catch (err) {
        out.textContent = err.message || "Error";
      }
    });
  }

  // ==================== KEY DISPATCH ====================
  function handleKey(key) {
    // Handle STO + variable target
    if (state.sto) {
      const stoMap = {
        neg: "A", dms: "B", varx: "C", sin: "D", cos: "E", tan: "F",
        rparen: "x", comma: "y", mplus: "M",
      };
      if (stoMap[key]) {
        const target = stoMap[key];
        const val = state.lastRawResult !== null ? state.lastRawResult : state.vars.Ans;
        state.vars[target] = val;
        state.sto = false;
        state.shift = false;
        state.alpha = false;
        syncScreen();
        return;
      }
      state.sto = false;
    }

    const isShift = state.shift;
    const isAlpha = state.alpha;
    state.shift = false;
    state.alpha = false;

    // If inside overlay/special mode, MENU or ON/AC returns cleanly
    if (key === "menu") {
      if (isShift) openSetup();
      else openMenu();
      updateIndicators();
      return;
    }
    if (key === "on") {
      state.mode = state.mode === "CMPLX" ? "CMPLX" : "COMP";
      state.overlay = null;
      clearAll();
      return;
    }
    if (key === "ac") {
      clearAll();
      return;
    }

    // Ensure we are in COMP/CMPLX for expression keys
    if (state.overlay || (state.mode !== "COMP" && state.mode !== "CMPLX")) {
      state.overlay = null;
      if (state.mode !== "COMP" && state.mode !== "CMPLX") state.mode = "COMP";
    }

    // ALPHA mappings
    if (isAlpha) {
      const alphaMap = {
        calc: "=",
        neg: "A", dms: "B", varx: "C", sin: "D", cos: "E", tan: "F",
        rparen: "x", comma: "y", mplus: "M",
        dot: "RanInt#(", exp10: "e",
      };
      if (alphaMap[key]) {
        insertToken(alphaMap[key]);
        return;
      }
    }

    // SHIFT mappings
    if (isShift) {
      switch (key) {
        case "calc":
          openCalcDialog(true);
          return;
        case "integral":
          insertToken("d/dx(");
          return;
        case "inv":
          insertToken("!");
          return;
        case "logab":
          insertToken("Σ(");
          return;
        case "sd":
          if (state.lastRawResult !== null) {
            state.sdState = state.sdState === 2 ? 1 : 2;
            syncScreen();
          }
          return;
        case "sqrt":
          insertToken("∛(");
          return;
        case "sq":
          insertToken("³");
          return;
        case "pow":
          insertToken("√(");
          return;
        case "log":
          insertToken("10^(");
          return;
        case "ln":
          insertToken("e^(");
          return;
        case "neg":
          insertToken("∠");
          return;
        case "dms":
          // FACT: prime factorization
          if (state.lastRawResult !== null && typeof state.lastRawResult === "number") {
            try {
              const f = Engine.primeFactorize(Math.round(state.lastRawResult));
              state.factActive = true;
              syncScreen();
              renderResult(f.html);
            } catch (err) {
              renderResult(escapeHtml(err.message), true);
            }
          }
          return;
        case "varx":
          insertToken("Abs(");
          return;
        case "sin":
          insertToken("sin⁻¹(");
          return;
        case "cos":
          insertToken("cos⁻¹(");
          return;
        case "tan":
          insertToken("tan⁻¹(");
          return;
        case "sto":
          openRecallOverlay();
          return;
        case "eng":
          if (state.mode !== "CMPLX") state.mode = "CMPLX";
          insertToken("i");
          return;
        case "lparen":
          insertToken("%");
          return;
        case "rparen":
          insertToken(",");
          return;
        case "comma":
          insertToken("GCD(");
          return;
        case "mplus":
          if (typeof state.lastRawResult === "number") {
            state.vars.M -= state.lastRawResult;
          }
          syncScreen();
          return;
        case "1":
          state.mode = "STAT";
          renderCurrentModePanel();
          syncScreen();
          return;
        case "2":
          state.mode = "CMPLX";
          clearAll();
          return;
        case "3":
          state.mode = "BASE-N";
          renderCurrentModePanel();
          syncScreen();
          return;
        case "4":
          insertToken("LCM(");
          return;
        case "5":
          insertToken("Int(");
          return;
        case "6":
          insertToken("Intg(");
          return;
        case "7":
          openConstOverlay();
          return;
        case "8":
          openConvOverlay();
          return;
        case "9":
          openClearOverlay();
          return;
        case "mul":
          insertToken("P");
          return;
        case "div":
          insertToken("C");
          return;
        case "add":
          insertToken("Pol(");
          return;
        case "sub":
          insertToken("Rec(");
          return;
        case "0":
          insertToken("Rnd(");
          return;
        case "dot":
          insertToken("Ran#");
          return;
        case "exp10":
          insertToken("π");
          return;
        case "ans":
          insertToken("PreAns");
          return;
        case "eq":
          evaluateCurrent(true);
          return;
      }
    }

    // Normal primary key mappings
    switch (key) {
      case "optn":
        openOptn();
        break;
      case "calc":
        openCalcDialog(false);
        break;
      case "integral":
        insertToken("∫(");
        break;
      case "inv":
        insertToken("⁻¹");
        break;
      case "logab":
        insertToken("log(");
        break;
      case "sd":
        if (state.lastRawResult !== null) {
          state.sdState = state.sdState === 1 ? 0 : 1;
          syncScreen();
        }
        break;
      case "frac":
        insertToken("/");
        break;
      case "sqrt":
        insertToken("√(");
        break;
      case "sq":
        insertToken("²");
        break;
      case "pow":
        insertToken("^");
        break;
      case "log":
        insertToken("log(");
        break;
      case "ln":
        insertToken("ln(");
        break;
      case "neg":
        insertToken("-");
        break;
      case "dms":
        if (state.justEvaluated && typeof state.lastRawResult === "number") {
          state.sdState = state.sdState === 3 ? 1 : 3;
          syncScreen();
        } else {
          // Smart ° ' " insertion
          const before = state.expr.slice(0, state.cursor);
          if (/°[^']*$/.test(before)) insertToken("'");
          else if (/'[^"]*$/.test(before)) insertToken('"');
          else insertToken("°");
        }
        break;
      case "varx":
        insertToken("x");
        break;
      case "sin":
        insertToken("sin(");
        break;
      case "cos":
        insertToken("cos(");
        break;
      case "tan":
        insertToken("tan(");
        break;
      case "sto":
        state.sto = true;
        syncScreen();
        break;
      case "eng":
        if (typeof state.lastRawResult === "number") {
          const eng = state.lastRawResult.toExponential(3);
          syncScreen();
          renderResult(escapeHtml(eng));
        }
        break;
      case "lparen":
        insertToken("(");
        break;
      case "rparen":
        insertToken(")");
        break;
      case "comma":
        insertToken(",");
        break;
      case "mplus":
        if (state.expr.trim() && !state.justEvaluated) {
          evaluateCurrent(false);
        }
        if (typeof state.lastRawResult === "number") {
          state.vars.M += state.lastRawResult;
        }
        syncScreen();
        break;
      case "del":
        deleteChar();
        break;
      case "mul":
        insertToken("×");
        break;
      case "div":
        insertToken("÷");
        break;
      case "add":
        insertToken("+");
        break;
      case "sub":
        insertToken("−");
        break;
      case "dot":
        insertToken(".");
        break;
      case "exp10":
        insertToken("×10^");
        break;
      case "ans":
        insertToken("Ans");
        break;
      case "eq":
        evaluateCurrent(false);
        break;
      default:
        if (/^[0-9]$/.test(key)) {
          insertToken(key);
        }
    }
  }

  // ==================== EVENT LISTENERS ====================
  el.btnShift.addEventListener("click", () => {
    state.shift = !state.shift;
    if (state.shift) state.alpha = false;
    updateIndicators();
  });

  el.btnAlpha.addEventListener("click", () => {
    state.alpha = !state.alpha;
    if (state.alpha) state.shift = false;
    updateIndicators();
  });

  document.querySelectorAll("[data-key]").forEach((btn) => {
    btn.addEventListener("click", () => handleKey(btn.dataset.key));
  });

  document.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dir = btn.dataset.nav;
      if (dir === "left" && state.cursor > 0) {
        state.cursor--;
        state.justEvaluated = false;
        syncScreen();
      } else if (dir === "right" && state.cursor < state.expr.length) {
        state.cursor++;
        state.justEvaluated = false;
        syncScreen();
      } else if (dir === "up" && state.history.length > 0) {
        state.exprHistoryIdx = Math.min(state.history.length - 1, state.exprHistoryIdx + 1);
        state.expr = state.history[state.exprHistoryIdx].expr;
        state.cursor = state.expr.length;
        state.justEvaluated = false;
        syncScreen();
      } else if (dir === "down" && state.exprHistoryIdx > 0) {
        state.exprHistoryIdx--;
        state.expr = state.history[state.exprHistoryIdx].expr;
        state.cursor = state.expr.length;
        state.justEvaluated = false;
        syncScreen();
      }
    });
  });

  el.historyList.addEventListener("click", (e) => {
    const item = e.target.closest("[data-hist]");
    if (!item) return;
    const h = state.history[Number(item.dataset.hist)];
    if (!h) return;
    state.overlay = null;
    if (state.mode !== "COMP" && state.mode !== "CMPLX") state.mode = "COMP";
    state.expr = h.expr;
    state.cursor = state.expr.length;
    state.lastRawResult = h.raw;
    state.justEvaluated = false;
    syncScreen();
  });

  document.getElementById("btn-clear-hist").addEventListener("click", () => {
    state.history = [];
    try { localStorage.removeItem("vn580_history"); } catch {}
    renderHistory();
  });

  document.getElementById("btn-clear-vars").addEventListener("click", () => {
    Object.keys(state.vars).forEach((k) => (state.vars[k] = 0));
    syncScreen();
  });

  // Keyboard support (only when not typing inside an <input> / <textarea>)
  document.addEventListener("keydown", (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      if (e.key === "Escape") {
        document.activeElement.blur();
      }
      return;
    }

    if (e.key >= "0" && e.key <= "9") {
      e.preventDefault();
      handleKey(e.key);
    } else if (e.key === ".") {
      e.preventDefault();
      handleKey("dot");
    } else if (e.key === "+") {
      e.preventDefault();
      handleKey("add");
    } else if (e.key === "-") {
      e.preventDefault();
      handleKey("sub");
    } else if (e.key === "*") {
      e.preventDefault();
      handleKey("mul");
    } else if (e.key === "/") {
      e.preventDefault();
      handleKey("div");
    } else if (e.key === "^") {
      e.preventDefault();
      handleKey("pow");
    } else if (e.key === "(") {
      e.preventDefault();
      handleKey("lparen");
    } else if (e.key === ")") {
      e.preventDefault();
      handleKey("rparen");
    } else if (e.key === ",") {
      e.preventDefault();
      handleKey("comma");
    } else if (e.key === "!") {
      e.preventDefault();
      insertToken("!");
    } else if (e.key === "%") {
      e.preventDefault();
      insertToken("%");
    } else if (e.key === "x" || e.key === "X") {
      e.preventDefault();
      insertToken("x");
    } else if (e.key === "Enter" || e.key === "=") {
      e.preventDefault();
      handleKey("eq");
    } else if (e.key === "Backspace") {
      e.preventDefault();
      handleKey("del");
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleKey("ac");
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (state.cursor > 0) {
        state.cursor--;
        state.justEvaluated = false;
        syncScreen();
      }
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (state.cursor < state.expr.length) {
        state.cursor++;
        state.justEvaluated = false;
        syncScreen();
      }
    }
  });

  // ==================== THEME SWITCHER ====================
  const SKIN_META = {
    classic: { brand: "VN-580", model: 'SCIENTIFIC<em>PLUS</em>' },
    hacker: { brand: "ROOT@580", model: 'MATRIX<em>//SH</em>' },
    kitty: { brand: "🎀 MEW-580", model: 'KAWAII<em>PINK</em>' },
    anime: { brand: "🌸 SAKURA-580", model: 'ANIME<em>NEON</em>' },
    cozy: { brand: "🪵 COZY-580", model: 'STUDIO<em>ED.</em>' },
  };

  function applyTheme(theme) {
    const valid = SKIN_META[theme] ? theme : "classic";
    document.documentElement.setAttribute("data-theme", valid);
    try {
      localStorage.setItem("vn580_theme", valid);
    } catch {}
    document.querySelectorAll("[data-theme-btn]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.themeBtn === valid);
    });
    const brandEl = document.getElementById("skin-brand");
    const modelEl = document.getElementById("skin-model");
    if (brandEl && modelEl) {
      brandEl.textContent = SKIN_META[valid].brand;
      modelEl.innerHTML = SKIN_META[valid].model;
    }
  }

  document.querySelectorAll("[data-theme-btn]").forEach((btn) => {
    btn.addEventListener("click", () => applyTheme(btn.dataset.themeBtn));
  });

  let savedTheme = "classic";
  try {
    savedTheme = localStorage.getItem("vn580_theme") || "classic";
    const savedHist = JSON.parse(localStorage.getItem("vn580_history") || "[]");
    if (Array.isArray(savedHist)) {
      state.history = savedHist.map((h) => ({ expr: h.expr, resultText: h.resultText, raw: null }));
    }
  } catch {}
  applyTheme(savedTheme);

  // Initial render
  syncScreen();
  renderHistory();
})();
