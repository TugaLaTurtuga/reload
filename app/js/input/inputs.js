inp = new InputManager();

// Minimal safe defaults
const DEFAULT_INPUTS = {
  opts: { logKeyPress: false },
  keyboard: {
    whenPressed: {},
    whenUnpressed: {},
    whenDown: {},
    whenUpOrDown: {},
    whenUp: {},
    whenUnpressed: {},
  },
  mouse: {
    whenPressed: {},
    whenUnpressed: {},
    whenDown: {},
    whenUpOrDown: {},
    whenUp: {},
  },
  gamepad: {
    whenPressed: {},
    whenUnpressed: {},
    whenDown: {},
    whenUpOrDown: {},
    whenUp: {},
    deadzone: 0.1,
  },
};

// ---------------- Safe JSON load ----------------
function safeReadJSON(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return deepMerge(fallback, parsed);
  } catch (err) {
    console.warn(
      `safeReadJSON: using defaults (failed to read/parse ${filePath}): ${err.message}`,
    );
    return JSON.parse(JSON.stringify(fallback));
  }
}

function deepMerge(target, src) {
  if (Array.isArray(src)) return src.slice();
  if (typeof src !== "object" || src === null) return src;
  const out = Array.isArray(target) ? target.slice() : { ...(target || {}) };
  for (const key of Object.keys(src)) {
    if (
      typeof src[key] === "object" &&
      src[key] !== null &&
      !Array.isArray(src[key])
    ) {
      out[key] = deepMerge(target && target[key], src[key]);
    } else out[key] = src[key];
  }
  return out;
}

const inputs = safeReadJSON(inputsFilePath, DEFAULT_INPUTS);

// ---------------- Gamepad key normalizer ----------------
function normalizeGamepadKey(k) {
  if (!k) return k;
  const lower = k.toLowerCase();
  if (lower === "rightaxe" || lower === "raxe") return "axes[1]";
  if (lower === "leftaxe" || lower === "laxe") return "axes[0]";
  if (lower === "upaxe" || lower === "uaxe") return "axes[2]";
  if (lower === "downaxe" || lower === "daxe") return "axes[3]";
  return k;
}

