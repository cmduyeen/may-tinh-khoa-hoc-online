/**
 * Casio fx-580VN X Math Engine
 * Supports exact fractions, surd/pi S<=>D recognition, complex numbers,
 * calculus (numerical integral, derivative, summation, product),
 * root-finding (SOLVE), prime factorization (FACT), and full expression parsing.
 */
(function (global) {
  "use strict";

  const EPS = 1e-12;

  function gcdBig(a, b) {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;
    while (b !== 0n) {
      const t = a % b;
      a = b;
      b = t;
    }
    return a === 0n ? 1n : a;
  }

  function gcdNum(a, b) {
    a = Math.abs(Math.trunc(a));
    b = Math.abs(Math.trunc(b));
    while (b !== 0) {
      const t = a % b;
      a = b;
      b = t;
    }
    return a || 1;
  }

  function lcmNum(a, b) {
    a = Math.abs(Math.trunc(a));
    b = Math.abs(Math.trunc(b));
    if (a === 0 || b === 0) return 0;
    return (a / gcdNum(a, b)) * b;
  }

  class Complex {
    constructor(re = 0, im = 0) {
      this.re = Math.abs(re) < 1e-14 ? 0 : re;
      this.im = Math.abs(im) < 1e-14 ? 0 : im;
    }
    static from(v) {
      return v instanceof Complex ? v : new Complex(Number(v), 0);
    }
    isReal() {
      return Math.abs(this.im) < 1e-12;
    }
    add(o) {
      o = Complex.from(o);
      return new Complex(this.re + o.re, this.im + o.im);
    }
    sub(o) {
      o = Complex.from(o);
      return new Complex(this.re - o.re, this.im - o.im);
    }
    mul(o) {
      o = Complex.from(o);
      return new Complex(
        this.re * o.re - this.im * o.im,
        this.re * o.im + this.im * o.re
      );
    }
    div(o) {
      o = Complex.from(o);
      const d = o.re * o.re + o.im * o.im;
      if (d === 0) throw new Error("Math ERROR");
      return new Complex(
        (this.re * o.re + this.im * o.im) / d,
        (this.im * o.re - this.re * o.im) / d
      );
    }
    pow(o) {
      o = Complex.from(o);
      if (this.re === 0 && this.im === 0) {
        if (o.re === 0 && o.im === 0) return new Complex(1, 0);
        if (o.re > 0 && o.im === 0) return new Complex(0, 0);
        throw new Error("Math ERROR");
      }
      if (o.isReal() && Number.isInteger(o.re) && Math.abs(o.re) <= 20) {
        let n = o.re;
        let base = this;
        if (n < 0) {
          base = new Complex(1, 0).div(base);
          n = -n;
        }
        let res = new Complex(1, 0);
        for (let i = 0; i < n; i++) res = res.mul(base);
        return res;
      }
      const r = Math.hypot(this.re, this.im);
      const theta = Math.atan2(this.im, this.re);
      const lnR = Math.log(r);
      const mag = Math.exp(o.re * lnR - o.im * theta);
      const ang = o.re * theta + o.im * lnR;
      return new Complex(mag * Math.cos(ang), mag * Math.sin(ang));
    }
    abs() {
      return Math.hypot(this.re, this.im);
    }
    arg(angleUnit = "DEG") {
      const rad = Math.atan2(this.im, this.re);
      return fromRadians(rad, angleUnit);
    }
    conj() {
      return new Complex(this.re, -this.im);
    }
  }

  function toRadians(val, angleUnit) {
    if (angleUnit === "DEG") return (val * Math.PI) / 180;
    if (angleUnit === "GRAD") return (val * Math.PI) / 200;
    return val;
  }

  function fromRadians(rad, angleUnit) {
    if (angleUnit === "DEG") return (rad * 180) / Math.PI;
    if (angleUnit === "GRAD") return (rad * 200) / Math.PI;
    return rad;
  }

  function cleanZero(x) {
    return Math.abs(x) < 1e-13 ? 0 : x;
  }

  function formatNumber(n, fixDigits = null) {
    if (!Number.isFinite(n)) throw new Error("Math ERROR");
    n = cleanZero(n);
    if (fixDigits !== null && fixDigits >= 0 && fixDigits <= 9) {
      return Number(n.toFixed(fixDigits)).toString();
    }
    const rounded = Number(n.toPrecision(10));
    if (Math.abs(rounded) >= 1e10 || (rounded !== 0 && Math.abs(rounded) < 1e-6)) {
      return rounded.toExponential(6).replace(/\.?0+e/, "e").replace("e+", "×10^").replace("e", "×10^");
    }
    return String(rounded);
  }

  /**
   * Continued fraction approximation to convert a floating-point number
   * to a rational p/q if denominator <= maxDenom and error < tol.
   */
  function toFraction(x, maxDenom = 10000, tol = 1e-10) {
    if (!Number.isFinite(x)) return null;
    if (Math.abs(x) < 1e-13) return { num: 0, den: 1 };
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    if (x > 1e9) return null;

    let h1 = 1, h2 = 0, k1 = 0, k2 = 1;
    let b = x;
    for (let i = 0; i < 32; i++) {
      const a = Math.floor(b);
      const h = a * h1 + h2;
      const k = a * k1 + k2;
      if (k > maxDenom) break;
      h2 = h1; h1 = h;
      k2 = k1; k1 = k;
      const frac = b - a;
      if (Math.abs(x - h1 / k1) <= tol * Math.max(1, x)) {
        return { num: sign * h1, den: k1 };
      }
      if (frac < 1e-14) break;
      b = 1 / frac;
    }
    if (k1 <= maxDenom && Math.abs(x - h1 / k1) <= tol * Math.max(1, x)) {
      return { num: sign * h1, den: k1 };
    }
    return null;
  }

  /**
   * Recognize exact Casio-style symbolic forms (fractions, pi multiples, common surds)
   */
  function toExactSymbolic(x) {
    if (!Number.isFinite(x)) return null;
    if (Math.abs(x) < 1e-13) return { text: "0", html: "0", type: "int" };

    // 1. Plain fraction
    const f = toFraction(x, 10000, 1e-10);
    if (f) {
      if (f.den === 1) {
        return { text: String(f.num), html: String(f.num), type: "int" };
      }
      return {
        text: `${f.num}/${f.den}`,
        html: `<span class="frac"><span class="frac-num">${f.num}</span><span class="frac-den">${f.den}</span></span>`,
        type: "frac",
        num: f.num,
        den: f.den,
      };
    }

    // 2. Common surds & pi multiples (a * base / b)
    const bases = [
      { val: Math.PI, label: "π", html: "π" },
      { val: Math.SQRT2, label: "√2", html: "√2" },
      { val: Math.sqrt(3), label: "√3", html: "√3" },
      { val: Math.sqrt(5), label: "√5", html: "√5" },
      { val: Math.sqrt(6), label: "√6", html: "√6" },
      { val: Math.sqrt(7), label: "√7", html: "√7" },
      { val: Math.sqrt(10), label: "√10", html: "√10" },
    ];
    for (const base of bases) {
      const ratio = x / base.val;
      const rf = toFraction(ratio, 200, 1e-10);
      if (rf && rf.num !== 0) {
        const sign = rf.num < 0 ? "-" : "";
        const absN = Math.abs(rf.num);
        const coeff = absN === 1 ? "" : String(absN);
        if (rf.den === 1) {
          return {
            text: `${sign}${coeff}${base.label}`,
            html: `${sign}${coeff}${base.html}`,
            type: "exact",
          };
        }
        return {
          text: `${sign}${coeff}${base.label}/${rf.den}`,
          html: `<span class="frac"><span class="frac-num">${sign}${coeff}${base.html}</span><span class="frac-den">${rf.den}</span></span>`,
          type: "exact",
        };
      }
    }

    // 3. Quadratic surd (a ± b√c)/d for small c in {2,3,5,6}
    const surds = [2, 3, 5, 6];
    for (const s of surds) {
      const root = Math.sqrt(s);
      for (let d = 1; d <= 12; d++) {
        const xd = x * d;
        for (let b = -12; b <= 12; b++) {
          if (b === 0) continue;
          const a = Math.round(xd - b * root);
          if (Math.abs(a) <= 24 && Math.abs((a + b * root) / d - x) < 1e-10) {
            if (a === 0) continue;
            const g = gcdNum(gcdNum(a, b), d);
            const aa = a / g, bb = b / g, dd = d / g;
            const bSign = bb > 0 ? "+" : "-";
            const bAbs = Math.abs(bb) === 1 ? "" : String(Math.abs(bb));
            const numText = `${aa}${bSign}${bAbs}√${s}`;
            if (dd === 1) {
              return { text: numText, html: numText, type: "exact" };
            }
            return {
              text: `(${numText})/${dd}`,
              html: `<span class="frac"><span class="frac-num">${numText}</span><span class="frac-den">${dd}</span></span>`,
              type: "exact",
            };
          }
        }
      }
    }
    return null;
  }

  function toMixedFraction(x) {
    const f = toFraction(x, 10000, 1e-10);
    if (!f || f.den === 1 || Math.abs(f.num) < f.den) return null;
    const sign = f.num < 0 ? "-" : "";
    const absN = Math.abs(f.num);
    const whole = Math.floor(absN / f.den);
    const rem = absN % f.den;
    if (rem === 0) return { text: `${sign}${whole}`, html: `${sign}${whole}` };
    return {
      text: `${sign}${whole} ${rem}/${f.den}`,
      html: `${sign}${whole}<span class="frac"><span class="frac-num">${rem}</span><span class="frac-den">${f.den}</span></span>`,
    };
  }

  function formatComplex(c, polar = false, angleUnit = "DEG") {
    if (c.isReal()) return formatNumber(c.re);
    if (polar) {
      const r = formatNumber(c.abs());
      const th = formatNumber(c.arg(angleUnit));
      return `${r}∠${th}`;
    }
    const re = cleanZero(c.re);
    const im = cleanZero(c.im);
    const imAbs = Math.abs(im);
    const imStr = Math.abs(imAbs - 1) < 1e-12 ? "i" : `${formatNumber(imAbs)}i`;
    if (re === 0) return im < 0 ? `-${imStr}` : imStr;
    return `${formatNumber(re)}${im < 0 ? "-" : "+"}${imStr}`;
  }

  function primeFactorize(n) {
    if (!Number.isInteger(n) || n < 2 || n > 1e12) {
      throw new Error("Math ERROR");
    }
    let val = n;
    const factors = [];
    for (let p = 2; p * p <= val; p++) {
      if (val % p === 0) {
        let count = 0;
        while (val % p === 0) {
          val /= p;
          count++;
        }
        factors.push({ p, count });
      }
    }
    if (val > 1) factors.push({ p: val, count: 1 });
    const text = factors.map((f) => (f.count === 1 ? `${f.p}` : `${f.p}^${f.count}`)).join("×");
    const html = factors
      .map((f) => (f.count === 1 ? `${f.p}` : `${f.p}<sup>${f.count}</sup>`))
      .join("×");
    return { text, html, factors };
  }

  function toDMS(deg) {
    if (!Number.isFinite(deg)) throw new Error("Math ERROR");
    const sign = deg < 0 ? "-" : "";
    const abs = Math.abs(deg);
    const d = Math.floor(abs + 1e-11);
    const remM = (abs - d) * 60;
    const m = Math.floor(Math.max(0, remM) + 1e-9);
    const s = Math.max(0, (remM - m) * 60);
    const sClean = Number(s.toFixed(2));
    return `${sign}${d}°${m}'${sClean}"`;
  }

  function factorial(n) {
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n) || n > 170) {
      throw new Error("Math ERROR");
    }
    let res = 1;
    for (let i = 2; i <= n; i++) res *= i;
    return res;
  }

  function nCr(n, r) {
    if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0 || r > n) {
      throw new Error("Math ERROR");
    }
    r = Math.min(r, n - r);
    let res = 1;
    for (let i = 1; i <= r; i++) {
      res = (res * (n - r + i)) / i;
    }
    return Math.round(res);
  }

  function nPr(n, r) {
    if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0 || r > n) {
      throw new Error("Math ERROR");
    }
    let res = 1;
    for (let i = 0; i < r; i++) res *= n - i;
    return res;
  }

  // ======================== TOKENIZER & PARSER ========================

  const MULTI_FUNCS = [
    "sin⁻¹", "cos⁻¹", "tan⁻¹",
    "asin", "acos", "atan",
    "sinh", "cosh", "tanh",
    "sin", "cos", "tan",
    "log₂", "log", "ln",
    "Abs", "abs", "Arg", "arg", "Conjg", "conj",
    "GCD", "LCM", "Intg", "Int", "Rnd",
    "RanInt#", "Ran#", "Pol", "Rec",
    "nCr", "nPr", "d/dx", "∫", "Σ", "Π",
    "√", "∛"
  ];

  const CONSTANTS = {
    "π": Math.PI,
    "e": Math.E,
    "i": "IMAGINARY",
  };

  function tokenize(input) {
    const tokens = [];
    let i = 0;
    const s = String(input)
      .replace(/\s+/g, "")
      .replace(/−/g, "-")
      .replace(/×/g, "*")
      .replace(/÷/g, "/")
      .replace(/⋅/g, "*");

    while (i < s.length) {
      const ch = s[i];

      // Numbers (including scientific notation like 1.5E-3)
      if (/\d/.test(ch) || (ch === "." && /\d/.test(s[i + 1] || ""))) {
        let j = i;
        while (j < s.length && /[\d.]/.test(s[j])) j++;
        if (s[j] === "E" && /[+-]?\d/.test(s.slice(j + 1))) {
          j++;
          if (s[j] === "+" || s[j] === "-") j++;
          while (j < s.length && /\d/.test(s[j])) j++;
        }
        const raw = s.slice(i, j);
        const val = Number(raw);
        if (Number.isNaN(val)) throw new Error("Syntax ERROR");
        tokens.push({ type: "NUM", value: val });
        i = j;
        continue;
      }

      // Check PreAns / Ans
      if (s.startsWith("PreAns", i)) {
        tokens.push({ type: "VAR", value: "PreAns" });
        i += 6;
        continue;
      }
      if (s.startsWith("Ans", i)) {
        tokens.push({ type: "VAR", value: "Ans" });
        i += 3;
        continue;
      }

      // Check named functions
      let matchedFunc = null;
      for (const fn of MULTI_FUNCS) {
        if (s.startsWith(fn, i)) {
          matchedFunc = fn;
          break;
        }
      }
      if (matchedFunc) {
        if (matchedFunc === "nCr") {
          tokens.push({ type: "OP", value: "C" });
        } else if (matchedFunc === "nPr") {
          tokens.push({ type: "OP", value: "P" });
        } else {
          tokens.push({ type: "FUNC", value: matchedFunc });
        }
        i += matchedFunc.length;
        continue;
      }

      // Combinatorics C / P infix when between expressions
      if ((ch === "C" || ch === "P") && tokens.length > 0) {
        const prev = tokens[tokens.length - 1];
        if (prev.type === "NUM" || prev.type === "RPAREN" || prev.type === "VAR") {
          // Only treat C/P as operator if followed by digit or '(' or var
          const nextCh = s[i + 1] || "";
          if (/[\d(A-Fx y Mπe]/.test(nextCh)) {
            tokens.push({ type: "OP", value: ch });
            i++;
            continue;
          }
        }
      }

      // Constants
      if (ch === "π" || ch === "e" || ch === "i") {
        tokens.push({ type: "CONST", value: ch });
        i++;
        continue;
      }

      // Variables A-F, x, y, M
      if ("ABCDEFxyM".includes(ch)) {
        tokens.push({ type: "VAR", value: ch });
        i++;
        continue;
      }

      // Special postfix/superscript tokens
      if (ch === "²") {
        tokens.push({ type: "POSTFIX", value: "^2" });
        i++;
        continue;
      }
      if (ch === "³") {
        tokens.push({ type: "POSTFIX", value: "^3" });
        i++;
        continue;
      }
      if (s.startsWith("⁻¹", i)) {
        tokens.push({ type: "POSTFIX", value: "^-1" });
        i += 2;
        continue;
      }
      if (ch === "!" || ch === "%") {
        tokens.push({ type: "POSTFIX", value: ch });
        i++;
        continue;
      }
      if (ch === "°" || ch === "'" || ch === '"') {
        tokens.push({ type: "DMS", value: ch });
        i++;
        continue;
      }

      if (ch === "(") {
        tokens.push({ type: "LPAREN", value: "(" });
        i++;
        continue;
      }
      if (ch === ")") {
        tokens.push({ type: "RPAREN", value: ")" });
        i++;
        continue;
      }
      if (ch === ",") {
        tokens.push({ type: "COMMA", value: "," });
        i++;
        continue;
      }
      if ("+-*/^∠".includes(ch)) {
        tokens.push({ type: "OP", value: ch });
        i++;
        continue;
      }

      throw new Error("Syntax ERROR");
    }
    return tokens;
  }

  function parseExpression(expr, ctx = {}) {
    const tokens = tokenize(expr);
    let pos = 0;

    const angleUnit = ctx.angleUnit || "DEG";
    const complexMode = !!ctx.complexMode;
    const vars = ctx.vars || {};

    function peek() {
      return tokens[pos];
    }
    function consume() {
      return tokens[pos++];
    }
    function expect(type) {
      const t = consume();
      if (!t || t.type !== type) throw new Error("Syntax ERROR");
      return t;
    }

    function canStartImplicitMul(t) {
      if (!t) return false;
      return (
        t.type === "LPAREN" ||
        t.type === "FUNC" ||
        t.type === "CONST" ||
        t.type === "VAR" ||
        t.type === "NUM"
      );
    }

    // AST nodes so calculus functions (∫, d/dx, Σ, Π) can evaluate sub-ASTs with bound variable!
    function parseAddSub() {
      let left = parseMulDiv();
      while (peek() && peek().type === "OP" && (peek().value === "+" || peek().value === "-")) {
        const op = consume().value;
        const right = parseMulDiv();
        left = { kind: "bin", op, left, right };
      }
      return left;
    }

    function parseMulDiv() {
      let left = parseCombinatorics();
      while (peek()) {
        const t = peek();
        if (t.type === "OP" && (t.value === "*" || t.value === "/" || t.value === "∠")) {
          const op = consume().value;
          const right = parseCombinatorics();
          left = { kind: "bin", op, left, right };
        } else if (canStartImplicitMul(t)) {
          const right = parseCombinatorics();
          left = { kind: "bin", op: "*", left, right };
        } else {
          break;
        }
      }
      return left;
    }

    function parseCombinatorics() {
      let left = parseUnary();
      while (peek() && peek().type === "OP" && (peek().value === "C" || peek().value === "P")) {
        const op = consume().value;
        const right = parseUnary();
        left = { kind: "bin", op, left, right };
      }
      return left;
    }

    function parseUnary() {
      if (peek() && peek().type === "OP" && (peek().value === "+" || peek().value === "-")) {
        const op = consume().value;
        const arg = parseUnary();
        return op === "-" ? { kind: "neg", arg } : arg;
      }
      return parsePower();
    }

    function parsePower() {
      let left = parsePostfix();
      if (peek() && peek().type === "OP" && peek().value === "^") {
        consume();
        const right = parseUnary();
        return { kind: "bin", op: "^", left, right };
      }
      return left;
    }

    function parsePostfix() {
      let node = parsePrimary();
      while (peek() && (peek().type === "POSTFIX" || peek().type === "DMS")) {
        const t = consume();
        if (t.type === "POSTFIX") {
          if (t.value === "^2") node = { kind: "bin", op: "^", left: node, right: { kind: "num", value: 2 } };
          else if (t.value === "^3") node = { kind: "bin", op: "^", left: node, right: { kind: "num", value: 3 } };
          else if (t.value === "^-1") node = { kind: "bin", op: "^", left: node, right: { kind: "num", value: -1 } };
          else if (t.value === "!") node = { kind: "fact", arg: node };
          else if (t.value === "%") node = { kind: "pct", arg: node };
        } else if (t.type === "DMS") {
          // Handle DMS sequence: d° m' s"
          if (t.value === "°") {
            let minNode = { kind: "num", value: 0 };
            let secNode = { kind: "num", value: 0 };
            if (peek() && (peek().type === "NUM" || peek().type === "VAR" || peek().type === "LPAREN")) {
              // check if followed by '
              const saved = pos;
              try {
                const candidate = parsePrimary();
                if (peek() && peek().type === "DMS" && peek().value === "'") {
                  consume();
                  minNode = candidate;
                  if (peek() && (peek().type === "NUM" || peek().type === "VAR" || peek().type === "LPAREN")) {
                    const secCand = parsePrimary();
                    if (peek() && peek().type === "DMS" && peek().value === '"') {
                      consume();
                      secNode = secCand;
                    } else if (peek() && peek().type === "DMS" && peek().value === "°") {
                      consume();
                      secNode = secCand;
                    }
                  }
                } else {
                  pos = saved;
                }
              } catch {
                pos = saved;
              }
            }
            node = { kind: "dms", d: node, m: minNode, s: secNode };
          }
        }
      }
      return node;
    }

    function parseArgs() {
      expect("LPAREN");
      const args = [];
      if (peek() && peek().type !== "RPAREN") {
        args.push(parseAddSub());
        while (peek() && peek().type === "COMMA") {
          consume();
          args.push(parseAddSub());
        }
      }
      expect("RPAREN");
      return args;
    }

    function parsePrimary() {
      const t = peek();
      if (!t) throw new Error("Syntax ERROR");

      if (t.type === "NUM") {
        consume();
        return { kind: "num", value: t.value };
      }
      if (t.type === "CONST") {
        consume();
        if (t.value === "i") {
          if (!complexMode) throw new Error("Syntax ERROR");
          return { kind: "complex", re: 0, im: 1 };
        }
        return { kind: "num", value: CONSTANTS[t.value] };
      }
      if (t.type === "VAR") {
        consume();
        return { kind: "var", name: t.value };
      }
      if (t.type === "LPAREN") {
        consume();
        const inner = parseAddSub();
        if (peek() && peek().type === "RPAREN") {
          consume();
        }
        return inner;
      }
      if (t.type === "FUNC") {
        const fn = consume().value;
        if (peek() && peek().type === "LPAREN") {
          const args = parseArgs();
          return { kind: "call", name: fn, args };
        }
        // Allow Casio-style sin30 or √9 without parentheses
        const arg = parseUnary();
        return { kind: "call", name: fn, args: [arg] };
      }

      throw new Error("Syntax ERROR");
    }

    const ast = parseAddSub();
    if (pos < tokens.length) throw new Error("Syntax ERROR");

    function evalReal(node, localVars) {
      const val = evalNode(node, localVars);
      if (val instanceof Complex) {
        if (!val.isReal()) throw new Error("Math ERROR");
        return val.re;
      }
      return val;
    }

    function evalNode(node, localVars) {
      switch (node.kind) {
        case "num":
          return node.value;
        case "complex":
          return new Complex(node.re, node.im);
        case "var": {
          if (Object.prototype.hasOwnProperty.call(localVars, node.name)) {
            return localVars[node.name];
          }
          if (Object.prototype.hasOwnProperty.call(vars, node.name)) {
            return vars[node.name];
          }
          return 0;
        }
        case "neg": {
          const v = evalNode(node.arg, localVars);
          return v instanceof Complex ? v.mul(-1) : -v;
        }
        case "pct": {
          const v = evalReal(node.arg, localVars);
          return v / 100;
        }
        case "fact": {
          const v = evalReal(node.arg, localVars);
          return factorial(v);
        }
        case "dms": {
          const d = evalReal(node.d, localVars);
          const m = evalReal(node.m, localVars);
          const s = evalReal(node.s, localVars);
          const sign = d < 0 ? -1 : 1;
          return sign * (Math.abs(d) + m / 60 + s / 3600);
        }
        case "bin": {
          const l = evalNode(node.left, localVars);
          const r = evalNode(node.right, localVars);
          if (node.op === "∠") {
            if (!complexMode) throw new Error("Syntax ERROR");
            const mag = evalReal(node.left, localVars);
            const ang = toRadians(evalReal(node.right, localVars), angleUnit);
            return new Complex(mag * Math.cos(ang), mag * Math.sin(ang));
          }
          if (l instanceof Complex || r instanceof Complex) {
            const cl = Complex.from(l);
            const cr = Complex.from(r);
            if (node.op === "+") return cl.add(cr);
            if (node.op === "-") return cl.sub(cr);
            if (node.op === "*") return cl.mul(cr);
            if (node.op === "/") return cl.div(cr);
            if (node.op === "^") return cl.pow(cr);
            throw new Error("Math ERROR");
          }
          if (node.op === "+") return l + r;
          if (node.op === "-") return l - r;
          if (node.op === "*") return l * r;
          if (node.op === "/") {
            if (r === 0) throw new Error("Math ERROR");
            return l / r;
          }
          if (node.op === "^") {
            if (l < 0 && !Number.isInteger(r)) {
              if (complexMode) return Complex.from(l).pow(r);
              throw new Error("Math ERROR");
            }
            const res = Math.pow(l, r);
            if (!Number.isFinite(res)) throw new Error("Math ERROR");
            return res;
          }
          if (node.op === "C") return nCr(l, r);
          if (node.op === "P") return nPr(l, r);
          throw new Error("Syntax ERROR");
        }
        case "call": {
          const name = node.name;
          const args = node.args;

          // Calculus & Binder functions: ∫(expr, a, b) or ∫(expr, x, a, b)
          if (name === "∫") {
            let exprAst, varName = "x", a, b;
            if (args.length === 3) {
              exprAst = args[0];
              a = evalReal(args[1], localVars);
              b = evalReal(args[2], localVars);
            } else if (args.length === 4 && args[1].kind === "var") {
              exprAst = args[0];
              varName = args[1].name;
              a = evalReal(args[2], localVars);
              b = evalReal(args[3], localVars);
            } else {
              throw new Error("Syntax ERROR");
            }
            return simpsonIntegral((x) => evalReal(exprAst, { ...localVars, [varName]: x }), a, b);
          }

          if (name === "d/dx") {
            let exprAst, varName = "x", x0;
            if (args.length === 2) {
              exprAst = args[0];
              x0 = evalReal(args[1], localVars);
            } else if (args.length === 3 && args[1].kind === "var") {
              exprAst = args[0];
              varName = args[1].name;
              x0 = evalReal(args[2], localVars);
            } else {
              throw new Error("Syntax ERROR");
            }
            return numericalDerivative((x) => evalReal(exprAst, { ...localVars, [varName]: x }), x0);
          }

          if (name === "Σ" || name === "Π") {
            let exprAst, varName = "x", start, end;
            if (args.length === 3) {
              exprAst = args[0];
              start = Math.round(evalReal(args[1], localVars));
              end = Math.round(evalReal(args[2], localVars));
            } else if (args.length === 4 && args[1].kind === "var") {
              exprAst = args[0];
              varName = args[1].name;
              start = Math.round(evalReal(args[2], localVars));
              end = Math.round(evalReal(args[3], localVars));
            } else {
              throw new Error("Syntax ERROR");
            }
            if (end - start > 100000) throw new Error("Math ERROR");
            let acc = name === "Σ" ? 0 : 1;
            for (let k = start; k <= end; k++) {
              const v = evalReal(exprAst, { ...localVars, [varName]: k });
              acc = name === "Σ" ? acc + v : acc * v;
            }
            return acc;
          }

          // Complex-aware functions
          if (name === "Arg" || name === "arg") {
            const v = Complex.from(evalNode(args[0], localVars));
            return v.arg(angleUnit);
          }
          if (name === "Conjg" || name === "conj") {
            const v = Complex.from(evalNode(args[0], localVars));
            return v.conj();
          }
          if (name === "Abs" || name === "abs") {
            const v = evalNode(args[0], localVars);
            return v instanceof Complex ? v.abs() : Math.abs(v);
          }

          const numArgs = args.map((a) => evalReal(a, localVars));
          const x = numArgs[0];

          switch (name) {
            case "sin":
              return Math.sin(toRadians(x, angleUnit));
            case "cos":
              return Math.cos(toRadians(x, angleUnit));
            case "tan": {
              const rad = toRadians(x, angleUnit);
              if (Math.abs(Math.cos(rad)) < 1e-12) throw new Error("Math ERROR");
              return Math.tan(rad);
            }
            case "sin⁻¹":
            case "asin":
              if (x < -1 || x > 1) throw new Error("Math ERROR");
              return fromRadians(Math.asin(x), angleUnit);
            case "cos⁻¹":
            case "acos":
              if (x < -1 || x > 1) throw new Error("Math ERROR");
              return fromRadians(Math.acos(x), angleUnit);
            case "tan⁻¹":
            case "atan":
              return fromRadians(Math.atan(x), angleUnit);
            case "sinh":
              return Math.sinh(x);
            case "cosh":
              return Math.cosh(x);
            case "tanh":
              return Math.tanh(x);
            case "log":
              if (args.length === 2) {
                const base = x;
                const val = numArgs[1];
                if (base <= 0 || base === 1 || val <= 0) throw new Error("Math ERROR");
                return Math.log(val) / Math.log(base);
              }
              if (x <= 0) throw new Error("Math ERROR");
              return Math.log10(x);
            case "log₂":
              if (x <= 0) throw new Error("Math ERROR");
              return Math.log2(x);
            case "ln":
              if (x <= 0) throw new Error("Math ERROR");
              return Math.log(x);
            case "√":
              if (args.length === 2) {
                // nth root: √(n, x)
                const n = x;
                const val = numArgs[1];
                if (n === 0) throw new Error("Math ERROR");
                if (val < 0) {
                  if (Number.isInteger(n) && Math.abs(n) % 2 === 1) return -Math.pow(-val, 1 / n);
                  throw new Error("Math ERROR");
                }
                return Math.pow(val, 1 / n);
              }
              if (x < 0) {
                if (complexMode) return new Complex(0, Math.sqrt(-x));
                throw new Error("Math ERROR");
              }
              return Math.sqrt(x);
            case "∛":
              return Math.cbrt(x);
            case "GCD":
              return gcdNum(numArgs[0], numArgs[1]);
            case "LCM":
              return lcmNum(numArgs[0], numArgs[1]);
            case "Int":
              return Math.trunc(x);
            case "Intg":
              return Math.floor(x);
            case "Rnd":
              return Math.round(x);
            case "Ran#":
              return Number(Math.random().toFixed(3));
            case "RanInt#": {
              const lo = Math.ceil(numArgs[0]);
              const hi = Math.floor(numArgs[1]);
              if (lo > hi) throw new Error("Math ERROR");
              return Math.floor(Math.random() * (hi - lo + 1)) + lo;
            }
            case "Pol": {
              const r = Math.hypot(numArgs[0], numArgs[1]);
              const th = fromRadians(Math.atan2(numArgs[1], numArgs[0]), angleUnit);
              if (ctx.vars) {
                ctx.vars.x = r;
                ctx.vars.y = th;
              }
              return r;
            }
            case "Rec": {
              const rad = toRadians(numArgs[1], angleUnit);
              const px = numArgs[0] * Math.cos(rad);
              const py = numArgs[0] * Math.sin(rad);
              if (ctx.vars) {
                ctx.vars.x = px;
                ctx.vars.y = py;
              }
              return px;
            }
            default:
              throw new Error("Syntax ERROR");
          }
        }
      }
      throw new Error("Syntax ERROR");
    }

    return {
      evaluate(overrideVars = {}) {
        return evalNode(ast, overrideVars);
      },
      ast,
    };
  }

  function evaluateExpression(expr, ctx = {}) {
    return parseExpression(expr, ctx).evaluate();
  }

  /**
   * Composite Simpson's rule for definite integrals
   */
  function simpsonIntegral(fn, a, b, n = 200) {
    if (a === b) return 0;
    const sign = a > b ? -1 : 1;
    if (a > b) [a, b] = [b, a];
    if (n % 2 !== 0) n++;
    const h = (b - a) / n;
    let sum = fn(a) + fn(b);
    for (let i = 1; i < n; i++) {
      const x = a + i * h;
      sum += (i % 2 === 0 ? 2 : 4) * fn(x);
    }
    const res = sign * (h / 3) * sum;
    if (!Number.isFinite(res)) throw new Error("Math ERROR");
    return res;
  }

  /**
   * Central difference with Richardson extrapolation
   */
  function numericalDerivative(fn, x) {
    const h = Math.max(1e-6, Math.abs(x) * 1e-6);
    const d1 = (fn(x + h) - fn(x - h)) / (2 * h);
    const h2 = h / 2;
    const d2 = (fn(x + h2) - fn(x - h2)) / (2 * h2);
    const res = (4 * d2 - d1) / 3;
    if (!Number.isFinite(res)) throw new Error("Math ERROR");
    return res;
  }

  /**
   * SOLVE (SHIFT + CALC): Find root of f(x) = 0 or lhs = rhs near initialGuess
   */
  function solveEquation(equationStr, varName = "x", initialGuess = 0, ctx = {}) {
    const parts = equationStr.split("=");
    const expr = parts.length === 2 ? `(${parts[0]}) - (${parts[1]})` : equationStr;
    const compiled = parseExpression(expr, ctx);
    const f = (val) => {
      const r = compiled.evaluate({ [varName]: val });
      if (r instanceof Complex) {
        if (!r.isReal()) throw new Error("Math ERROR");
        return r.re;
      }
      return r;
    };

    let x = initialGuess;
    for (let iter = 0; iter < 100; iter++) {
      const fx = f(x);
      if (Math.abs(fx) < 1e-11) {
        return { root: cleanZero(x), residual: cleanZero(fx) };
      }
      const h = Math.max(1e-7, Math.abs(x) * 1e-7);
      const dfx = (f(x + h) - f(x - h)) / (2 * h);
      if (!Number.isFinite(dfx) || Math.abs(dfx) < 1e-14) {
        x += 0.137; // nudge away from flat spot
        continue;
      }
      let next = x - fx / dfx;
      // Damped step if huge jump
      if (Math.abs(next - x) > 1000) {
        next = x + Math.sign(next - x) * 10;
      }
      if (Math.abs(next - x) < 1e-12 && Math.abs(f(next)) < 1e-9) {
        return { root: cleanZero(next), residual: cleanZero(f(next)) };
      }
      x = next;
    }
    const finalFx = f(x);
    if (Math.abs(finalFx) < 1e-6) {
      return { root: cleanZero(x), residual: cleanZero(finalFx) };
    }
    throw new Error("Can't Solve");
  }

  function extractVariables(expr) {
    const tokens = tokenize(expr);
    const found = [];
    for (const t of tokens) {
      if (t.type === "VAR" && t.value !== "Ans" && t.value !== "PreAns") {
        if (!found.includes(t.value)) found.push(t.value);
      }
    }
    return found;
  }

  const Engine = {
    Complex,
    gcdNum,
    lcmNum,
    toRadians,
    fromRadians,
    cleanZero,
    formatNumber,
    toFraction,
    toExactSymbolic,
    toMixedFraction,
    formatComplex,
    primeFactorize,
    toDMS,
    factorial,
    nCr,
    nPr,
    tokenize,
    parseExpression,
    evaluateExpression,
    simpsonIntegral,
    numericalDerivative,
    solveEquation,
    extractVariables,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Engine;
  } else {
    global.CasioEngine = Engine;
  }
})(typeof window !== "undefined" ? window : globalThis);
