/**
 * Casio fx-580VN X Specialized Modes
 * EQUATION (Linear systems 2-4, Polynomials deg 2-4), INEQ (deg 2-3),
 * MATRIX, VECTOR, STAT, BASE-N, TABLE.
 */
(function (global) {
  "use strict";

  const Engine = typeof module !== "undefined" && module.exports
    ? require("./engine.js")
    : global.CasioEngine;

  const { Complex, cleanZero, formatNumber, formatComplex, toExactSymbolic, parseExpression } = Engine;

  function formatValueExactOrDec(val) {
    if (val instanceof Complex) {
      return formatComplex(val);
    }
    const exact = toExactSymbolic(val);
    if (exact && exact.type !== "int") {
      return `${exact.text} (≈${formatNumber(val)})`;
    }
    return exact ? exact.text : formatNumber(val);
  }

  // ==================== 1. LINEAR SYSTEM (2x2, 3x3, 4x4) ====================
  function solveLinearSystem(augmented) {
    const n = augmented.length;
    const M = augmented.map((row) => row.map(Number));

    let rank = 0;
    for (let col = 0; col < n; col++) {
      let pivot = rank;
      for (let r = rank + 1; r < n; r++) {
        if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
      }
      if (Math.abs(M[pivot][col]) < 1e-12) continue;
      [M[rank], M[pivot]] = [M[pivot], M[rank]];

      const div = M[rank][col];
      for (let c = col; c <= n; c++) M[rank][c] /= div;
      for (let r = 0; r < n; r++) {
        if (r !== rank && Math.abs(M[r][col]) > 1e-12) {
          const factor = M[r][col];
          for (let c = col; c <= n; c++) M[r][c] -= factor * M[rank][c];
        }
      }
      rank++;
    }

    for (let r = rank; r < n; r++) {
      if (Math.abs(M[r][n]) > 1e-9) {
        return { status: "no-solution", message: "Vô nghiệm (No Solution)" };
      }
    }
    if (rank < n) {
      return { status: "infinite", message: "Vô số nghiệm (Infinite Sol.)" };
    }

    const vars = ["x", "y", "z", "t"];
    const solutions = M.map((row, idx) => {
      const val = cleanZero(row[n]);
      return {
        name: vars[idx] || `x${idx + 1}`,
        value: val,
        display: formatValueExactOrDec(val),
      };
    });
    return { status: "unique", solutions };
  }

  // ==================== 2. POLYNOMIAL SOLVER (deg 2, 3, 4) ====================
  function solveQuadratic(a, b, c) {
    if (Math.abs(a) < 1e-14) throw new Error("a phải khác 0");
    const disc = b * b - 4 * a * c;
    const roots = [];
    if (disc >= -1e-12) {
      const sq = Math.sqrt(Math.max(0, disc));
      const x1 = cleanZero((-b + sq) / (2 * a));
      const x2 = cleanZero((-b - sq) / (2 * a));
      if (Math.abs(x1 - x2) < 1e-11) {
        roots.push(x1);
      } else {
        roots.push(x1, x2);
      }
    } else {
      const re = cleanZero(-b / (2 * a));
      const im = Math.sqrt(-disc) / (2 * a);
      roots.push(new Complex(re, im), new Complex(re, -im));
    }
    const vx = cleanZero(-b / (2 * a));
    const vy = cleanZero(a * vx * vx + b * vx + c);
    return {
      roots,
      extrema: [{ label: a > 0 ? "Cực tiểu (Min)" : "Cực đại (Max)", x: vx, y: vy }],
    };
  }

  function solveCubic(a, b, c, d) {
    if (Math.abs(a) < 1e-14) return solveQuadratic(b, c, d);
    // Depressed cubic t^3 + pt + q = 0 where x = t - b/(3a)
    const p = (3 * a * c - b * b) / (3 * a * a);
    const q = (2 * b * b * b - 9 * a * b * c + 27 * a * a * d) / (27 * a * a * a);
    const shift = -b / (3 * a);
    const disc = (q * q) / 4 + (p * p * p) / 27;

    let roots = [];
    if (disc > 1e-12) {
      const sq = Math.sqrt(disc);
      const u = Math.cbrt(-q / 2 + sq);
      const v = Math.cbrt(-q / 2 - sq);
      const x1 = cleanZero(u + v + shift);
      const re = cleanZero(-(u + v) / 2 + shift);
      const im = cleanZero(((u - v) * Math.sqrt(3)) / 2);
      roots = [x1, new Complex(re, im), new Complex(re, -im)];
    } else if (Math.abs(disc) <= 1e-12) {
      if (Math.abs(q) < 1e-12) {
        roots = [cleanZero(shift)];
      } else {
        const u = Math.cbrt(-q / 2);
        roots = [cleanZero(2 * u + shift), cleanZero(-u + shift)];
      }
    } else {
      const r = Math.sqrt((-p * p * p) / 27);
      const phi = Math.acos(Math.max(-1, Math.min(1, -q / (2 * r))));
      const m = 2 * Math.cbrt(r);
      roots = [
        cleanZero(m * Math.cos(phi / 3) + shift),
        cleanZero(m * Math.cos((phi + 2 * Math.PI) / 3) + shift),
        cleanZero(m * Math.cos((phi + 4 * Math.PI) / 3) + shift),
      ];
    }

    // Extrema via derivative 3ax^2 + 2bx + c = 0
    const extrema = [];
    const dDisc = 4 * b * b - 12 * a * c;
    if (dDisc > 1e-12) {
      const sq = Math.sqrt(dDisc);
      const ex1 = (-2 * b - sq) / (6 * a);
      const ex2 = (-2 * b + sq) / (6 * a);
      const f = (x) => a * x ** 3 + b * x ** 2 + c * x + d;
      const e1 = { x: cleanZero(ex1), y: cleanZero(f(ex1)), sec: 6 * a * ex1 + 2 * b };
      const e2 = { x: cleanZero(ex2), y: cleanZero(f(ex2)), sec: 6 * a * ex2 + 2 * b };
      for (const ex of [e1, e2]) {
        extrema.push({
          label: ex.sec < 0 ? "Cực đại (Local Max)" : "Cực tiểu (Local Min)",
          x: ex.x,
          y: ex.y,
        });
      }
    }
    return { roots, extrema };
  }

  /**
   * Durand-Kerner method for degree-4 polynomial a*x^4 + b*x^3 + c*x^2 + d*x + e = 0
   */
  function solveQuartic(a, b, c, d, e) {
    if (Math.abs(a) < 1e-14) return solveCubic(b, c, d, e);
    const c3 = b / a, c2 = c / a, c1 = d / a, c0 = e / a;
    const evalP = (z) => {
      return z.pow(4).add(z.pow(3).mul(c3)).add(z.pow(2).mul(c2)).add(z.mul(c1)).add(c0);
    };

    let roots = [
      new Complex(1, 0),
      new Complex(0.4, 0.9),
      new Complex(-0.6, 0.5),
      new Complex(-0.8, -0.7),
    ];

    for (let iter = 0; iter < 150; iter++) {
      let maxStep = 0;
      for (let i = 0; i < 4; i++) {
        let denom = new Complex(1, 0);
        for (let j = 0; j < 4; j++) {
          if (i !== j) denom = denom.mul(roots[i].sub(roots[j]));
        }
        if (denom.abs() < 1e-15) continue;
        const delta = evalP(roots[i]).div(denom);
        roots[i] = roots[i].sub(delta);
        maxStep = Math.max(maxStep, delta.abs());
      }
      if (maxStep < 1e-12) break;
    }

    const formatted = roots.map((r) => (r.isReal() ? cleanZero(r.re) : r));
    return { roots: formatted, extrema: [] };
  }

  function solvePolynomial(coeffs) {
    const deg = coeffs.length - 1;
    let res;
    if (deg === 2) res = solveQuadratic(...coeffs);
    else if (deg === 3) res = solveCubic(...coeffs);
    else if (deg === 4) res = solveQuartic(...coeffs);
    else throw new Error("Chỉ hỗ trợ bậc 2, 3, 4");

    return {
      roots: res.roots.map((r, i) => ({
        name: `x${i + 1}`,
        raw: r,
        display: formatValueExactOrDec(r),
      })),
      extrema: res.extrema.map((ex) => ({
        label: ex.label,
        x: formatValueExactOrDec(ex.x),
        y: formatValueExactOrDec(ex.y),
      })),
    };
  }

  // ==================== 3. INEQUALITY SOLVER (deg 2, 3) ====================
  function solveInequality(coeffs, op) {
    const poly = (x) => coeffs.reduce((acc, c, i) => acc + c * Math.pow(x, coeffs.length - 1 - i), 0);
    const res = coeffs.length === 3 ? solveQuadratic(...coeffs) : solveCubic(...coeffs);
    const realRoots = res.roots
      .filter((r) => typeof r === "number")
      .sort((a, b) => a - b);

    // Deduplicate close roots
    const unique = [];
    for (const r of realRoots) {
      if (unique.length === 0 || Math.abs(r - unique[unique.length - 1]) > 1e-9) {
        unique.push(r);
      }
    }

    const strict = op === ">" || op === "<";
    const wantPos = op === ">" || op === ">=";
    const check = (val) => (wantPos ? val > 0 : val < 0);

    const bounds = [-Infinity, ...unique, Infinity];
    const intervals = [];

    for (let i = 0; i < bounds.length - 1; i++) {
      const lo = bounds[i];
      const hi = bounds[i + 1];
      let sample;
      if (lo === -Infinity && hi === Infinity) sample = 0;
      else if (lo === -Infinity) sample = hi - 1;
      else if (hi === Infinity) sample = lo + 1;
      else sample = (lo + hi) / 2;

      if (check(poly(sample))) {
        intervals.push({ lo, hi, loInc: !strict && lo !== -Infinity, hiInc: !strict && hi !== Infinity });
      }
    }

    // Merge adjacent intervals if non-strict and root is included
    if (!strict && intervals.length > 0) {
      const merged = [intervals[0]];
      for (let i = 1; i < intervals.length; i++) {
        const prev = merged[merged.length - 1];
        const curr = intervals[i];
        if (Math.abs(prev.hi - curr.lo) < 1e-9) {
          prev.hi = curr.hi;
          prev.hiInc = curr.hiInc;
        } else {
          merged.push(curr);
        }
      }
      intervals.length = 0;
      intervals.push(...merged);
    }

    // Also handle isolated roots when <= or >=
    if (!strict && intervals.length === 0) {
      for (const r of unique) {
        return `x = ${formatValueExactOrDec(r)}`;
      }
    }

    if (intervals.length === 0) return "Vô nghiệm (No Solution)";
    if (intervals.length === 1 && intervals[0].lo === -Infinity && intervals[0].hi === Infinity) {
      return "Nghiệm đúng với mọi x ∈ ℝ (All Real)";
    }

    const fmt = (v) => formatValueExactOrDec(v);
    return intervals
      .map((iv) => {
        if (iv.lo === -Infinity) return `x ${iv.hiInc ? "≤" : "<"} ${fmt(iv.hi)}`;
        if (iv.hi === Infinity) return `x ${iv.loInc ? "≥" : ">"} ${fmt(iv.lo)}`;
        return `${fmt(iv.lo)} ${iv.loInc ? "≤" : "<"} x ${iv.hiInc ? "≤" : "<"} ${fmt(iv.hi)}`;
      })
      .join("  hoặc  ");
  }

  // ==================== 4. MATRIX ====================
  function matAdd(A, B, sign = 1) {
    if (A.length !== B.length || A[0].length !== B[0].length) throw new Error("Dimension ERROR");
    return A.map((row, r) => row.map((v, c) => cleanZero(v + sign * B[r][c])));
  }

  function matMul(A, B) {
    if (A[0].length !== B.length) throw new Error("Dimension ERROR");
    const res = Array.from({ length: A.length }, () => Array(B[0].length).fill(0));
    for (let i = 0; i < A.length; i++) {
      for (let j = 0; j < B[0].length; j++) {
        let sum = 0;
        for (let k = 0; k < A[0].length; k++) sum += A[i][k] * B[k][j];
        res[i][j] = cleanZero(sum);
      }
    }
    return res;
  }

  function matTranspose(A) {
    return A[0].map((_, c) => A.map((row) => row[c]));
  }

  function matDet(A) {
    const n = A.length;
    if (n !== A[0].length) throw new Error("Dimension ERROR");
    const M = A.map((r) => [...r]);
    let det = 1;
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let r = col + 1; r < n; r++) {
        if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
      }
      if (Math.abs(M[pivot][col]) < 1e-12) return 0;
      if (pivot !== col) {
        [M[col], M[pivot]] = [M[pivot], M[col]];
        det = -det;
      }
      det *= M[col][col];
      for (let r = col + 1; r < n; r++) {
        const f = M[r][col] / M[col][col];
        for (let c = col; c < n; c++) M[r][c] -= f * M[col][c];
      }
    }
    return cleanZero(det);
  }

  function matInverse(A) {
    const n = A.length;
    if (n !== A[0].length) throw new Error("Dimension ERROR");
    const M = A.map((row, i) => [
      ...row,
      ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
    ]);
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let r = col + 1; r < n; r++) {
        if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
      }
      if (Math.abs(M[pivot][col]) < 1e-12) throw new Error("Math ERROR (Det = 0)");
      [M[col], M[pivot]] = [M[pivot], M[col]];
      const div = M[col][col];
      for (let c = 0; c < 2 * n; c++) M[col][c] /= div;
      for (let r = 0; r < n; r++) {
        if (r !== col) {
          const f = M[r][col];
          for (let c = 0; c < 2 * n; c++) M[r][c] -= f * M[col][c];
        }
      }
    }
    return M.map((row) => row.slice(n).map(cleanZero));
  }

  // ==================== 5. VECTOR ====================
  function vecAdd(a, b, sign = 1) {
    if (a.length !== b.length) throw new Error("Dimension ERROR");
    return a.map((v, i) => cleanZero(v + sign * b[i]));
  }
  function vecDot(a, b) {
    if (a.length !== b.length) throw new Error("Dimension ERROR");
    return cleanZero(a.reduce((s, v, i) => s + v * b[i], 0));
  }
  function vecCross(a, b) {
    if (a.length !== 3 || b.length !== 3) throw new Error("Chỉ hỗ trợ vector 3D");
    return [
      cleanZero(a[1] * b[2] - a[2] * b[1]),
      cleanZero(a[2] * b[0] - a[0] * b[2]),
      cleanZero(a[0] * b[1] - a[1] * b[0]),
    ];
  }
  function vecAbs(a) {
    return Math.hypot(...a);
  }
  function vecAngle(a, b, angleUnit = "DEG") {
    const mag = vecAbs(a) * vecAbs(b);
    if (mag === 0) throw new Error("Math ERROR");
    const cos = Math.max(-1, Math.min(1, vecDot(a, b) / mag));
    return Engine.fromRadians(Math.acos(cos), angleUnit);
  }

  // ==================== 6. STATISTICS ====================
  function compute1VarStats(data) {
    if (!data.length) throw new Error("Data trống");
    const n = data.length;
    const sorted = [...data].sort((a, b) => a - b);
    const sum = data.reduce((s, v) => s + v, 0);
    const sumSq = data.reduce((s, v) => s + v * v, 0);
    const mean = sum / n;
    const popVar = data.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const sampleVar = n > 1 ? (popVar * n) / (n - 1) : 0;

    const median = (arr) => {
      const m = Math.floor(arr.length / 2);
      return arr.length % 2 === 0 ? (arr[m - 1] + arr[m]) / 2 : arr[m];
    };
    const mid = Math.floor(n / 2);
    const lower = sorted.slice(0, mid);
    const upper = sorted.slice(n % 2 === 0 ? mid : mid + 1);

    return {
      n,
      mean: cleanZero(mean),
      sum: cleanZero(sum),
      sumSq: cleanZero(sumSq),
      popSd: cleanZero(Math.sqrt(popVar)),
      sampleSd: n > 1 ? cleanZero(Math.sqrt(sampleVar)) : null,
      min: sorted[0],
      q1: lower.length ? median(lower) : sorted[0],
      med: median(sorted),
      q3: upper.length ? median(upper) : sorted[n - 1],
      max: sorted[n - 1],
    };
  }

  function compute2VarStats(xs, ys) {
    if (xs.length !== ys.length || xs.length < 2) throw new Error("Cần ít nhất 2 cặp (x, y)");
    const n = xs.length;
    const sumX = xs.reduce((s, v) => s + v, 0);
    const sumY = ys.reduce((s, v) => s + v, 0);
    const meanX = sumX / n;
    const meanY = sumY / n;
    let sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - meanX;
      const dy = ys[i] - meanY;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    }
    if (sxx === 0) throw new Error("Math ERROR");
    const b = sxy / sxx;
    const a = meanY - b * meanX;
    const r = syy === 0 ? 1 : sxy / Math.sqrt(sxx * syy);
    return { n, meanX, meanY, a: cleanZero(a), b: cleanZero(b), r: cleanZero(r) };
  }

  // ==================== 7. BASE-N ====================
  function baseConvert(str, fromBase) {
    const clean = str.trim().toUpperCase();
    const valid = {
      10: /^-?\d+$/,
      16: /^[0-9A-F]+$/,
      2: /^[01]+$/,
      8: /^[0-7]+$/,
    };
    if (!valid[fromBase] || !valid[fromBase].test(clean)) {
      throw new Error("Syntax ERROR");
    }
    let val = parseInt(clean, fromBase) | 0; // 32-bit signed
    const u32 = val >>> 0;
    return {
      val,
      DEC: String(val),
      HEX: u32.toString(16).toUpperCase(),
      BIN: u32.toString(2),
      OCT: u32.toString(8),
    };
  }

  // ==================== 8. TABLE ====================
  function generateTable(fExpr, gExpr, start, end, step, ctx = {}) {
    if (step <= 0) throw new Error("Step phải > 0");
    const rows = [];
    const compiledF = parseExpression(fExpr, ctx);
    const compiledG = gExpr && gExpr.trim() ? parseExpression(gExpr, ctx) : null;
    const maxRows = 60;
    for (let i = 0; i < maxRows; i++) {
      const x = cleanZero(start + i * step);
      if (x > end + 1e-10) break;
      let fx, gx = null;
      try {
        const r = compiledF.evaluate({ x });
        fx = r instanceof Complex ? formatComplex(r) : formatNumber(r);
      } catch {
        fx = "Error";
      }
      if (compiledG) {
        try {
          const r = compiledG.evaluate({ x });
          gx = r instanceof Complex ? formatComplex(r) : formatNumber(r);
        } catch {
          gx = "Error";
        }
      }
      rows.push({ x: formatNumber(x), fx, gx });
    }
    return rows;
  }

  const Modes = {
    solveLinearSystem,
    solvePolynomial,
    solveInequality,
    matAdd,
    matMul,
    matTranspose,
    matDet,
    matInverse,
    vecAdd,
    vecDot,
    vecCross,
    vecAbs,
    vecAngle,
    compute1VarStats,
    compute2VarStats,
    baseConvert,
    generateTable,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Modes;
  } else {
    global.CasioModes = Modes;
  }
})(typeof window !== "undefined" ? window : globalThis);
