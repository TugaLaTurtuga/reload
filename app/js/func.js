async function extractAndSaveFunctions() {
  try {
    if (typeof document === "undefined") {
      console.error(
        "This function expects to run in a DOM environment (browser / electron).",
      );
      return;
    }
    const functions = {};
    const scriptElements = document.querySelectorAll("script");

    // iterate with for..of so we can await fetches for external scripts
    for (const script of scriptElements) {
      let code = "";

      if (script.src) {
        // Try to fetch external script text (may fail due to CORS)
        try {
          const res = await fetch(script.src, { cache: "no-store" });
          if (res.ok) {
            code = await res.text();
          } else {
            console.warn(
              `Failed to fetch ${script.src} (status ${res.status}). Skipping.`,
            );
            code = ""; // skip when fetch fails
          }
        } catch (fetchErr) {
          // Could be CORS or network error — skip but log
          console.warn(`Could not fetch ${script.src}: ${fetchErr.message}`);
          code = "";
        }
      } else {
        // Inline script content
        code = script.textContent || "";
      }

      if (!code) continue; // nothing to scan

      const topLevelFuncs = extractTopLevelFunctions(code);
      Object.assign(functions, topLevelFuncs);

      let m;

      // helper to normalize param string
      const normalizeParams = (raw) => {
        if (!raw) return "";
        return raw
          .split(",")
          .map((p) => p.trim().split("=")[0].trim()) // remove default values
          .filter(Boolean)
          .join(", ");
      };

      // function declarations
      while ((m = functionDeclRe.exec(code)) !== null) {
        const name = m[1];
        const params = normalizeParams(m[2]);
        functions[name] = params;
      }

      // named function expressions: const foo = function(...) { }
      while ((m = namedFuncExprRe.exec(code)) !== null) {
        const name = m[1];
        const params = normalizeParams(m[2]);
        functions[name] = params;
      }

      // arrow functions: const foo = (a,b) => {}  OR const foo = x => {}
      while ((m = arrowFuncRe.exec(code)) !== null) {
        const name = m[1];
        // params might be in group 2 (parenthesized) or group 3 (single identifier)
        const rawParams = m[2] !== undefined ? m[2] : m[3] || "";
        const params = normalizeParams(rawParams);
        functions[name] = params;
      }

      // object properties: foo: function(...) { }
      while ((m = methodPropRe.exec(code)) !== null) {
        const name = m[1];
        const params = normalizeParams(m[2]);
        functions[name] = params;
      }
    }

    if (typeof fs !== "undefined" && typeof funcsSaveFilePath !== "undefined") {
      fs.writeFileSync(
        funcsSaveFilePath,
        JSON.stringify(functions, null, 4),
        "utf8",
      );
    } else {
      console.warn(
        "fs or funcsSaveFilePath is not available; skipping file write.",
      );
    }
    return functions;
  } catch (error) {
    console.error("Error extracting functions:", error);
    return {};
  }
}

function extractTopLevelFunctions(code) {
  const functions = {};

  // Regex to match potential function starts (all types)
  const funcRegex =
    /(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)\s*\(([^)]*)\)|(?:var|let|const)\s+([a-zA-Z_$][\w$]*)\s*=\s*function(?:\s+[a-zA-Z_$][\w$]*)?\s*\(([^)]*)\)|(?:var|let|const)\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s+)?(?:\(([^)]*)\)|([a-zA-Z_$][\w$]*))\s*=>|([a-zA-Z_$][\w$]*)\s*:\s*(?:async\s+)?function\s*\(([^)]*)\)/g;

  let braceDepth = 0;
  let lastIndex = 0;

  const normalizeParams = (raw) => {
    if (!raw) return "";
    return raw
      .split(",")
      .map((p) => p.trim().split("=")[0].trim())
      .filter(Boolean)
      .join(", ");
  };

  while (true) {
    const match = funcRegex.exec(code);
    if (!match) break;

    // Count braces between lastIndex and current match
    for (let i = lastIndex; i < match.index; i++) {
      if (code[i] === "{") braceDepth++;
      else if (code[i] === "}") braceDepth--;
    }

    lastIndex = match.index;

    if (braceDepth === 0) {
      // top-level only
      let name = match[1] || match[3] || match[5] || match[7];
      let rawParams = match[2] || match[4] || match[6] || match[7] || "";
      functions[name] = normalizeParams(rawParams);
    }
  }

  return functions;
}

// Run it
extractAndSaveFunctions();