// ---------------- Call-string parser (small, safe) ----------------
function parseCallString(callStr) {
  if (typeof callStr !== "string") return { fnPath: null, args: [] };
  const m = callStr.trim().match(/^([A-Za-z_$][\w$\.]*)\s*\(([\s\S]*)\)\s*$/);
  if (!m)
    return { fnPath: null, args: [{ type: "lookup", path: callStr.trim() }] };
  const fnPath = m[1];
  const argsRaw = m[2].trim();

  const args = [];
  let cur = "",
    inQuote = false,
    quoteChar = null;
  for (let i = 0; i < argsRaw.length; i++) {
    const ch = argsRaw[i];
    if (inQuote) {
      cur += ch;
      if (ch === quoteChar && argsRaw[i - 1] !== "\\") {
        inQuote = false;
        quoteChar = null;
      }
    } else {
      if (ch === "'" || ch === '"') {
        inQuote = true;
        quoteChar = ch;
        cur += ch;
      } else if (ch === ",") {
        if (cur.trim().length) args.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
  }
  if (cur.trim().length) args.push(cur.trim());
  return { fnPath, args: args.map(parseSingleArg) };
}

function parseSingleArg(token) {
  token = token.trim();
  if (!token) return { type: "literal", value: undefined };
  if (/^value\.(x|y)$/.test(token)) return { type: "placeholder", name: token };
  if (/^(true|false|null)$/.test(token))
    return {
      type: "literal",
      value: token === "true" ? true : token === "false" ? false : null,
    };
  if (/^-?\d+(?:\.\d+)?$/.test(token))
    return { type: "literal", value: parseFloat(token) };
  if (
    (token[0] === "'" && token[token.length - 1] === "'") ||
    (token[0] === '"' && token[token.length - 1] === '"')
  ) {
    const jsonStr =
      token[0] === "'"
        ? '"' +
          token.slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"') +
          '"'
        : token;
    try {
      return { type: "literal", value: JSON.parse(jsonStr) };
    } catch (err) {
      return { type: "literal", value: token.slice(1, -1) };
    }
  }
  if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(token))
    return { type: "lookup", path: token };
  return { type: "literal", value: token };
}

// ---------------- Executor (safe) ----------------
const handlers = Object.create(null); // fill this with actual callable handlers
const globals = (() => (typeof globalThis !== "undefined" ? globalThis : {}))();

function resolveDottedPath(pathStr, base) {
  if (!pathStr) return undefined;
  const parts = pathStr.split(".");
  let cur = base || globals;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function resolveFunction(fnPath) {
  if (!fnPath) return null;
  if (handlers[fnPath]) return handlers[fnPath];
  const fromHandlersDotted = resolveDottedPath(fnPath, handlers);
  if (typeof fromHandlersDotted === "function") return fromHandlersDotted;
  const fromGlobals = resolveDottedPath(fnPath, globals);
  if (typeof fromGlobals === "function") return fromGlobals;
  if (
    typeof globalThis !== "undefined" &&
    typeof globalThis[fnPath] === "function"
  )
    return globalThis[fnPath];
  return null;
}

function executeCall(descriptor, ctx = {}) {
  if (!descriptor) return;
  if (!descriptor.fnPath) {
    if (
      descriptor.args &&
      descriptor.args.length === 1 &&
      descriptor.args[0].type === "lookup"
    )
      return resolveDottedPath(descriptor.args[0].path, ctx.globals || globals);
    return;
  }
  const fn = resolveFunction(descriptor.fnPath);
  if (!fn) {
    console.warn(`executeCall: function not found: ${descriptor.fnPath}`);
    return;
  }
  const resolvedArgs = descriptor.args.map((arg) => {
    if (arg.type === "literal") return arg.value;
    if (arg.type === "placeholder") {
      if (ctx.value && arg.name && arg.name.startsWith("value."))
        return ctx.value[arg.name.split(".")[1]];
      return undefined;
    }
    if (arg.type === "lookup")
      return resolveDottedPath(arg.path, ctx.globals || globals);
    return undefined;
  });
  try {
    return fn.apply(null, resolvedArgs);
  } catch (err) {
    console.error(`executeCall: error calling ${descriptor.fnPath}:`, err);
  }
}

// ---------------- Preprocess mappings (single helper) ----------------
const MODES = [
  "whenPressed",
  "whenUnpressed",
  "whenDown",
  "whenUpOrDown",
  "whenUp",
];

function preprocessInputType(section = {}, isGamepad = false) {
  const out = { modes: {}, allKeys: new Set(), rawToNorm: {} };
  for (const mode of MODES) {
    out.modes[mode] = {};
    const bucket = section[mode] || {};
    for (const rawKey of Object.keys(bucket)) {
      const key = isGamepad ? normalizeGamepadKey(rawKey) : rawKey;
      out.modes[mode][key] = parseCallString(bucket[rawKey]);
      out.allKeys.add(key);
      out.rawToNorm[rawKey] = key;
    }
  }
  out.allKeys = Array.from(out.allKeys);
  return out;
}

const normalizedInputs = {
  opts: inputs.opts || {},
  keyboard: preprocessInputType(inputs.keyboard, false),
  mouse: preprocessInputType(inputs.mouse, false),
  gamepad: (() => {
    const p = preprocessInputType(inputs.gamepad, true);
    p.deadzone =
      typeof inputs.gamepad.deadzone === "number"
        ? inputs.gamepad.deadzone
        : 0.1;
    return p;
  })(),
};

// ---------------- Try removing default events (best-effort) ----------------
try {
  if (
    typeof inp !== "undefined" &&
    typeof inp.removeDefaultEvent === "function"
  ) {
    // keyboard & mouse: remove raw keys
    for (const mode of MODES) {
      for (const key of Object.keys(inputs.keyboard[mode] || {}))
        inp.removeDefaultEvent(key);
      for (const key of Object.keys(inputs.mouse[mode] || {}))
        inp.removeDefaultEvent(key);
      // gamepad: try both raw and normalized
      for (const key of Object.keys(inputs.gamepad[mode] || {})) {
        inp.removeDefaultEvent(key);
        const norm = normalizeGamepadKey(key);
        if (norm !== key) inp.removeDefaultEvent(norm);
      }
    }
  }
} catch (err) {
  console.warn(
    "removeDefaultEvent not available or failed:",
    err && err.message,
  );
}

// ---------------- Generic active-state resolver ----------------
function getActiveForKey(type, key, axes, deadzone) {
  if (type === "gamepad") {
    if (key && key.startsWith("axes[")) {
      const idx = parseInt(key.slice(5, -1), 10);
      const val = axes && axes[idx] ? axes[idx] : { x: 0, y: 0 };
      if (Math.abs(val.x) < deadzone) val.x = 0;
      if (Math.abs(val.y) < deadzone) val.y = 0;
      return { active: val.x !== 0 || val.y !== 0, value: val };
    }
    return { active: Boolean(inp.Get(`g-${key}`)), value: undefined };
  }
  if (type === "mouse")
    return { active: Boolean(inp.Get(`m-${key}`)), value: undefined };
  // keyboard
  return { active: Boolean(inp.Get(key)), value: undefined };
}

// ---------------- Main per-frame processor (single, small loop) ----------------
const keyState = new Map();

function processType(typeName, typeDesc) {
  const axes =
    typeName === "gamepad" && typeof inp.GetGamepadAxes === "function"
      ? inp.GetGamepadAxes()
      : [];
  const deadzone = typeDesc.deadzone || 0.1;
  for (const key of typeDesc.allKeys) {
    const prev = Boolean(keyState.get(`${typeName}:${key}`));
    const { active, value } = getActiveForKey(typeName, key, axes, deadzone);

    const D = typeDesc.modes; // descriptors per mode
    if (D.whenPressed && active && !prev)
      executeCall(D.whenPressed[key], { value, globals });
    if (D.whenUnpressed && !active && prev)
      executeCall(D.whenUnpressed[key], { value, globals });
    if (D.whenUp && !active && prev)
      executeCall(D.whenUp[key], { value, globals });
    if (D.whenDown && active) executeCall(D.whenDown[key], { value, globals });
    if (D.whenUpOrDown && active !== prev)
      executeCall(D.whenUpOrDown[key], { value, globals });

    keyState.set(`${typeName}:${key}`, !!active);
  }
}

function updateInputs() {
  try {
    processType("keyboard", normalizedInputs.keyboard);
    processType("mouse", normalizedInputs.mouse);
    processType("gamepad", normalizedInputs.gamepad);
  } catch (err) {
    console.error("updateInputs error:", err);
  }
  if (typeof requestAnimationFrame === "function")
    requestAnimationFrame(updateInputs);
  else setTimeout(updateInputs, 1000 / 60);
}

// Start the loop
updateInputs();
