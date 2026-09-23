(() => {
  // Shared navigation
  const menuButton = document.querySelector(".menu-toggle");
  const primaryNav = document.querySelector("#primary-nav");

  if (menuButton && primaryNav) {
    menuButton.addEventListener("click", () => {
      const open = menuButton.getAttribute("aria-expanded") === "true";
      menuButton.setAttribute("aria-expanded", String(!open));
      primaryNav.classList.toggle("is-open", !open);
    });

    primaryNav.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        menuButton.setAttribute("aria-expanded", "false");
        primaryNav.classList.remove("is-open");
      }
    });
  }

  const currentFile = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".primary-nav a").forEach((link) => {
    const target = link.getAttribute("href");
    if (target === currentFile) link.setAttribute("aria-current", "page");
  });

  // Show setup notes only while the PDFs have not yet been uploaded.
  async function checkPdf(fileName, noteId) {
    const note = document.querySelector(noteId);
    if (!note) return;
    try {
      const response = await fetch(fileName, { method: "HEAD", cache: "no-store" });
      note.hidden = response.ok;
    } catch (_) {
      note.hidden = false;
    }
  }

  checkPdf("resume.pdf", "#resume-missing");
  checkPdf("artifact.pdf", "#artifact-missing");

  const year = document.querySelector("#year");
  if (year) year.textContent = new Date().getFullYear();

  const canvas = document.querySelector("#ambient-bg");
  const motionButton = document.querySelector("#motion-toggle");
  if (!canvas || !motionButton) return;

  // 1) Ask the browser for a WebGL drawing context.
  // If WebGL is unavailable, the CSS paper background remains as the fallback.
  let gl = null;
  try {
    gl =
      canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        powerPreference: "low-power"
      }) || canvas.getContext("experimental-webgl");
  } catch (_) {}

  if (!gl) {
    canvas.style.display = "none";
    return;
  }

  // 2) A vertex shader draws one oversized triangle that covers the screen.
  // The interesting work happens in the fragment shader below.
  const vertexShaderSource = `
    attribute vec2 position;

    void main() {
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `;

  // 3) The fragment shader calculates the color of every pixel.
  //
  // It follows the same overall technique as the reference:
  // - generate smooth procedural noise
  // - layer it into fractal Brownian motion (fbm)
  // - use one noisy field to distort another (domain warping)
  // - bend that field toward the pointer
  // - mix a little green and red into the site's base paper color
  const fragmentShaderSource = `
    precision highp float;

    uniform vec2 resolution;
    uniform vec2 pointer;
    uniform float elapsed;
    uniform vec3 paper;
    uniform vec3 olive;
    uniform vec3 accentRed;

    float randomValue(vec2 cell) {
      cell = fract(cell * vec2(117.17, 341.91));
      cell += dot(cell, cell + 31.73);
      return fract(cell.x * cell.y);
    }

    float smoothNoise(vec2 point) {
      vec2 whole = floor(point);
      vec2 fraction = fract(point);

      vec2 curve = fraction * fraction * (3.0 - 2.0 * fraction);

      float lowerLeft  = randomValue(whole);
      float lowerRight = randomValue(whole + vec2(1.0, 0.0));
      float upperLeft  = randomValue(whole + vec2(0.0, 1.0));
      float upperRight = randomValue(whole + vec2(1.0, 1.0));

      float lower = mix(lowerLeft, lowerRight, curve.x);
      float upper = mix(upperLeft, upperRight, curve.x);

      return mix(lower, upper, curve.y);
    }

    float layeredNoise(vec2 point) {
      float total = 0.0;
      float strength = 0.5;

      // Rotating/scaling between octaves prevents obvious square repetition.
      mat2 transform = mat2(1.55, 1.18, -1.18, 1.55);

      for (int octave = 0; octave < 5; octave++) {
        total += smoothNoise(point) * strength;
        point = transform * point;
        strength *= 0.5;
      }

      return total;
    }

    void main() {
      // Aspect-correct coordinates centered around (0, 0).
      vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

      // Convert the mouse to those same centered coordinates.
      vec2 mouse = (pointer - 0.5 * resolution) / resolution.y;

      // Slow motion is important: this should feel like drifting paper,
      // not an animated screensaver.
      float time = elapsed * 0.04;

      vec2 samplePoint = uv * 1.05;

      // 4) Mouse interaction.
      // Nearby parts of the field are gently pulled toward the cursor.
      vec2 towardMouse = mouse - uv;
      float mouseDistance = length(towardMouse);

      samplePoint +=
        normalize(towardMouse + vec2(0.0001))
        * 0.21
        * exp(-mouseDistance * 2.15);

      // 5) First warped field.
      // Two different noise samples become a 2D distortion vector.
      vec2 firstWarp = vec2(
        layeredNoise(samplePoint + time),
        layeredNoise(samplePoint + vec2(5.1, 1.4) - time)
      );

      // 6) Second warped field.
      // Feeding the first field back into another noise lookup creates the
      // flowing, marbled shapes rather than ordinary cloudy noise.
      vec2 secondWarp = vec2(
        layeredNoise(
          samplePoint
          + 4.7 * firstWarp
          + vec2(1.8, 9.1)
          + 0.14 * time
        ),
        layeredNoise(
          samplePoint
          + 4.7 * firstWarp
          + vec2(8.2, 2.9)
          - 0.12 * time
        )
      );

      float mainFlow = layeredNoise(samplePoint + 4.8 * secondWarp);

      // 7) Turn the noise into a restrained color wash.
      // Most of every pixel remains the base paper color.
      float oliveAmount =
        smoothstep(0.25, 0.76, mainFlow) * 0.19;

      float redAmount =
        smoothstep(0.28, 0.74, secondWarp.x) * 0.12;

      vec3 finalColor = paper;
      finalColor = mix(finalColor, olive, oliveAmount);
      finalColor = mix(finalColor, accentRed, redAmount);

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || "Shader compilation failed.");
    }

    return shader;
  }

  let program = null;

  try {
    program = gl.createProgram();
    gl.attachShader(
      program,
      compileShader(gl.VERTEX_SHADER, vertexShaderSource)
    );
    gl.attachShader(
      program,
      compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource)
    );
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Shader linking failed.");
    }

    gl.useProgram(program);
  } catch (_) {
    canvas.style.display = "none";
    return;
  }

  // One oversized triangle covers the full viewport.
  const triangleBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, triangleBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );

  const positionLocation = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {
    resolution: gl.getUniformLocation(program, "resolution"),
    pointer: gl.getUniformLocation(program, "pointer"),
    elapsed: gl.getUniformLocation(program, "elapsed"),
    paper: gl.getUniformLocation(program, "paper"),
    olive: gl.getUniformLocation(program, "olive"),
    accentRed: gl.getUniformLocation(program, "accentRed")
  };

  // Read the exact site palette from CSS so light/dark mode automatically
  // changes the WebGL background too.
  function hexToRgb01(hex, fallback) {
    const cleaned = hex.trim().replace("#", "");

    if (!/^[0-9a-f]{6}$/i.test(cleaned)) return fallback;

    return [
      parseInt(cleaned.slice(0, 2), 16) / 255,
      parseInt(cleaned.slice(2, 4), 16) / 255,
      parseInt(cleaned.slice(4, 6), 16) / 255
    ];
  }

  let palette = {};

  function refreshPalette() {
    const css = getComputedStyle(document.documentElement);

    palette = {
      paper: hexToRgb01(
        css.getPropertyValue("--paper"),
        [0.94, 0.945, 0.92]
      ),
      olive: hexToRgb01(
        css.getPropertyValue("--flow-primary"),
        [0.365, 0.471, 0.588]
      ),
      red: hexToRgb01(
        css.getPropertyValue("--flow-accent"),
        [0.651, 0.416, 0.333]
      )
    };
  }

  refreshPalette();

  // Canvas sizing is capped at 1.5x device pixel ratio to avoid doing
  // unnecessary GPU work on very high-density displays.
  let pixelRatio = 1;

  const mouse = [0, 0];
  const mouseTarget = [0, 0];

  function resizeCanvas() {
    pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);

    const width = Math.floor(window.innerWidth * pixelRatio);
    const height = Math.floor(window.innerHeight * pixelRatio);

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }

    if (mouseTarget[0] === 0 && mouseTarget[1] === 0) {
      mouse[0] = width * 0.5;
      mouse[1] = height * 0.5;
      mouseTarget[0] = mouse[0];
      mouseTarget[1] = mouse[1];
    }
  }

  function setPointer(clientX, clientY) {
    mouseTarget[0] = clientX * pixelRatio;

    // WebGL's Y axis starts at the bottom, while browser pointer coordinates
    // start at the top, so Y must be flipped.
    mouseTarget[1] =
      (window.innerHeight - clientY) * pixelRatio;
  }

  window.addEventListener("resize", resizeCanvas);

  window.addEventListener(
    "pointermove",
    (event) => setPointer(event.clientX, event.clientY),
    { passive: true }
  );

  window.addEventListener(
    "touchmove",
    (event) => {
      const touch = event.touches && event.touches[0];
      if (touch) setPointer(touch.clientX, touch.clientY);
    },
    { passive: true }
  );

  resizeCanvas();

  let simulationTime = 0;
  let previousFrameTime = performance.now();
  let animationFrameId = 0;
  let isRunning = true;

  function paintFrame() {
    gl.uniform2f(
      uniforms.resolution,
      canvas.width,
      canvas.height
    );

    gl.uniform2f(
      uniforms.pointer,
      mouse[0],
      mouse[1]
    );

    gl.uniform1f(
      uniforms.elapsed,
      simulationTime
    );

    gl.uniform3fv(
      uniforms.paper,
      palette.paper
    );

    gl.uniform3fv(
      uniforms.olive,
      palette.olive
    );

    gl.uniform3fv(
      uniforms.accentRed,
      palette.red
    );

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function animate(now) {
    const seconds =
      Math.min((now - previousFrameTime) / 1000, 0.05);

    previousFrameTime = now;
    simulationTime += seconds;

    // Smooth mouse tracking prevents the field from snapping instantly.
    mouse[0] += (mouseTarget[0] - mouse[0]) * 0.05;
    mouse[1] += (mouseTarget[1] - mouse[1]) * 0.05;

    paintFrame();

    if (isRunning && !document.hidden) {
      animationFrameId = requestAnimationFrame(animate);
    } else {
      animationFrameId = 0;
    }
  }

  function beginAnimation() {
    if (animationFrameId || !isRunning || document.hidden) return;

    previousFrameTime = performance.now();
    animationFrameId = requestAnimationFrame(animate);
  }

  function setMotion(enabled) {
    isRunning = enabled;

    motionButton.setAttribute(
      "aria-pressed",
      enabled ? "false" : "true"
    );

    motionButton.textContent =
      enabled ? "pause drift" : "resume drift";

    motionButton.title =
      enabled
        ? "Pause the background motion"
        : "Resume the background motion";

    try {
      localStorage.setItem(
        "background-motion",
        enabled ? "on" : "off"
      );
    } catch (_) {}

    if (enabled) beginAnimation();
  }

  motionButton.hidden = false;
  motionButton.addEventListener(
    "click",
    () => setMotion(!isRunning)
  );

  // Respect a saved choice first; otherwise respect reduced-motion.
  let savedMotion = null;

  try {
    savedMotion =
      localStorage.getItem("background-motion");
  } catch (_) {}

  const reducedMotion =
    window.matchMedia("(prefers-reduced-motion: reduce)");

  const shouldStart =
    savedMotion !== null
      ? savedMotion === "on"
      : !reducedMotion.matches;

  // Re-read the CSS colors when the operating system theme changes.
  const darkMode =
    window.matchMedia("(prefers-color-scheme: dark)");

  function handleThemeChange() {
    refreshPalette();
    paintFrame();
  }

  if (darkMode.addEventListener) {
    darkMode.addEventListener("change", handleThemeChange);
  } else if (darkMode.addListener) {
    darkMode.addListener(handleThemeChange);
  }

  document.addEventListener(
    "visibilitychange",
    () => {
      if (!document.hidden) beginAnimation();
    }
  );

  setMotion(shouldStart);

  // Always draw once, even when motion is disabled.
  paintFrame();
})();