const WEATHER_CODES = {
  clear: [0, 1],
  cloudy: [2, 3, 45, 48],
  rain: [51, 53, 55, 61, 63, 65, 80, 81, 82],
  snow: [71, 73, 75, 77, 85, 86],
  storm: [95, 96, 99],
};

const BOUNDS = {
  minLat: 24.0,
  maxLat: 46.5,
  minLon: 123.0,
  maxLon: 146.0,
};

const UPDATE_INTERVAL = 10 * 60 * 1000;

const state = {
  rainIntensity: 0.2,
  tempLevel: 0.5,
  cards: new Map(),
  dots: new Map(),
};

const elements = {
  canvas: document.getElementById("glCanvas"),
  cards: document.getElementById("cityCards"),
  dots: document.getElementById("dotLayer"),
  updatedAt: document.getElementById("updatedAt"),
  refreshButton: document.getElementById("refreshButton"),
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeCoord(lat, lon) {
  const x = (lon - BOUNDS.minLon) / (BOUNDS.maxLon - BOUNDS.minLon);
  const y = 1 - (lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat);
  return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function categorizeWeather(code) {
  if (WEATHER_CODES.clear.includes(code)) return "Clear";
  if (WEATHER_CODES.cloudy.includes(code)) return "Cloudy";
  if (WEATHER_CODES.rain.includes(code)) return "Rain";
  if (WEATHER_CODES.snow.includes(code)) return "Snow";
  if (WEATHER_CODES.storm.includes(code)) return "Storm";
  return "Mixed";
}

function buildCards() {
  elements.cards.innerHTML = "";
  CITIES.forEach((city) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <h3>${city.name}</h3>
      <div class="metric">--°</div>
      <div class="meta-line"><span>Weather</span><span class="weather">--</span></div>
      <div class="meta-line"><span>Rain</span><span class="rain">-- mm</span></div>
      <div class="meta-line"><span>Wind</span><span class="wind">-- m/s</span></div>
    `;
    elements.cards.appendChild(card);
    state.cards.set(city.name, card);
  });
}

function buildDots() {
  elements.dots.innerHTML = "";
  CITIES.forEach((city) => {
    const dot = document.createElement("div");
    dot.className = "city-dot";
    const { x, y } = normalizeCoord(city.lat, city.lon);
    dot.style.left = `${x * 100}%`;
    dot.style.top = `${y * 100}%`;
    elements.dots.appendChild(dot);
    state.dots.set(city.name, dot);
  });
}

function setUpdatedTime() {
  const now = new Date();
  const stamp = now.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
  elements.updatedAt.textContent = `${stamp} JST`;
}

function summarizeWeather(values) {
  const temps = values.map((v) => v.temperature);
  const rains = values.map((v) => v.precipitation);
  const avgTemp =
    temps.reduce((sum, val) => sum + val, 0) / Math.max(temps.length, 1);
  const avgRain =
    rains.reduce((sum, val) => sum + val, 0) / Math.max(rains.length, 1);

  state.tempLevel = clamp((avgTemp + 5) / 35, 0, 1);
  state.rainIntensity = clamp(avgRain / 5, 0, 1);
}

async function fetchWeather() {
  const latitudes = CITIES.map((city) => city.lat).join(",");
  const longitudes = CITIES.map((city) => city.lon).join(",");
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${latitudes}` +
    `&longitude=${longitudes}` +
    "&current=temperature_2m,precipitation,weather_code,wind_speed_10m" +
    "&timezone=Asia%2FTokyo";

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Weather API error");
  }
  const data = await response.json();
  const current = data.current || {};
  const temp = current.temperature_2m || [];
  const precip = current.precipitation || [];
  const wind = current.wind_speed_10m || [];
  const code = current.weather_code || [];

  const isArray = Array.isArray(temp);
  const list = CITIES.map((city, index) => ({
    city,
    temperature: toNumber(isArray ? temp[index] : temp),
    precipitation: toNumber(isArray ? precip[index] : precip),
    wind: toNumber(isArray ? wind[index] : wind),
    code: toNumber(isArray ? code[index] : code),
  }));

  list.forEach((item) => {
    const card = state.cards.get(item.city.name);
    if (!card) return;
    card.querySelector(".metric").textContent = `${Math.round(
      item.temperature
    )}°`;
    card.querySelector(".weather").textContent = categorizeWeather(item.code);
    card.querySelector(".rain").textContent = `${item.precipitation.toFixed(
      1
    )} mm`;
    card.querySelector(".wind").textContent = `${item.wind.toFixed(1)} m/s`;

    const dot = state.dots.get(item.city.name);
    if (dot) {
      const intensity =
        item.precipitation > 2 ? "high" : item.precipitation > 0.3 ? "mid" : "low";
      dot.dataset.intensity = intensity;
    }
  });

  summarizeWeather(
    list.map((item) => ({
      temperature: item.temperature,
      precipitation: item.precipitation,
    }))
  );
  setUpdatedTime();
}

function setupRenderer() {
  const renderer = new THREE.WebGLRenderer({
    canvas: elements.canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const plane = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRain: { value: 0.2 },
      uTemp: { value: 0.5 },
      uResolution: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      uniform float uTime;
      uniform float uRain;
      uniform float uTemp;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 4; i++) {
          value += amp * noise(p);
          p *= 2.0;
          amp *= 0.5;
        }
        return value;
      }

      void main() {
        vec2 uv = vUv * 2.0 - 1.0;
        float drift = uTime * 0.03;
        float field = fbm(vUv * 3.0 + vec2(drift, drift * 0.7));
        float cloud = smoothstep(0.35, 0.8, field);

        vec3 warm = vec3(1.0, 0.65, 0.35);
        vec3 cool = vec3(0.2, 0.4, 0.55);
        vec3 base = mix(vec3(0.98, 0.94, 0.9), vec3(0.85, 0.88, 0.9), cloud);

        vec3 tempMix = mix(cool, warm, uTemp);
        vec3 rainMix = mix(base, cool, uRain * 0.8);

        float sweep = sin((uv.x + uv.y) * 6.0 + uTime * 0.2) * 0.03;
        vec3 color = mix(rainMix, tempMix, 0.3 + sweep);

        float haze = smoothstep(-0.8, 0.8, uv.y) * 0.12;
        color += haze;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(plane, material);
  scene.add(mesh);

  const rainCount = 1200;
  const positions = new Float32Array(rainCount * 3);
  for (let i = 0; i < rainCount; i++) {
    positions[i * 3] = Math.random() * 2 - 1;
    positions[i * 3 + 1] = Math.random() * 2 - 1;
    positions[i * 3 + 2] = 0;
  }

  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const rainMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.01,
    transparent: true,
    opacity: 0.35,
  });

  const rain = new THREE.Points(rainGeometry, rainMaterial);
  scene.add(rain);

  function resize() {
    const { clientWidth, clientHeight } = elements.canvas;
    renderer.setSize(clientWidth, clientHeight, false);
  }

  function animate(time) {
    material.uniforms.uTime.value = time * 0.001;
    material.uniforms.uRain.value = state.rainIntensity;
    material.uniforms.uTemp.value = state.tempLevel;

    const speed = 0.004 + state.rainIntensity * 0.02;
    const array = rainGeometry.attributes.position.array;
    for (let i = 0; i < rainCount; i++) {
      const idx = i * 3 + 1;
      array[idx] -= speed;
      if (array[idx] < -1.1) array[idx] = 1.1;
    }
    rainGeometry.attributes.position.needsUpdate = true;
    rainMaterial.opacity = 0.15 + state.rainIntensity * 0.55;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  resize();
  window.addEventListener("resize", resize);
  requestAnimationFrame(animate);
}

async function updateWeather() {
  try {
    await fetchWeather();
  } catch (error) {
    elements.updatedAt.textContent = "API error";
  }
}

buildCards();
buildDots();
setupRenderer();
updateWeather();
setInterval(updateWeather, UPDATE_INTERVAL);

elements.refreshButton.addEventListener("click", updateWeather);
