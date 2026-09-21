(() => {
  const year = document.querySelector("#year");
  if (year) year.textContent = new Date().getFullYear();

  const canvas = document.querySelector("#ambient-bg");
  const toggle = document.querySelector("#motion-toggle");
  if (!canvas || !toggle) return;

  let gl;
  try {
    gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      powerPreference: "low-power"
    });
  } catch (_) {}

  if (!gl) {
    canvas.hidden = true;
    return;
  }

  const vertexSource = `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fragmentSource = `
    precision highp float;

    uniform vec2 u_resolution;
    uniform vec2 u_pointer;
    uniform vec2 u_pointer_velocity;
    uniform float u_time;
    uniform vec3 u_base;
    uniform vec3 u_green;
    uniform vec3 u_red;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 345.45));
      p += dot(p, p + 34.345);
      return fract(p.x * p.y);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);

      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));

      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }

    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;
      mat2 rotation = mat2(1.6, 1.2, -1.2, 1.6);

      for (int i = 0; i < 5; i++) {
        value += amplitude * noise(p);
        p = rotation * p;
        amplitude *= 0.5;
      }

      return value;
    }

    void main() {
      vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
      vec2 pointer = (u_pointer - 0.5 * u_resolution) / u_resolution.y;
      vec2 velocity = u_pointer_velocity / u_resolution.y;

      float t = u_time * 0.038;

      vec2 toPointer = pointer - uv;
      float pointerDistance = length(toPointer);
      vec2 pointerDirection = normalize(toPointer + vec2(0.0001));

      /*
        The cursor behaves like a soft current:
        - nearby pixels are pulled toward it
        - movement adds a directional wake
        - the effect fades smoothly with distance
      */
      float attraction = exp(-pointerDistance * 2.5);
      float wake = exp(-pointerDistance * 1.35);

      vec2 p = uv * 1.2;
      p += pointerDirection * attraction * 0.24;
      p -= velocity * wake * 1.8;

      /*
        Two layers of domain warping create the broad, cloudy paper-gradient
        look. These are intentionally low-frequency so the result reads as a
        gradient rather than obvious procedural noise.
      */
      vec2 q = vec2(
        fbm(p + vec2(t, -t * 0.7)),
        fbm(p + vec2(5.2, 1.3) + vec2(-t * 0.8, t * 0.55))
      );

      vec2 r = vec2(
        fbm(p + 3.7 * q + vec2(1.7, 9.2) + vec2(t * 0.3, -t * 0.2)),
        fbm(p + 3.7 * q + vec2(8.3, 2.8) + vec2(-t * 0.24, t * 0.28))
      );

      float field = fbm(p + 4.0 * r);
      float secondary = fbm(p * 0.8 + 2.2 * q - 1.5 * r + vec2(2.4, -3.1));

      /*
        Mouse position also changes the overall gradient balance:
        moving horizontally shifts olive/red balance; moving vertically
        changes where the stronger band sits.
      */
      vec2 pointer01 = u_pointer / u_resolution;
      float horizontalBias = pointer01.x - 0.5;
      float verticalBias = pointer01.y - 0.5;

      float broadGreen = smoothstep(
        0.28 - horizontalBias * 0.08,
        0.82 - horizontalBias * 0.06,
        field
      );

      float broadRed = smoothstep(
        0.36 + horizontalBias * 0.05,
        0.82 + horizontalBias * 0.08,
        secondary + verticalBias * 0.10
      );

      /*
        Local color bloom follows the mouse so the gradient itself visibly
        shifts as the cursor moves, not just the distortion field.
      */
      float cursorBloom = exp(-pointerDistance * pointerDistance * 3.4);
      float cursorGreen = cursorBloom * (0.55 + 0.45 * (1.0 - pointer01.x));
      float cursorRed = cursorBloom * (0.30 + 0.70 * pointer01.x);

      float greenMix = broadGreen * 0.115 + cursorGreen * 0.045;
      float redMix = broadRed * 0.065 + cursorRed * 0.032;

      vec3 color = u_base;
      color = mix(color, u_green, clamp(greenMix, 0.0, 0.18));
      color = mix(color, u_red, clamp(redMix, 0.0, 0.11));

      /*
        A gentle center-weighting keeps the page readable and gives the field
        the soft paper-wash quality of the reference.
      */
      float vignette = smoothstep(1.15, 0.1, length(uv));
      color = mix(u_base, color, 0.80 + 0.20 * vignette);

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || "Shader compile failed");
    }

    return shader;
  }

  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Shader link failed");
    }
  } catch (_) {
    canvas.hidden = true;
    return;
  }

  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );

  const position = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {
    resolution: gl.getUniformLocation(program, "u_resolution"),
    pointer: gl.getUniformLocation(program, "u_pointer"),
    pointerVelocity: gl.getUniformLocation(program, "u_pointer_velocity"),
    time: gl.getUniformLocation(program, "u_time"),
    base: gl.getUniformLocation(program, "u_base"),
    green: gl.getUniformLocation(program, "u_green"),
    red: gl.getUniformLocation(program, "u_red")
  };

  function cssColor(name, fallback) {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();

    const hex = value.startsWith("#") ? value.slice(1) : "";
    if (!/^[0-9a-f]{6}$/i.test(hex)) return fallback;

    return [
      parseInt(hex.slice(0, 2), 16) / 255,
      parseInt(hex.slice(2, 4), 16) / 255,
      parseInt(hex.slice(4, 6), 16) / 255
    ];
  }

  let palette = {};

  function readPalette() {
    palette = {
      base: cssColor("--paper", [0.941, 0.945, 0.922]),
      green: cssColor("--green", [0.365, 0.427, 0.231]),
      red: cssColor("--red", [0.643, 0.227, 0.227])
    };
  }

  readPalette();

  let dpr = 1;
  let pointer = [0, 0];
  let pointerTarget = [0, 0];
  let previousPointer = [0, 0];
  let pointerVelocity = [0, 0];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const width = Math.max(1, Math.floor(window.innerWidth * dpr));
    const height = Math.max(1, Math.floor(window.innerHeight * dpr));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }

    if (pointerTarget[0] === 0 && pointerTarget[1] === 0) {
      pointer = [width / 2, height / 2];
      pointerTarget = [width / 2, height / 2];
      previousPointer = [width / 2, height / 2];
    }
  }

  function trackPointer(clientX, clientY) {
    pointerTarget = [
      clientX * dpr,
      (window.innerHeight - clientY) * dpr
    ];
  }

  window.addEventListener("resize", resize);

  window.addEventListener(
    "pointermove",
    (event) => {
      trackPointer(event.clientX, event.clientY);
    },
    { passive: true }
  );

  window.addEventListener(
    "touchmove",
    (event) => {
      const touch = event.touches && event.touches[0];
      if (touch) trackPointer(touch.clientX, touch.clientY);
    },
    { passive: true }
  );

  resize();

  let running = true;
  let animationFrame = 0;
  let simulatedTime = 0;
  let previousTime = performance.now();

  function draw() {
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform2f(uniforms.pointer, pointer[0], pointer[1]);
    gl.uniform2f(uniforms.pointerVelocity, pointerVelocity[0], pointerVelocity[1]);
    gl.uniform1f(uniforms.time, simulatedTime);
    gl.uniform3fv(uniforms.base, palette.base);
    gl.uniform3fv(uniforms.green, palette.green);
    gl.uniform3fv(uniforms.red, palette.red);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(now) {
    const delta = Math.min((now - previousTime) / 1000, 0.05);
    previousTime = now;

    simulatedTime += delta;

    previousPointer[0] = pointer[0];
    previousPointer[1] = pointer[1];

    pointer[0] += (pointerTarget[0] - pointer[0]) * 0.075;
    pointer[1] += (pointerTarget[1] - pointer[1]) * 0.075;

    const rawVelocityX = pointer[0] - previousPointer[0];
    const rawVelocityY = pointer[1] - previousPointer[1];

    pointerVelocity[0] += (rawVelocityX - pointerVelocity[0]) * 0.18;
    pointerVelocity[1] += (rawVelocityY - pointerVelocity[1]) * 0.18;

    pointerVelocity[0] *= 0.92;
    pointerVelocity[1] *= 0.92;

    draw();

    if (running && !document.hidden) {
      animationFrame = requestAnimationFrame(frame);
    } else {
      animationFrame = 0;
    }
  }

  function start() {
    if (!running || document.hidden || animationFrame) return;
    previousTime = performance.now();
    animationFrame = requestAnimationFrame(frame);
  }

  function setRunning(next) {
    running = next;
    toggle.setAttribute("aria-pressed", String(!next));
    toggle.textContent = next ? "pause drift" : "resume drift";
    toggle.title = next
      ? "Pause background motion"
      : "Resume background motion";

    try {
      localStorage.setItem("background-motion", next ? "on" : "off");
    } catch (_) {}

    if (next) start();
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let stored = null;
  try {
    stored = localStorage.getItem("background-motion");
  } catch (_) {}

  const startRunning = stored
    ? stored === "on"
    : !reduceMotion.matches;

  toggle.hidden = false;
  toggle.addEventListener("click", () => setRunning(!running));

  const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");

  const refreshPalette = () => {
    readPalette();
    draw();
  };

  if (colorScheme.addEventListener) {
    colorScheme.addEventListener("change", refreshPalette);
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) start();
  });

  setRunning(startRunning);
  draw();
})();