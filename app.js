/* City Sim — TOP-DOWN GRID (more realistic) with tile graphics
   ✅ Roads = gray only
   ✅ Cars = yellow only (high contrast vs green map), NO red
   ✅ More realism: sidewalks, road borders, lane/crosswalk marks, richer grass,
      trees/bushes, small buildings, soft shadows
   ✅ PM2.5 heat overlay is the only red-ish element

   Interaction:
   - Hover shows cell info
   - Click road cell => incident spike
*/

(() => {
  // ---------- DOM ----------
  const canvas = document.getElementById("cityCanvas");
  const ctx = canvas.getContext("2d", { alpha: true });

  const avgPmEl = document.getElementById("avgPm");
  const peakPmEl = document.getElementById("peakPm");
  const carsNowEl = document.getElementById("carsNow");
  const tickNowEl = document.getElementById("tickNow");

  const btnStart = document.getElementById("btnStart");
  const btnPause = document.getElementById("btnPause");
  const btnReset = document.getElementById("btnReset");

  const tip = document.getElementById("hoverTip");
  const tTitle = document.getElementById("tTitle");
  const tPm = document.getElementById("tPm");
  const tRoad = document.getElementById("tRoad");

  const sliders = {
    cars:      byId("cars"),
    emission:  byId("emission"),
    diffusion: byId("diffusion"),
    decay:     byId("decay"),
    windX:     byId("windX"),
    windY:     byId("windY"),
    speed:     byId("speed"),
  };
  const vals = {
    cars:      byId("carsVal"),
    emission:  byId("emissionVal"),
    diffusion: byId("diffusionVal"),
    decay:     byId("decayVal"),
    windX:     byId("windXVal"),
    windY:     byId("windYVal"),
    speed:     byId("speedVal"),
  };

  function byId(id){ return document.getElementById(id); }

  // ---------- Simulation Config ----------
  const W = 44;
  const H = 28;
  const STREET_GAP = 6;

  let pm = make2D(W, H, 0);
  let pmNext = make2D(W, H, 0);

  const isRoad = make2D(W, H, false);
  buildRoads();

  // Decorative objects on non-road tiles (deterministic)
  let decor = make2D(W, H, null);
  buildDecor();

  // Cars = agents
  let cars = [];
  let tick = 0;

  // Loop
  let running = false;
  let lastFrame = 0;
  let accumulator = 0;

  // Chart
  const chart = initChart();
  let chartCounter = 0;

  // ---------- Top-down camera ----------
  const TILE = 18;
  const OFFSET_X = 22;
  const OFFSET_Y = 22;

  // hover
  let hoverCell = null;

  // ---------- Tile Atlas (pre-render) ----------
  const atlas = makeAtlas(TILE);

  // ---------- UI ----------
  syncUI();
  resetSim();
  draw();

  // ---------- Events ----------
  Object.entries(sliders).forEach(([k, input]) => {
    input.addEventListener("input", () => {
      syncUI();
      if (k === "cars") adjustCars(parseInt(sliders.cars.value, 10));
    });
  });

  btnStart.addEventListener("click", () => {
    running = true;
    requestAnimationFrame(loop);
  });

  btnPause.addEventListener("click", () => { running = false; });

  btnReset.addEventListener("click", () => {
    resetSim();
    draw();
  });

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);

    const cell = screenToGrid(mx, my);
    if (!cell || cell.x < 0 || cell.x >= W || cell.y < 0 || cell.y >= H){
      hoverCell = null;
      tip.style.display = "none";
      return;
    }

    hoverCell = cell;
    tip.style.display = "block";
    tTitle.textContent = `Cell (${cell.x}, ${cell.y})`;
    tPm.textContent = pm[cell.x][cell.y].toFixed(2);
    tRoad.textContent = isRoad[cell.x][cell.y] ? "Yes" : "No";
  });

  canvas.addEventListener("mouseleave", () => {
    hoverCell = null;
    tip.style.display = "none";
  });

  // Click: incident spike on road
  canvas.addEventListener("click", () => {
    if (!hoverCell) return;
    const { x, y } = hoverCell;
    if (isRoad[x][y]) pm[x][y] += 70;
  });

  // ---------- Core ----------
  function getParams(){
    return {
      cars: parseInt(sliders.cars.value, 10),
      emission: parseFloat(sliders.emission.value),
      diffusion: parseFloat(sliders.diffusion.value),
      decay: parseFloat(sliders.decay.value),
      windX: parseFloat(sliders.windX.value),
      windY: parseFloat(sliders.windY.value),
      speed: parseInt(sliders.speed.value, 10),
    };
  }

  function syncUI(){
    vals.cars.textContent = sliders.cars.value;
    vals.emission.textContent = Number(sliders.emission.value).toFixed(1);
    vals.diffusion.textContent = Number(sliders.diffusion.value).toFixed(2);
    vals.decay.textContent = Number(sliders.decay.value).toFixed(3);
    vals.windX.textContent = Number(sliders.windX.value).toFixed(2);
    vals.windY.textContent = Number(sliders.windY.value).toFixed(2);
    vals.speed.textContent = sliders.speed.value;
  }

  function resetSim(){
    tick = 0;
    pm = make2D(W, H, 0);
    pmNext = make2D(W, H, 0);

    cars = [];
    adjustCars(getParams().cars);

    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.update("none");
    chartCounter = 0;

    updateStats();
  }

  function adjustCars(target){
    while (cars.length < target) cars.push(spawnCar());
    while (cars.length > target) cars.pop();
    carsNowEl.textContent = String(cars.length);
  }

  function spawnCar(){
    for (let i = 0; i < 2500; i++){
      const x = randInt(0, W-1);
      const y = randInt(0, H-1);
      if (!isRoad[x][y]) continue;
      const dirs = validDirs(x,y);
      if (!dirs.length) continue;
      const d = dirs[randInt(0, dirs.length-1)];
      return { x, y, dx: d.dx, dy: d.dy, bob: Math.random()*Math.PI*2 };
    }
    return { x: 0, y: 0, dx: 1, dy: 0, bob: 0 };
  }

  function validDirs(x,y){
    const cand = [
      {dx: 1, dy: 0},{dx:-1, dy: 0},{dx: 0, dy: 1},{dx: 0, dy:-1},
    ];
    return cand.filter(d => inBounds(x+d.dx, y+d.dy) && isRoad[x+d.dx][y+d.dy]);
  }

  function step(){
    const p = getParams();
    tick++;

    // move cars + emit
    for (const c of cars){
      const dirs = validDirs(c.x, c.y);

      if (dirs.length > 1 && Math.random() < 0.35){
        const d = dirs[randInt(0, dirs.length-1)];
        c.dx = d.dx; c.dy = d.dy;
      } else {
        if (!inBounds(c.x + c.dx, c.y + c.dy) || !isRoad[c.x + c.dx][c.y + c.dy]){
          if (dirs.length){
            const d = dirs[randInt(0, dirs.length-1)];
            c.dx = d.dx; c.dy = d.dy;
          }
        }
      }

      const nx = c.x + c.dx;
      const ny = c.y + c.dy;
      if (inBounds(nx, ny) && isRoad[nx][ny]){
        c.x = nx; c.y = ny;
      }

      pm[c.x][c.y] += p.emission;
      c.bob += 0.18;
    }

    // pollution update: diffusion + wind + decay
    const diff = clamp(p.diffusion, 0, 1);
    const decay = clamp(p.decay, 0, 0.2);
    const wx = clamp(p.windX, -1, 1);
    const wy = clamp(p.windY, -1, 1);

    for (let x = 0; x < W; x++){
      for (let y = 0; y < H; y++){
        const center = pm[x][y];
        const left  = pm[x-1]?.[y] ?? center;
        const right = pm[x+1]?.[y] ?? center;
        const up    = pm[x]?.[y-1] ?? center;
        const down  = pm[x]?.[y+1] ?? center;

        let dval = (left + right + up + down) * 0.25;
        let mixed = lerp(center, dval, diff);

        // advection from upwind
        const ox = wx > 0 ? -1 : (wx < 0 ? 1 : 0);
        const oy = wy > 0 ? -1 : (wy < 0 ? 1 : 0);
        const sx = inBounds(x+ox, y+oy) ? pm[x+ox][y+oy] : center;
        mixed = lerp(mixed, sx, 0.35 * (Math.abs(wx) + Math.abs(wy)));

        mixed = mixed * (1 - decay);
        pmNext[x][y] = mixed < 0 ? 0 : mixed;
      }
    }

    const tmp = pm; pm = pmNext; pmNext = tmp;

    // stats + chart
    const { avg, peak } = computeStats();
    chartCounter++;
    if (chartCounter % 3 === 0) pushChartPoint(avg);

    avgPmEl.textContent = avg.toFixed(2);
    peakPmEl.textContent = peak.toFixed(2);
    carsNowEl.textContent = String(cars.length);
    tickNowEl.textContent = String(tick);
  }

  function computeStats(){
    let sum = 0, peak = 0;
    for (let x = 0; x < W; x++){
      for (let y = 0; y < H; y++){
        const v = pm[x][y];
        sum += v;
        if (v > peak) peak = v;
      }
    }
    return { avg: sum / (W * H), peak };
  }

  function updateStats(){
    const { avg, peak } = computeStats();
    avgPmEl.textContent = avg.toFixed(2);
    peakPmEl.textContent = peak.toFixed(2);
    carsNowEl.textContent = String(cars.length);
    tickNowEl.textContent = String(tick);
  }

  function pushChartPoint(avg){
    const MAX_POINTS = 160;
    chart.data.labels.push(String(tick));
    chart.data.datasets[0].data.push(avg);
    if (chart.data.labels.length > MAX_POINTS){
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    }
    chart.update("none");
  }

  // ---------- Projection ----------
  function gridToScreen(x, y){
    return { sx: OFFSET_X + x * TILE, sy: OFFSET_Y + y * TILE };
  }
  function screenToGrid(sx, sy){
    return {
      x: Math.floor((sx - OFFSET_X) / TILE),
      y: Math.floor((sy - OFFSET_Y) / TILE),
    };
  }

  // ---------- Rendering ----------
  function draw(){
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // sky / ambient
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, "#0b1f3f");
    sky.addColorStop(1, "#050611");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // normalize PM
    let peak = 0;
    for (let x = 0; x < W; x++){
      for (let y = 0; y < H; y++){
        peak = Math.max(peak, pm[x][y]);
      }
    }
    peak = Math.max(peak, 1e-6);

    // tiles
    for (let y = 0; y < H; y++){
      for (let x = 0; x < W; x++){
        const { sx, sy } = gridToScreen(x, y);

        if (isRoad[x][y]){
          const mask = roadMask(x,y);
          // occasional crosswalk at intersections for realism
          const isX = (mask === 15) && ((hash2(x,y,77) % 6) === 0);
          drawAtlas(atlas.road(mask, isX), sx, sy);
        } else {
          const variant = hash2(x,y,11) % 4;
          drawAtlas(atlas.grass(variant), sx, sy);

          // greenery
          const r = hash01(x,y,9);
          if (r < 0.055) drawAtlas(atlas.tree(hash2(x,y,7)%3), sx, sy);
          else if (r < 0.095) drawAtlas(atlas.bush(hash2(x,y,5)%2), sx, sy);
          else if (r < 0.120) drawAtlas(atlas.flower(hash2(x,y,3)%3), sx, sy);

          // buildings
          const d = decor[x][y];
          if (d){
            if (d.kind === "house") drawAtlas(atlas.house(d.variant), sx, sy);
            else drawAtlas(atlas.tower(d.variant), sx, sy);
          }
        }

        // PM heat overlay (ONLY red-ish thing)
        const v = pm[x][y] / peak;
        if (v > 0){
          // low -> light amber, high -> deep red
          const a = 0.08 + v * 0.65;
          const r = 255;
          const g = Math.floor(210 * (1 - v));
          const b = Math.floor(70  * (1 - v));
          ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
          ctx.fillRect(sx, sy, TILE, TILE);
        }

        // subtle grid edge (pixel-ish)
        ctx.strokeStyle = "rgba(0,0,0,0.22)";
        ctx.lineWidth = 1;
        ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);

        // hover highlight
        if (hoverCell && hoverCell.x === x && hoverCell.y === y){
          ctx.strokeStyle = "rgba(255,255,255,0.92)";
          ctx.lineWidth = 2;
          ctx.strokeRect(sx + 1, sy + 1, TILE - 2, TILE - 2);
        }
      }
    }

    // cars (yellow only)
    for (const c of cars){
      const { sx, sy } = gridToScreen(c.x, c.y);
      const bob = Math.sin(c.bob) * 0.7;

      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.30)";
      ctx.fillRect(sx + TILE*0.22, sy + TILE*0.72, TILE*0.56, TILE*0.12);

      // body (yellow)
      ctx.fillStyle = "#1500ff";
      ctx.fillRect(sx + TILE*0.20, sy + TILE*0.30 + bob, TILE*0.60, TILE*0.42);

      // roof (dark)
      ctx.fillStyle = "rgba(20,20,30,0.55)";
      ctx.fillRect(sx + TILE*0.30, sy + TILE*0.26 + bob, TILE*0.40, TILE*0.18);

      // highlight
      ctx.fillStyle = "rgba(255,255,255,0.20)";
      ctx.fillRect(sx + TILE*0.22, sy + TILE*0.32 + bob, TILE*0.18, TILE*0.12);
    }

    drawHUD();
  }

  function drawAtlas(img, x, y){
    ctx.drawImage(img, x, y);
  }

  function roadMask(x,y){
    let m = 0;
    if (inBounds(x, y-1) && isRoad[x][y-1]) m |= 1;   // N
    if (inBounds(x+1, y) && isRoad[x+1][y]) m |= 2;   // E
    if (inBounds(x, y+1) && isRoad[x][y+1]) m |= 4;   // S
    if (inBounds(x-1, y) && isRoad[x-1][y]) m |= 8;   // W
    return m;
  }

  function drawHUD(){
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(10,14,30,0.62)";
    roundRect(ctx, 18, canvas.height - 92, 330, 66, 14);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "800 13px Inter, Noto Sans Thai, system-ui";
    ctx.fillText("Legend", 34, canvas.height - 66);

    // road swatch (gray)
    ctx.fillStyle = "rgba(90,100,120,0.85)";
    roundRect(ctx, 34, canvas.height - 54, 18, 12, 4);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "12px Inter, Noto Sans Thai, system-ui";
    ctx.fillText("Road", 58, canvas.height - 44);

    // car swatch (yellow)
    ctx.fillStyle = "rgba(255,212,59,0.95)";
    roundRect(ctx, 120, canvas.height - 54, 18, 12, 4);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText("Cars", 144, canvas.height - 44);

    // PM swatch
    const gx = 190, gy = canvas.height - 54;
    const g = ctx.createLinearGradient(gx, gy, gx + 120, gy);
    g.addColorStop(0, "rgba(255,220,120,0.90)");
    g.addColorStop(0.55, "rgba(255,170,70,0.92)");
    g.addColorStop(1, "rgba(255,70,90,0.92)");
    ctx.fillStyle = g;
    roundRect(ctx, gx, gy, 120, 12, 6);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText("PM2.5 (low → high)", 190, canvas.height - 32);

    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r){
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr, y);
    ctx.arcTo(x+w, y, x+w, y+h, rr);
    ctx.arcTo(x+w, y+h, x, y+h, rr);
    ctx.arcTo(x, y+h, x, y, rr);
    ctx.arcTo(x, y, x+w, y, rr);
    ctx.closePath();
  }

  // ---------- Main loop ----------
  function loop(ts){
    if (!running) return;

    if (!lastFrame) lastFrame = ts;
    const dt = (ts - lastFrame) / 1000;
    lastFrame = ts;

    const ticksPerSec = getParams().speed;
    const stepDt = 1 / ticksPerSec;

    accumulator += dt;
    let steps = 0;
    const MAX_STEPS_PER_FRAME = 8;

    while (accumulator >= stepDt && steps < MAX_STEPS_PER_FRAME){
      step();
      accumulator -= stepDt;
      steps++;
    }

    draw();
    requestAnimationFrame(loop);
  }

  // ---------- Roads ----------
  function buildRoads(){
    for (let x = 0; x < W; x++){
      for (let y = 0; y < H; y++){
        const vertical = (x % STREET_GAP === 0);
        const horizontal = (y % STREET_GAP === 0);
        isRoad[x][y] = vertical || horizontal;
      }
    }
    // ring road
    for (let x = 2; x < W-2; x++){
      isRoad[x][2] = true;
      isRoad[x][H-3] = true;
    }
    for (let y = 2; y < H-2; y++){
      isRoad[2][y] = true;
      isRoad[W-3][y] = true;
    }
  }

  function buildDecor(){
    decor = make2D(W, H, null);
    for (let x = 0; x < W; x++){
      for (let y = 0; y < H; y++){
        if (isRoad[x][y]) continue;
        if (nearRoad(x,y)) continue;

        const r = hash01(x,y,33);
        if (r < 0.045){
          decor[x][y] = { kind: "house", variant: hash2(x,y,81)%3 };
        } else if (r < 0.055){
          decor[x][y] = { kind: "tower", variant: hash2(x,y,91)%3 };
        }
      }
    }
  }

  function nearRoad(x,y){
    for (let dx=-1; dx<=1; dx++){
      for (let dy=-1; dy<=1; dy++){
        if (!dx && !dy) continue;
        const nx = x+dx, ny = y+dy;
        if (inBounds(nx,ny) && isRoad[nx][ny]) return true;
      }
    }
    return false;
  }

  // ---------- Chart ----------
  function initChart(){
    const c = document.getElementById("pmChart").getContext("2d");
    return new Chart(c, {
      type: "line",
      data: {
        labels: [],
        datasets: [{
          label: "Avg PM2.5",
          data: [],
          tension: 0.25,
          pointRadius: 0,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        animation: false,
        plugins: { legend: { display: true } },
        scales: { x: { ticks: { maxTicksLimit: 6 } }, y: { beginAtZero: true } }
      }
    });
  }

  // ---------- Atlas generator ----------
  function makeAtlas(T){
    const cache = new Map();
    const make = (key, drawFn) => {
      if (cache.has(key)) return cache.get(key);
      const c = document.createElement("canvas");
      c.width = T; c.height = T;
      const g = c.getContext("2d");
      drawFn(g);
      cache.set(key, c);
      return c;
    };

    const px = (g, x,y,w,h, col) => { g.fillStyle = col; g.fillRect(x,y,w,h); };

    // Grass: more realistic texture + subtle variation
    const grass = (v) => make(`grass:${v}`, (g) => {
      const base = v===0 ? "#2f8f44" : v===1 ? "#2a8340" : v===2 ? "#2e954b" : "#2b8742";
      px(g,0,0,T,T, base);

      // noise speckles
      for (let i=0;i<28;i++){
        const x = (hash2(i,v,17) % T);
        const y = (hash2(i,v,19) % T);
        px(g,x,y,1,1,"rgba(0,0,0,0.16)");
      }
      for (let i=0;i<18;i++){
        const x = (hash2(i,v,23) % T);
        const y = (hash2(i,v,29) % T);
        px(g,x,y,1,1,"rgba(255,255,255,0.12)");
      }

      // edge shading
      px(g,0,T-2,T,2,"rgba(0,0,0,0.20)");
      px(g,T-2,0,2,T,"rgba(0,0,0,0.16)");
    });

    // Road: gray asphalt + gray sidewalks + markings (white). Crosswalk optional.
    const road = (mask, crosswalk=false) => make(`road:${mask}:${crosswalk?1:0}`, (g) => {
      // sidewalk (stone) - neutral gray
      px(g,0,0,T,T,"#b8bdc6");
      px(g,1,1,T-2,T-2,"#c9ced7");

      // curb inner line
      px(g,2,2,T-4,T-4,"rgba(0,0,0,0.10)");

      // asphalt (gray)
      px(g,3,3,T-6,T-6,"#5b6373");
      px(g,4,4,T-8,T-8,"#515a6b");

      // connections extension (asphalt)
      const mid = Math.floor(T/2);
      const w = 6;
      const end = T-3;

      if (mask & 1) px(g, mid - Math.floor(w/2), 0, w, mid, "#515a6b");       // N
      if (mask & 2) px(g, mid, mid - Math.floor(w/2), end - mid, w, "#515a6b"); // E
      if (mask & 4) px(g, mid - Math.floor(w/2), mid, w, end - mid, "#515a6b"); // S
      if (mask & 8) px(g, 0, mid - Math.floor(w/2), mid, w, "#515a6b");       // W

      // lane markings (white) for straights
      g.globalAlpha = 0.60;
      if ((mask & 1) && (mask & 4)) px(g, mid-1, 4, 2, T-8, "rgba(245,245,245,0.9)");
      if ((mask & 2) && (mask & 8)) px(g, 4, mid-1, T-8, 2, "rgba(245,245,245,0.9)");
      g.globalAlpha = 1;

      // crosswalk at some intersections
      if (crosswalk){
        g.globalAlpha = 0.75;
        for (let i=0;i<4;i++){
          const yy = 5 + i*3;
          px(g, 5, yy, T-10, 1, "rgba(255,255,255,0.85)");
        }
        g.globalAlpha = 1;
      }

      // cracks / noise
      for (let i=0;i<12;i++){
        const x = 3 + (hash2(i,mask,61) % (T-6));
        const y = 3 + (hash2(i,mask,67) % (T-6));
        px(g,x,y,1,1,"rgba(0,0,0,0.18)");
      }

      // soft inner shadow
      px(g,3,3,T-6,1,"rgba(0,0,0,0.18)");
      px(g,3,3,1,T-6,"rgba(0,0,0,0.14)");
    });

    const bush = (v) => make(`bush:${v}`, (g) => {
      g.clearRect(0,0,T,T);
      const base = v===0 ? "#1f7a3f" : "#227f45";
      const hi   = "rgba(255,255,255,0.16)";
      // shadow
      px(g,4,16,T-8,2,"rgba(0,0,0,0.18)");
      // blob
      px(g,4,11,T-8,6,base);
      px(g,6,9,T-12,8,base);
      px(g,7,8,T-14,8,base);
      // highlights
      px(g,6,10,2,2,hi);
      px(g,10,9,2,2,hi);
      px(g,13,11,2,2,hi);
    });

    const tree = (v) => make(`tree:${v}`, (g) => {
      g.clearRect(0,0,T,T);
      // shadow
      px(g,5,16,T-10,2,"rgba(0,0,0,0.18)");
      // trunk
      px(g,Math.floor(T/2)-1,12,2,5,"#8d5524");
      // canopy
      const leaf = v===0 ? "#2f9e44" : v===1 ? "#37b24d" : "#2b8a3e";
      px(g,4,6,T-8,7,leaf);
      px(g,6,4,T-12,7,leaf);
      px(g,7,3,T-14,7,leaf);
      // highlight
      px(g,6,6,2,2,"rgba(255,255,255,0.14)");
      px(g,11,5,2,2,"rgba(255,255,255,0.12)");
    });

    const flower = (v) => make(`flower:${v}`, (g) => {
      g.clearRect(0,0,T,T);
      const colors = ["#ff6b6b","#ffd43b","#74c0fc"];
      const c = colors[v%colors.length];
      // stem
      px(g, Math.floor(T/2), 10, 1, 6, "#2f9e44");
      // petals
      px(g, Math.floor(T/2)-1, 8, 3, 3, c);
      px(g, Math.floor(T/2), 9, 1, 1, "rgba(255,255,255,0.9)");
    });

    const house = (v) => make(`house:${v}`, (g) => {
      g.clearRect(0,0,T,T);
      const wall = v===0 ? "#f2e2d2" : (v===1 ? "#dbe7ff" : "#f7efd1");
      const roof = v===0 ? "#8b2a2a" : (v===1 ? "#3b5bdb" : "#b45309");

      // shadow
      px(g,3,15,T-6,3,"rgba(0,0,0,0.20)");

      // body
      px(g,4,9,T-8,7,wall);
      px(g,5,10,T-10,5,"rgba(255,255,255,0.10)");

      // roof
      px(g,4,7,T-8,2,roof);
      px(g,5,6,T-10,2,roof);
      px(g,6,5,T-12,2,roof);

      // door/window
      px(g,Math.floor(T/2)-1,12,3,4,"rgba(0,0,0,0.26)");
      px(g,6,11,3,3,"rgba(0,0,0,0.20)");
      px(g,T-9,11,3,3,"rgba(0,0,0,0.20)");
    });

    const tower = (v) => make(`tower:${v}`, (g) => {
      g.clearRect(0,0,T,T);
      const stone = v===0 ? "#adb5bd" : (v===1 ? "#c3b0ff" : "#a5d8ff");
      const cap   = v===0 ? "#495057" : (v===1 ? "#5f3dc4" : "#1864ab");

      // shadow
      px(g,5,15,T-10,3,"rgba(0,0,0,0.20)");

      // column
      px(g,6,6,T-12,10,stone);
      px(g,7,7,T-14,8,"rgba(255,255,255,0.10)");

      // cap
      px(g,5,5,T-10,2,cap);
      px(g,6,4,T-12,2,cap);

      // windows
      px(g,Math.floor(T/2)-1,9,3,2,"rgba(0,0,0,0.24)");
      px(g,Math.floor(T/2)-1,12,3,2,"rgba(0,0,0,0.24)");
    });

    return { grass, road, bush, tree, flower, house, tower };
  }

  // ---------- Utils ----------
  function make2D(w,h,fill){
    const a = new Array(w);
    for (let x = 0; x < w; x++){
      a[x] = new Array(h);
      for (let y = 0; y < h; y++){
        a[x][y] = (typeof fill === "function") ? fill(x,y) : fill;
      }
    }
    return a;
  }
  function inBounds(x,y){ return x >= 0 && x < W && y >= 0 && y < H; }
  function randInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
  function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
  function lerp(a,b,t){ return a + (b-a)*t; }

  // deterministic hashing (stable decor)
  function hash2(a,b,seed=0){
    let x = (a|0) * 374761393 + (b|0) * 668265263 + (seed|0) * 1442695041;
    x = (x ^ (x >> 13)) * 1274126177;
    x = x ^ (x >> 16);
    return x >>> 0;
  }
  function hash01(x,y,seed=0){
    return (hash2(x,y,seed) % 10000) / 10000;
  }

})();
