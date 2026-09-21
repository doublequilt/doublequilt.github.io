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
    uniform float u_time;
    uniform vec3 u_base;
    uniform vec3 u_green;
    uniform vec3 u_red;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
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
      float amplitude = 0.52;

      for (int i = 0; i < 5; i++) {
        value += amplitude * noise(p);
        p = mat2(1.58, -1.18, 1.18, 1.58) * p + 0.17;
        amplitude *= 0.48;
      }

      return value;
    }

    void main() {
      vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
      vec2 pointer = (u_pointer - 0.5 * u_resolution) / u_resolution.y;

      float t = u_time * 0.022;
      vec2 p = uv * 1.08;

      vec2 towardPointer = pointer - uv;
      float pointerDistance = length(towardPointer);
      p += towardPointer * 0.055 * exp(-pointerDistance * 2.1);

      float a = fbm(p + vec2(t, -t * 0.72));
      float b = fbm(p + vec2(-1.8, 2.7) + vec2(-t * 0.55, t));
      vec2 warp = vec2(a - 0.5, b - 0.5);

      float field = fbm(p + warp * 2.75 + vec2(t * 0.35, -t * 0.2));
      float ribbon = fbm(p * 0.72 - warp * 1.55 + vec2(4.1, -2.8));

      float greenMix = smoothstep(0.28, 0.78, field) * 0.115;
      float redMix = smoothstep(0.42, 0.84, ribbon) * 0.06;

      vec3 color = mix(u_base, u_green, greenMix);
      color = mix(color, u_red, redMix);

      float vignette = smoothstep(1.25, 0.15, length(uv));
      color = mix(u_base, color, 0.78 + vignette * 0.22);

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
      base: cssColor("--paper", [0.94, 0.945, 0.92]),
      green: cssColor("--green", [0.35, 0.42, 0.23]),
      red: cssColor("--red", [0.64, 0.26, 0.25])
    };
  }
  readPalette();

  let dpr = 1;
  let pointer = [0, 0];
  let pointerTarget = [0, 0];

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
    }
  }

  function trackPointer(clientX, clientY) {
    pointerTarget = [
      clientX * dpr,
      (window.innerHeight - clientY) * dpr
    ];
  }

  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", (event) => {
    trackPointer(event.clientX, event.clientY);
  }, { passive: true });

  resize();

  let running = true;
  let animationFrame = 0;
  let simulatedTime = 0;
  let previous = performance.now();

  function draw() {
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform2f(uniforms.pointer, pointer[0], pointer[1]);
    gl.uniform1f(uniforms.time, simulatedTime);
    gl.uniform3fv(uniforms.base, palette.base);
    gl.uniform3fv(uniforms.green, palette.green);
    gl.uniform3fv(uniforms.red, palette.red);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(now) {
    const delta = Math.min((now - previous) / 1000, 0.05);
    previous = now;

    simulatedTime += delta;
    pointer[0] += (pointerTarget[0] - pointer[0]) * 0.035;
    pointer[1] += (pointerTarget[1] - pointer[1]) * 0.035;

    draw();

    if (running && !document.hidden) {
      animationFrame = requestAnimationFrame(frame);
    } else {
      animationFrame = 0;
    }
  }

  function start() {
    if (!running || document.hidden || animationFrame) return;
    previous = performance.now();
    animationFrame = requestAnimationFrame(frame);
  }

  function setRunning(next) {
    running = next;
    toggle.setAttribute("aria-pressed", String(!next));
    toggle.textContent = next ? "pause drift" : "resume drift";
    toggle.title = next ? "Pause background motion" : "Resume background motion";

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