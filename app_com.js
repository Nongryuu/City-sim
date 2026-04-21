/* City Sim — TOP-DOWN GRID (Ultimate Edition - Perfect Queue Logic)
   ✅ Interactive City Builder (Edit Mode)
   🚦 Smart Traffic Lights (Perfectly centered)
   🌧️ Manual Weather Control (Force Rain / Stop Rain)
   🚗 Universal Lane Rule (Odd/Even Parity)
   🚫 STRICT NO U-TURN at dead ends
   🛑 PERFECT QUEUE: Cars properly line up behind each other at red lights
   ⏳ Extreme Patience (800 ticks limit for long traffic jams)
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
  
  const btnEdit = document.getElementById("btnEdit");
  const editToolbar = document.getElementById("editToolbar");
  const btnExitEdit = document.getElementById("btnExitEdit");
  const btnClearMap = document.getElementById("btnClearMap");
  const btnDefaultMap = document.getElementById("btnDefaultMap");
  const toolBtns = document.querySelectorAll(".toolBtn");

  const btnRainOn = document.getElementById("btnRainOn");
  const btnRainOff = document.getElementById("btnRainOff");

  const tip = document.getElementById("hoverTip");
  const tTitle = document.getElementById("tTitle");
  const tPm = document.getElementById("tPm");
  const tRoad = document.getElementById("tRoad");

  const sliders = {
    cars:      document.getElementById("cars"),
    emission:  document.getElementById("emission"),
    diffusion: document.getElementById("diffusion"),
    decay:     document.getElementById("decay"),
    windX:     document.getElementById("windX"),
    windY:     document.getElementById("windY"),
    speed:     document.getElementById("speed"),
  };
  const vals = {
    cars:      document.getElementById("carsVal"),
    emission:  document.getElementById("emissionVal"),
    diffusion: document.getElementById("diffusionVal"),
    decay:     document.getElementById("decayVal"),
    windX:     document.getElementById("windXVal"),
    windY:     document.getElementById("windYVal"),
    speed:     document.getElementById("speedVal"),
  };

  // ---------- Simulation Config ----------
  const W = 74; 
  const H = 46; 
  const STREET_GAP = 10; 

  let pm = make2D(W, H, 0);
  let pmNext = make2D(W, H, 0);
  let isRoad = make2D(W, H, false);
  let decor = make2D(W, H, null);

  let cars = [];
  let tick = 0;
  let timeOfDay = 8; 
  let isRaining = false; 

  let isEditMode = false;
  let currentTool = "road";
  let isDragging = false;
  let trafficLights = [];

  let running = false;
  let lastFrame = 0;
  let accumulator = 0;
  let chartCounter = 0;

  // Camera & Atlas
  const TILE = 17; 
  const OFFSET_X = 10; 
  const OFFSET_Y = 20;
  let hoverCell = null;
  const atlas = makeAtlas(TILE);
  const chart = initChart();

  // ---------- โหลดค่าเริ่มต้นเมื่อเปิดหน้าเว็บ ----------
  buildRoads();
  buildDecor();
  initTrafficLights();
  syncUI();
  resetSim();
  draw();

  // ==========================================
  // 🖱️ EVENT LISTENERS (การจัดการเหตุการณ์ต่างๆ)
  // ==========================================

  // จัดการปุ่มเปิด/ปิดฝน
  btnRainOn.addEventListener("click", () => { isRaining = true; draw(); });
  btnRainOff.addEventListener("click", () => { isRaining = false; draw(); });

  // จัดการโหมดแก้ไขแผนที่ (Edit Mode)
  btnEdit.addEventListener("click", () => {
    isEditMode = true;
    running = false; 
    editToolbar.style.display = "flex";
    btnEdit.style.display = "none";
    canvas.style.cursor = "crosshair";
    cars = []; 
    draw();
  });

  btnExitEdit.addEventListener("click", () => {
    isEditMode = false;
    editToolbar.style.display = "none";
    btnEdit.style.display = "inline-block";
    canvas.style.cursor = "default";
    initTrafficLights(); 
    adjustCars(getParams().cars); 
    draw();
  });

  btnClearMap.addEventListener("click", () => {
    isRoad = make2D(W, H, false);
    decor = make2D(W, H, null);
    trafficLights = [];
    draw();
  });

  btnDefaultMap.addEventListener("click", () => {
    buildRoads();
    buildDecor();
    initTrafficLights();
    draw();
  });

  toolBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      toolBtns.forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      currentTool = e.target.getAttribute("data-tool");
    });
  });

  // จัดการเมาส์บน Canvas
  canvas.addEventListener("mousedown", (e) => {
    if (!isEditMode) return;
    isDragging = true;
    applyTool(hoverCell);
  });

  canvas.addEventListener("mouseup", () => isDragging = false);

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    const cell = screenToGrid(mx, my);
    
    if (!cell || cell.x < 0 || cell.x >= W || cell.y < 0 || cell.y >= H){
      hoverCell = null; tip.style.display = "none"; return;
    }
    
    hoverCell = cell;
    
    if (isEditMode && isDragging) {
      applyTool(hoverCell);
    } else if (!isEditMode) {
      tip.style.display = "block";
      tTitle.textContent = `Cell (${cell.x}, ${cell.y})`;
      tPm.textContent = pm[cell.x][cell.y].toFixed(2);
      tRoad.textContent = isRoad[cell.x][cell.y] ? "Yes" : "No";
    }
  });

  canvas.addEventListener("mouseleave", () => { 
    hoverCell = null; tip.style.display = "none"; isDragging = false; 
  });

  // คลิกเพิ่ม PM2.5 แบบแมนนวลบนถนน
  canvas.addEventListener("click", () => {
    if (isEditMode || !hoverCell) return;
    const { x, y } = hoverCell;
    if (isRoad[x][y]) pm[x][y] += 70;
  });

  // ควบคุม Sliders ค่าต่างๆ
  Object.entries(sliders).forEach(([k, input]) => {
    input.addEventListener("input", () => {
      syncUI();
      if (k === "cars" && !isEditMode) adjustCars(parseInt(sliders.cars.value, 10));
    });
  });

  // ปุ่มควบคุม Simulation
  btnStart.addEventListener("click", () => { if(!isEditMode) { running = true; requestAnimationFrame(loop); } });
  btnPause.addEventListener("click", () => { running = false; });
  btnReset.addEventListener("click", () => { if(!isEditMode) { resetSim(); draw(); }});


  // ==========================================
  // 🛠️ SETUP & INITIALIZATION FUNCTIONS
  // ฟังก์ชันสำหรับการสร้างและรีเซ็ตสภาพแวดล้อมเบื้องต้น
  // ==========================================

  // สร้างถนนเริ่มต้นในรูปแบบตารางตามค่า STREET_GAP
  function buildRoads(){
    for (let x = 0; x < W; x++){
      for (let y = 0; y < H; y++){
        const vertical = (x % STREET_GAP === 0 || x % STREET_GAP === 1);
        const horizontal = (y % STREET_GAP === 0 || y % STREET_GAP === 1);
        isRoad[x][y] = vertical || horizontal;
      }
    }
  }

  // สร้างสิ่งปลูกสร้างและต้นไม้รอบๆ พื้นที่ที่ไม่ใช่ถนน
  function buildDecor(){
    decor = make2D(W, H, null);
    for (let x = 0; x < W; x++){
      for (let y = 0; y < H; y++){
        if (isRoad[x][y] || nearRoad(x,y)) continue;
        const r = hash01(x,y,33);
        if (r < 0.045) decor[x][y] = { kind: "house", variant: hash2(x,y,81)%3 };
        else if (r < 0.055) decor[x][y] = { kind: "tower", variant: hash2(x,y,91)%3 };
      }
    }
  }

  // ติดตั้งสัญญาณไฟจราจรตามทางแยกที่มีถนนตัดกัน 3 ทางขึ้นไป
  function initTrafficLights() {
    trafficLights = [];
    for (let x = 0; x < W - 1; x++) {
      for (let y = 0; y < H - 1; y++) {
        if (isRoad[x][y] && isRoad[x+1][y] && isRoad[x][y+1] && isRoad[x+1][y+1]) {
           let extendsOut = 0;
           if (x > 0 && isRoad[x-1][y] && isRoad[x-1][y+1]) extendsOut++; 
           if (x < W-2 && isRoad[x+2][y] && isRoad[x+2][y+1]) extendsOut++; 
           if (y > 0 && isRoad[x][y-1] && isRoad[x+1][y-1]) extendsOut++; 
           if (y < H-2 && isRoad[x][y+2] && isRoad[x+1][y+2]) extendsOut++; 
           
           if (extendsOut >= 3) {
               if (!trafficLights.some(l => Math.abs(l.x - x) <= 2 && Math.abs(l.y - y) <= 2)) {
                   trafficLights.push({
                       x: x, y: y,
                       state: Math.random() > 0.5 ? 'V' : 'H',
                       timer: randInt(0, 40), 
                       toggleTime: randInt(50, 80)
                   });
               }
           }
        }
      }
    }
  }

  // รีเซ็ตตัวแปรการจำลองทั้งหมดให้กลับไปเป็นค่าเริ่มต้น
  function resetSim(){
    tick = 0; timeOfDay = 8; 
    pm = make2D(W, H, 0); pmNext = make2D(W, H, 0);
    cars = []; adjustCars(getParams().cars);
    chart.data.labels = []; chart.data.datasets[0].data = [];
    chart.update("none"); chartCounter = 0;
    initTrafficLights(); 
    updateStats();
  }

  // ปรับจำนวนรถในแผนที่ให้ตรงกับค่าเป้าหมาย (ลบหรือสุ่มเกิดเพิ่ม)
  function adjustCars(target){
    while (cars.length < target) cars.push(spawnCar());
    while (cars.length > target) cars.pop();
    carsNowEl.textContent = String(cars.length);
  }

  // นำเครื่องมือแต่งแผนที่ไปวางในตำแหน่งที่ระบุ (ถนน, หญ้า, ต้นไม้, ตึก)
  function applyTool(cell) {
    if (!cell || !inBounds(cell.x, cell.y)) return;
    const {x, y} = cell;
    if (currentTool === "road") {
      isRoad[x][y] = true; decor[x][y] = null;
    } else if (currentTool === "grass") {
      isRoad[x][y] = false; decor[x][y] = null;
    } else if (currentTool === "tree") {
      isRoad[x][y] = false; decor[x][y] = { kind: "tree", variant: randInt(0, 2) };
    } else if (currentTool === "building") {
      isRoad[x][y] = false; decor[x][y] = { kind: Math.random()>0.5?"house":"tower", variant: randInt(0, 2) };
    }
    draw();
  }


  // ==========================================
  // 🚗 CORE SIMULATION & LOGIC FUNCTIONS
  // ฟังก์ชันหลักที่รันลูปเกม จัดการรถ มลพิษ และกฎจราจร
  // ==========================================

  // ลูปหลักของเกม ควบคุมความเร็วการรันตาม Framerate และเรียกฟังก์ชัน step
  function loop(ts){
    if (!running) return;
    if (!lastFrame) lastFrame = ts; const dt = (ts - lastFrame) / 1000; lastFrame = ts;
    const ticksPerSec = getParams().speed; const stepDt = 1 / ticksPerSec;
    accumulator += dt; let steps = 0; const MAX_STEPS_PER_FRAME = 8;
    while (accumulator >= stepDt && steps < MAX_STEPS_PER_FRAME){ step(); accumulator -= stepDt; steps++; }
    draw(); requestAnimationFrame(loop);
  }

  // คำนวณความคืบหน้าของโลก 1 Tick (รถเคลื่อนที่, มลพิษกระจาย, ไฟแดงเปลี่ยน)
  function step(){
    const p = getParams();
    tick++;
    timeOfDay += 0.02; if (timeOfDay >= 24) timeOfDay -= 24;

    for (let t of trafficLights) {
      t.timer++;
      if (t.timer >= t.toggleTime) { t.state = t.state === 'V' ? 'H' : 'V'; t.timer = 0; }
    }

    for (let i = 0; i < cars.length; i++){
        let c = cars[i];

        if (!inBounds(c.x + c.dx, c.y + c.dy)) {
            cars[i] = spawnCar();
            continue;
        }
        
        const cand = [{dx: 1, dy: 0}, {dx: -1, dy: 0}, {dx: 0, dy: 1}, {dx: 0, dy: -1}];
        let possible = cand.filter(d => inBounds(c.x + d.dx, c.y + d.dy) && isRoad[c.x + d.dx][c.y + d.dy]);

        let strictPossible = possible.filter(d => {
            let nx = c.x + d.dx; let ny = c.y + d.dy;
            if (d.dy === 1) return nx % 2 === 0;    
            if (d.dy === -1) return nx % 2 !== 0;   
            if (d.dx === -1) return ny % 2 === 0;   
            if (d.dx === 1) return ny % 2 !== 0;    
            return false; 
        });

        let options = strictPossible.filter(d => !(d.dx === -c.dx && d.dy === -c.dy));

        if (options.length === 0) { 
            cars[i] = spawnCar(); 
            continue; 
        }

        let forward = options.find(d => d.dx === c.dx && d.dy === c.dy);
        let moved = false;
        
        let isQueueing = false; 

        if (forward) {
            let nx = c.x + forward.dx; let fny = c.y + forward.dy;
            let red = isRedLight(c.x, c.y, nx, fny, forward.dx, forward.dy);
            let occ = cars.some(other => other !== c && other.x === nx && other.y === fny);
            
            if (red || occ) {
                isQueueing = true;
            }

            if (!red && !occ && Math.random() < 0.85) {
                c.x = nx; c.y = fny;
                c.dx = forward.dx; c.dy = forward.dy;
                moved = true;
            }
        }

        if (!moved && !isQueueing) {
            let clearOptions = options.filter(d => {
                let nx = c.x + d.dx; let ny = c.y + d.dy;
                let red = isRedLight(c.x, c.y, nx, ny, d.dx, d.dy);
                let occ = cars.some(other => other !== c && other.x === nx && other.y === ny);
                return !red && !occ;
            });

            if (clearOptions.length > 0) {
                let pick = clearOptions[randInt(0, clearOptions.length - 1)];
                c.x += pick.dx; c.y += pick.dy;
                c.dx = pick.dx; c.dy = pick.dy;
                moved = true;
            }
        }

        if (moved) {
            pm[c.x][c.y] += p.emission;
            c.stuckTimer = 0; 
        } else {
            pm[c.x][c.y] += p.emission * 0.5; 
            c.stuckTimer = (c.stuckTimer || 0) + 1;
            
            if (c.stuckTimer > 800) { cars[i] = spawnCar(); continue; }
        }
        c.bob += 0.18;
    }

    let currentDecay = isRaining ? clamp(p.decay * 10, 0.05, 0.5) : p.decay;
    const diff = clamp(p.diffusion, 0, 1);
    const decay = clamp(currentDecay, 0, 0.5);
    const wx = clamp(p.windX, -1, 1);
    const wy = clamp(p.windY, -1, 1);

    for (let x = 0; x < W; x++){
      for (let y = 0; y < H; y++){
        const center = pm[x][y];
        const left  = pm[x-1]?.[y] ?? center; const right = pm[x+1]?.[y] ?? center;
        const up    = pm[x]?.[y-1] ?? center; const down  = pm[x]?.[y+1] ?? center;

        let dval = (left + right + up + down) * 0.25;
        let mixed = lerp(center, dval, diff);

        const ox = wx > 0 ? -1 : (wx < 0 ? 1 : 0);
        const oy = wy > 0 ? -1 : (wy < 0 ? 1 : 0);
        const sx = inBounds(x+ox, y+oy) ? pm[x+ox][y+oy] : center;
        mixed = lerp(mixed, sx, 0.35 * (Math.abs(wx) + Math.abs(wy)));

        mixed = mixed * (1 - decay);

        if (decor[x][y] && decor[x][y].kind === "tree") {
            mixed *= 0.85; 
        }

        pmNext[x][y] = mixed < 0 ? 0 : mixed;
      }
    }

    const tmp = pm; pm = pmNext; pmNext = tmp;

    const { avg, peak } = computeStats();
    chartCounter++; if (chartCounter % 3 === 0) pushChartPoint(avg);
    updateStats();
  }

  // สุ่มหารถลงมาเกิดใหม่ในตำแหน่งและทิศทางที่ถูกต้อง (เลนต้องสัมพันธ์กัน)
  function spawnCar(){
    for (let i = 0; i < 2500; i++){
      const x = randInt(0, W-1); const y = randInt(0, H-1);
      if (!isRoad[x][y] || cars.some(c => c.x === x && c.y === y)) continue;
      
      const dirs = validDirs(x, y); 
      if (!dirs.length) continue;
      const d = dirs[randInt(0, dirs.length-1)];
      return { x, y, dx: d.dx, dy: d.dy, bob: Math.random()*Math.PI*2, stuckTimer: 0 };
    }
    return { x: 0, y: 0, dx: 1, dy: 0, bob: 0, stuckTimer: 0 };
  }

  // หาเส้นทางที่เป็นไปได้ที่รถสามารถวิ่งไปได้โดยยึดกฎเดินรถทางเดียวหรือเลนคู่/คี่
  function validDirs(x, y, currentDx = 0, currentDy = 0){
    const cand = [{dx: 1, dy: 0},{dx:-1, dy: 0},{dx: 0, dy: 1},{dx: 0, dy:-1}];
    let possible = cand.filter(d => inBounds(x+d.dx, y+d.dy) && isRoad[x+d.dx][y+d.dy]);

    let strictPossible = possible.filter(d => {
        let nx = x + d.dx; let ny = y + d.dy;
        if (d.dy === 1) return nx % 2 === 0;    
        if (d.dy === -1) return nx % 2 !== 0;   
        if (d.dx === -1) return ny % 2 === 0;   
        if (d.dx === 1) return ny % 2 !== 0;    
        return false; 
    });

    if (strictPossible.length > 0) {
      if (currentDx !== 0 || currentDy !== 0) {
        const forward = strictPossible.find(d => d.dx === currentDx && d.dy === currentDy);
        if (forward && Math.random() < 0.85) return [forward]; 
      }
      return strictPossible;
    }
    return []; 
  }

  // ตรวจสอบว่าทิศทางที่รถกำลังจะมุ่งไปเป็นไฟแดงหรือไม่
  function isRedLight(cx, cy, nx, ny, dx, dy) {
    for (const l of trafficLights) {
        const inNext = (nx === l.x || nx === l.x + 1) && (ny === l.y || ny === l.y + 1);
        const inCurr = (cx === l.x || cx === l.x + 1) && (cy === l.y || cy === l.y + 1);
        
        if (inNext && !inCurr) {
            if (dy !== 0 && l.state === 'H') return true;
            if (dx !== 0 && l.state === 'V') return true;
        }
    }
    return false;
  }


  // ==========================================
  // 📊 STATS & CHART FUNCTIONS
  // ฟังก์ชันคำนวณและแสดงผลสถิติรวมถึงกราฟ PM2.5
  // ==========================================

  // สร้างออบเจ็กต์ Chart.js สำหรับวาดกราฟ PM2.5
  function initChart(){
    const c = document.getElementById("pmChart").getContext("2d");
    return new Chart(c, {
      type: "line", data: { labels: [], datasets: [{ label: "Avg PM2.5", data: [], tension: 0.25, pointRadius: 0, borderWidth: 2 }] },
      options: { responsive: true, animation: false, plugins: { legend: { display: true } }, scales: { x: { ticks: { maxTicksLimit: 6 } }, y: { beginAtZero: true } } }
    });
  }

  // คำนวณค่าเฉลี่ยและจุดที่ PM2.5 หนาแน่นที่สุดในแผนที่
  function computeStats(){
    let sum = 0, peak = 0;
    for (let x = 0; x < W; x++){
      for (let y = 0; y < H; y++){
        const v = pm[x][y]; sum += v; if (v > peak) peak = v;
      }
    }
    return { avg: sum / (W * H), peak };
  }

  // อัปเดตตัวเลขสถิติด้านบนของหน้าจอ
  function updateStats(){
    const { avg, peak } = computeStats();
    avgPmEl.textContent = avg.toFixed(2); peakPmEl.textContent = peak.toFixed(2);
    carsNowEl.textContent = String(cars.length); tickNowEl.textContent = String(tick);
  }

  // บันทึกค่าเฉลี่ย PM2.5 ปัจจุบันลงในกราฟ
  function pushChartPoint(avg){
    const MAX_POINTS = 160;
    chart.data.labels.push(String(tick)); chart.data.datasets[0].data.push(avg);
    if (chart.data.labels.length > MAX_POINTS){ chart.data.labels.shift(); chart.data.datasets[0].data.shift(); }
    chart.update("none");
  }


  // ==========================================
  // 🎨 RENDERING & DRAWING FUNCTIONS
  // ฟังก์ชันสำหรับวาดภาพกราฟิก วัตถุ เลเยอร์ต่างๆ ลงใน Canvas
  // ==========================================

  // ฟังก์ชันหลักที่ทำการเรนเดอร์กราฟิกทั้งหมด (แผนที่, หมอกควัน, รถ, สภาพอากาศ)
  function draw(){
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let darkness = 0;
    if (timeOfDay < 6 || timeOfDay > 18) darkness = 0.65;
    else if (timeOfDay >= 6 && timeOfDay < 8) darkness = lerp(0.65, 0, (timeOfDay - 6) / 2);
    else if (timeOfDay >= 16 && timeOfDay <= 18) darkness = lerp(0, 0.65, (timeOfDay - 16) / 2);

    ctx.fillStyle = "#050611"; ctx.fillRect(0, 0, canvas.width, canvas.height);

    let peak = 0;
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) peak = Math.max(peak, pm[x][y]);
    peak = Math.max(peak, 1e-6);

    for (let y = 0; y < H; y++){
      for (let x = 0; x < W; x++){
        const { sx, sy } = gridToScreen(x, y);

        if (isRoad[x][y]){
          const mask = roadMask(x,y);
          const isX = (mask === 15) && ((hash2(x,y,77) % 6) === 0);
          drawAtlas(atlas.road(mask, isX), sx, sy);
        } else {
          drawAtlas(atlas.grass(hash2(x,y,11) % 4), sx, sy);
          
          const d = decor[x][y];
          if (d){
            if (d.kind === "house") drawAtlas(atlas.house(d.variant), sx, sy);
            else if (d.kind === "tower") drawAtlas(atlas.tower(d.variant), sx, sy);
            else if (d.kind === "tree") drawAtlas(atlas.tree(d.variant), sx, sy);
          } else if (!isEditMode) {
            const r = hash01(x,y,9);
            if (r < 0.055) drawAtlas(atlas.tree(hash2(x,y,7)%3), sx, sy);
            else if (r < 0.095) drawAtlas(atlas.bush(hash2(x,y,5)%2), sx, sy);
            else if (r < 0.120) drawAtlas(atlas.flower(hash2(x,y,3)%3), sx, sy);
          }
        }

        const v = pm[x][y] / peak;
        if (v > 0){
          const a = 0.08 + v * 0.65;
          const rColor = 255; const gColor = Math.floor(210 * (1 - v)); const bColor = Math.floor(70  * (1 - v));
          ctx.fillStyle = `rgba(${rColor},${gColor},${bColor},${a})`; ctx.fillRect(sx, sy, TILE, TILE);
        }

        ctx.strokeStyle = "rgba(0,0,0,0.22)"; ctx.lineWidth = 1; ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);

        if (hoverCell && hoverCell.x === x && hoverCell.y === y){
          ctx.strokeStyle = isEditMode ? "rgba(255,170,50,0.92)" : "rgba(255,255,255,0.92)";
          ctx.lineWidth = 2; ctx.strokeRect(sx + 1, sy + 1, TILE - 2, TILE - 2);
        }
      }
    }

    if (darkness > 0) { ctx.fillStyle = `rgba(10, 15, 35, ${darkness})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }

    if (!isEditMode) {
        for (const t of trafficLights) {
          const sx = OFFSET_X + t.x * TILE; const sy = OFFSET_Y + t.y * TILE;
          const cx = sx + TILE; const cy = sy + TILE;

          ctx.fillStyle = "rgba(15, 15, 20, 0.95)"; ctx.fillRect(cx - TILE*0.8, cy - TILE*0.8, TILE*1.6, TILE*1.6);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.3)"; ctx.lineWidth = 1; ctx.strokeRect(cx - TILE*0.8, cy - TILE*0.8, TILE*1.6, TILE*1.6);

          const colorV = t.state === 'V' ? "#00ff66" : "#ff3333"; const colorH = t.state === 'H' ? "#00ff66" : "#ff3333";
          ctx.shadowBlur = 8;

          ctx.fillStyle = colorV; ctx.shadowColor = colorV; ctx.beginPath();
          ctx.arc(cx, cy - TILE*0.4, 3, 0, Math.PI*2); ctx.arc(cx, cy + TILE*0.4, 3, 0, Math.PI*2); ctx.fill();

          ctx.fillStyle = colorH; ctx.shadowColor = colorH; ctx.beginPath();
          ctx.arc(cx - TILE*0.4, cy, 3, 0, Math.PI*2); ctx.arc(cx + TILE*0.4, cy, 3, 0, Math.PI*2); ctx.fill();
          ctx.shadowBlur = 0; 
        }

        for (const c of cars){
          const { sx, sy } = gridToScreen(c.x, c.y); const bob = Math.sin(c.bob) * 0.7;
          ctx.fillStyle = "rgba(0,0,0,0.50)"; ctx.fillRect(sx + TILE*0.22, sy + TILE*0.72, TILE*0.56, TILE*0.12);
          ctx.fillStyle = "#1500ff"; ctx.fillRect(sx + TILE*0.20, sy + TILE*0.30 + bob, TILE*0.60, TILE*0.42);
          ctx.fillStyle = "rgba(20,20,30,0.55)"; ctx.fillRect(sx + TILE*0.30, sy + TILE*0.26 + bob, TILE*0.40, TILE*0.18);

          if (darkness > 0.2) {
            ctx.fillStyle = `rgba(255, 255, 180, ${darkness * 0.7})`; ctx.beginPath();
            let hx = sx + TILE/2; let hy = sy + TILE/2 + bob; ctx.moveTo(hx, hy);
            if (c.dx === 1) { ctx.lineTo(hx+TILE*1.8, hy-TILE*0.8); ctx.lineTo(hx+TILE*1.8, hy+TILE*0.8); }
            else if (c.dx === -1) { ctx.lineTo(hx-TILE*1.8, hy-TILE*0.8); ctx.lineTo(hx-TILE*1.8, hy+TILE*0.8); }
            else if (c.dy === 1) { ctx.lineTo(hx-TILE*0.8, hy+TILE*1.8); ctx.lineTo(hx+TILE*0.8, hy+TILE*1.8); }
            else if (c.dy === -1) { ctx.lineTo(hx-TILE*0.8, hy-TILE*1.8); ctx.lineTo(hx+TILE*0.8, hy-TILE*1.8); }
            ctx.fill();
          }
        }
    }

    if (isRaining) {
        ctx.strokeStyle = "rgba(180, 200, 255, 0.4)"; ctx.lineWidth = 1; ctx.beginPath();
        for(let i=0; i<150; i++) {
            let rx = Math.random() * canvas.width; let ry = Math.random() * canvas.height;
            ctx.moveTo(rx, ry); ctx.lineTo(rx - 8, ry + 16);
        }
        ctx.stroke();
    }

    drawHUD();
  }

  // วาดสไปรต์ที่แคชเอาไว้จาก Atlas มาไว้ใน Canvas ตรงตำแหน่งที่ต้องการ
  function drawAtlas(img, x, y){ ctx.drawImage(img, x, y); }

  // วาดแผงหน้าปัดและคำอธิบายสัญลักษณ์ (HUD) บริเวณมุมล่างซ้าย
  function drawHUD(){
    ctx.save(); ctx.globalAlpha = 0.92; ctx.fillStyle = "rgba(10,14,30,0.62)";
    roundRect(ctx, 18, canvas.height - 92, 450, 66, 14); ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.font = "800 13px Inter, Noto Sans Thai, system-ui";
    ctx.fillText(isEditMode ? "EDIT MODE ACTIVE" : "Legend", 34, canvas.height - 66);

    ctx.fillStyle = "rgba(90,100,120,0.85)"; roundRect(ctx, 34, canvas.height - 54, 18, 12, 4); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.font = "12px Inter, Noto Sans Thai, system-ui";
    ctx.fillText("Road", 58, canvas.height - 44);

    const gx = 110, gy = canvas.height - 54; const g = ctx.createLinearGradient(gx, gy, gx + 90, gy);
    g.addColorStop(0, "rgba(255,220,120,0.90)"); g.addColorStop(1, "rgba(255,70,90,0.92)");
    ctx.fillStyle = g; roundRect(ctx, gx, gy, 90, 12, 6); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.fillText("PM2.5", 110, canvas.height - 32);

    let h = Math.floor(timeOfDay); let m = Math.floor((timeOfDay - h) * 60);
    let timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.font = "800 14px Inter";
    ctx.fillText(`🕒 ${timeStr}`, 230, canvas.height - 44);

    if (isRaining) { ctx.fillStyle = "#66ccff"; ctx.fillText(`🌧️ Raining`, 300, canvas.height - 44); }
    ctx.restore();
  }

  // วาดรูปสี่เหลี่ยมที่มีมุมโค้งมน
  function roundRect(ctx, x, y, w, h, r){
    const rr = Math.min(r, w/2, h/2); ctx.beginPath();
    ctx.moveTo(x+rr, y); ctx.arcTo(x+w, y, x+w, y+h, rr); ctx.arcTo(x+w, y+h, x, y+h, rr);
    ctx.arcTo(x, y+h, x, y, rr); ctx.arcTo(x, y, x+w, y, rr); ctx.closePath();
  }

  // สร้างระบบ Atlas (เก็บแคชภาพวาดต่างๆ เช่น ถนน หญ้า เพื่อไม่ต้องวาดใหม่ตลอด)
  function makeAtlas(T){
    const cache = new Map();
    const make = (key, drawFn) => {
      if (cache.has(key)) return cache.get(key);
      const c = document.createElement("canvas"); c.width = T; c.height = T;
      const g = c.getContext("2d"); drawFn(g); cache.set(key, c); return c;
    };
    const px = (g, x,y,w,h, col) => { g.fillStyle = col; g.fillRect(x,y,w,h); };

    const grass = (v) => make(`grass:${v}`, (g) => {
      const base = v===0 ? "#2f8f44" : v===1 ? "#2a8340" : v===2 ? "#2e954b" : "#2b8742"; px(g,0,0,T,T, base);
      for (let i=0;i<28;i++) px(g,(hash2(i,v,17)%T),(hash2(i,v,19)%T),1,1,"rgba(0,0,0,0.16)");
      for (let i=0;i<18;i++) px(g,(hash2(i,v,23)%T),(hash2(i,v,29)%T),1,1,"rgba(255,255,255,0.12)");
      px(g,0,T-2,T,2,"rgba(0,0,0,0.20)"); px(g,T-2,0,2,T,"rgba(0,0,0,0.16)");
    });

    const road = (mask, crosswalk=false) => make(`road:${mask}:${crosswalk?1:0}`, (g) => {
      px(g,0,0,T,T,"#b8bdc6"); px(g,1,1,T-2,T-2,"#c9ced7"); px(g,2,2,T-4,T-4,"rgba(0,0,0,0.10)"); px(g,3,3,T-6,T-6,"#5b6373"); px(g,4,4,T-8,T-8,"#515a6b");
      const mid = Math.floor(T/2); const w = 6; const end = T-3;
      if (mask & 1) px(g, mid - Math.floor(w/2), 0, w, mid, "#515a6b");       
      if (mask & 2) px(g, mid, mid - Math.floor(w/2), end - mid, w, "#515a6b"); 
      if (mask & 4) px(g, mid - Math.floor(w/2), mid, w, end - mid, "#515a6b"); 
      if (mask & 8) px(g, 0, mid - Math.floor(w/2), mid, w, "#515a6b");       
      g.globalAlpha = 0.60;
      if ((mask & 1) && (mask & 4)) px(g, mid-1, 4, 2, T-8, "rgba(245,245,245,0.9)");
      if ((mask & 2) && (mask & 8)) px(g, 4, mid-1, T-8, 2, "rgba(245,245,245,0.9)");
      g.globalAlpha = 1;
      if (crosswalk){ g.globalAlpha = 0.75; for (let i=0;i<4;i++) px(g, 5, 5+i*3, T-10, 1, "rgba(255,255,255,0.85)"); g.globalAlpha = 1; }
      for (let i=0;i<12;i++) px(g,3+(hash2(i,mask,61)%(T-6)),3+(hash2(i,mask,67)%(T-6)),1,1,"rgba(0,0,0,0.18)");
      px(g,3,3,T-6,1,"rgba(0,0,0,0.18)"); px(g,3,3,1,T-6,"rgba(0,0,0,0.14)");
    });

    const bush = (v) => make(`bush:${v}`, (g) => {
      g.clearRect(0,0,T,T); const base = v===0 ? "#1f7a3f" : "#227f45"; const hi = "rgba(255,255,255,0.16)";
      px(g,4,16,T-8,2,"rgba(0,0,0,0.18)"); px(g,4,11,T-8,6,base); px(g,6,9,T-12,8,base); px(g,7,8,T-14,8,base); px(g,6,10,2,2,hi); px(g,10,9,2,2,hi); px(g,13,11,2,2,hi);
    });

    const tree = (v) => make(`tree:${v}`, (g) => {
      g.clearRect(0,0,T,T); px(g,5,16,T-10,2,"rgba(0,0,0,0.18)"); px(g,Math.floor(T/2)-1,12,2,5,"#8d5524");
      const leaf = v===0 ? "#2f9e44" : v===1 ? "#37b24d" : "#2b8a3e";
      px(g,4,6,T-8,7,leaf); px(g,6,4,T-12,7,leaf); px(g,7,3,T-14,7,leaf); px(g,6,6,2,2,"rgba(255,255,255,0.14)"); px(g,11,5,2,2,"rgba(255,255,255,0.12)");
    });

    const flower = (v) => make(`flower:${v}`, (g) => {
      g.clearRect(0,0,T,T); const c = ["#ff6b6b","#ffd43b","#74c0fc"][v%3];
      px(g, Math.floor(T/2), 10, 1, 6, "#2f9e44"); px(g, Math.floor(T/2)-1, 8, 3, 3, c); px(g, Math.floor(T/2), 9, 1, 1, "rgba(255,255,255,0.9)");
    });

    const house = (v) => make(`house:${v}`, (g) => {
      g.clearRect(0,0,T,T); const wall = v===0 ? "#f2e2d2" : (v===1 ? "#dbe7ff" : "#f7efd1"); const roof = v===0 ? "#8b2a2a" : (v===1 ? "#3b5bdb" : "#b45309");
      px(g,3,15,T-6,3,"rgba(0,0,0,0.20)"); px(g,4,9,T-8,7,wall); px(g,5,10,T-10,5,"rgba(255,255,255,0.10)"); px(g,4,7,T-8,2,roof); px(g,5,6,T-10,2,roof); px(g,6,5,T-12,2,roof);
      px(g,Math.floor(T/2)-1,12,3,4,"rgba(0,0,0,0.26)"); px(g,6,11,3,3,"rgba(0,0,0,0.20)"); px(g,T-9,11,3,3,"rgba(0,0,0,0.20)");
    });

    const tower = (v) => make(`tower:${v}`, (g) => {
      g.clearRect(0,0,T,T); const stone = v===0 ? "#adb5bd" : (v===1 ? "#c3b0ff" : "#a5d8ff"); const cap = v===0 ? "#495057" : (v===1 ? "#5f3dc4" : "#1864ab");
      px(g,5,15,T-10,3,"rgba(0,0,0,0.20)"); px(g,6,6,T-12,10,stone); px(g,7,7,T-14,8,"rgba(255,255,255,0.10)"); px(g,5,5,T-10,2,cap); px(g,6,4,T-12,2,cap);
      px(g,Math.floor(T/2)-1,9,3,2,"rgba(0,0,0,0.24)"); px(g,Math.floor(T/2)-1,12,3,2,"rgba(0,0,0,0.24)");
    });

    return { grass, road, bush, tree, flower, house, tower };
  }

  // สร้าง Bitmask ให้ถนนเพื่อคำนวณทิศทางการเชื่อมต่อว่าต่อกับทางไหนบ้าง
  function roadMask(x,y){
    let m = 0;
    if (inBounds(x, y-1) && isRoad[x][y-1]) m |= 1;   
    if (inBounds(x+1, y) && isRoad[x+1][y]) m |= 2;   
    if (inBounds(x, y+1) && isRoad[x][y+1]) m |= 4;   
    if (inBounds(x-1, y) && isRoad[x-1][y]) m |= 8;   
    return m;
  }


  // ==========================================
  // 🎛️ UI & INTERACTION HELPERS
  // ฟังก์ชันดึงค่าจากหน้าจอและแปลงพิกัดกริดกับเมาส์
  // ==========================================

  // ดึงค่าการตั้งค่าจาก Slider บนหน้าจอ
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

  // อัปเดตตัวเลข Text ข้างๆ Slider ให้ตรงกับค่าที่ปรับ
  function syncUI(){
    vals.cars.textContent = sliders.cars.value;
    vals.emission.textContent = Number(sliders.emission.value).toFixed(1);
    vals.diffusion.textContent = Number(sliders.diffusion.value).toFixed(2);
    vals.decay.textContent = Number(sliders.decay.value).toFixed(3);
    vals.windX.textContent = Number(sliders.windX.value).toFixed(2);
    vals.windY.textContent = Number(sliders.windY.value).toFixed(2);
    vals.speed.textContent = sliders.speed.value;
  }

  // แปลงพิกัดแบบ Grid (ตาราง) ให้กลายเป็นพิกัดบนจอ (Pixel)
  function gridToScreen(x, y){ return { sx: OFFSET_X + x * TILE, sy: OFFSET_Y + y * TILE }; }

  // แปลงพิกัดบนจอ (Pixel) ให้กลายเป็นพิกัดแบบ Grid (ตาราง)
  function screenToGrid(sx, sy){ return { x: Math.floor((sx - OFFSET_X) / TILE), y: Math.floor((sy - OFFSET_Y) / TILE) }; }


  // ==========================================
  // 🧮 UTILITY & MATH FUNCTIONS
  // ฟังก์ชันคำนวณทางคณิตศาสตร์ แฮชชิ่ง และอรรถประโยชน์ทั่วไป
  // ==========================================

  // สร้างอาเรย์ 2 มิติตามขนาดที่กำหนด และเติมค่าเริ่มต้น
  function make2D(w,h,fill){
    const a = new Array(w);
    for (let x = 0; x < w; x++){ a[x] = new Array(h); for (let y = 0; y < h; y++) a[x][y] = (typeof fill === "function") ? fill(x,y) : fill; }
    return a;
  }

  // ตรวจสอบว่าพิกัด x, y ยังอยู่ภายในขอบเขตของแผนที่หรือไม่
  function inBounds(x,y){ return x >= 0 && x < W && y >= 0 && y < H; }

  // ตรวจสอบว่าจุดที่พิกัดระบุนั้นอยู่ติดกับถนนหรือไม่ (เพื่อใช้สร้างบ้านเรือน)
  function nearRoad(x,y){
    for (let dx=-1; dx<=1; dx++){
      for (let dy=-1; dy<=1; dy++){
        if (!dx && !dy) continue; const nx = x+dx, ny = y+dy;
        if (inBounds(nx,ny) && isRoad[nx][ny]) return true;
      }
    }
    return false;
  }

  // สุ่มตัวเลขจำนวนเต็มระหว่างค่าต่ำสุดและสูงสุดที่กำหนด
  function randInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }

  // บังคับให้ค่าตัวเลขอยู่ในช่วง Min และ Max ที่กำหนดเสมอ
  function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

  // การทำ Linear Interpolation หาค่ากึ่งกลางระหว่าง 2 ค่าโดยใช้น้ำหนัก (t)
  function lerp(a,b,t){ return a + (b-a)*t; }

  // สร้างค่า Hash ตัวเลขจากการผสมค่า X, Y (ใช้เพื่อสุ่มรูปแบบต้นไม้ บ้านให้คงที่)
  function hash2(a,b,seed=0){
    let x = (a|0) * 374761393 + (b|0) * 668265263 + (seed|0) * 1442695041;
    x = (x ^ (x >> 13)) * 1274126177; return (x ^ (x >> 16)) >>> 0;
  }

  // สร้างค่า Hash แล้วแปลงให้เป็นเลขทศนิยมระหว่าง 0 ถึง 1
  function hash01(x,y,seed=0){ return (hash2(x,y,seed) % 10000) / 10000; }
})();