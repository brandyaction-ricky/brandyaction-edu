// Isometric office: agents that are working sit at cubicle desks; a few that
// are off duty wander between the pantry, lounge, meeting room and ping-pong
// table. Plain canvas 2D with local provider logos, no dependencies.
(() => {
  'use strict';

  const TW = 64; // tile width px
  const TH = 32; // tile height px; one z unit is TH px too
  const WALL_H = 3.2;
  const WORKING = new Set(['thinking', 'tool', 'typing', 'waiting', 'error']);
  const MAX_WANDERERS = 7;
  const SPEED = 2.1; // tiles / second

  const SKIN = ['#f3cfb0', '#e5b38f', '#c98d66', '#9a6646', '#6e4630', '#f7dcc7'];
  const HAIR = ['#2a2019', '#4b3020', '#8a4b2a', '#c99a5b', '#1c1c1c', '#8c8c8c', '#a33a2c', '#3d3550'];
  const SHIRT = {
    present: ['#86a9bf', '#6d91aa', '#9bb5c5', '#7795ab'],
    claude: ['#c96442', '#d9825f', '#b4553a', '#e09a72'],
    codex: ['#10a37f', '#2bb38f', '#0d8a6b', '#4cc3a0'],
    gemini: ['#4f7cf0', '#6b8ff5', '#3d66d6', '#8aa6f8'],
    copilot: ['#8f5cf5', '#a06af7', '#7a47d5', '#c5a4ff'],
    omp: ['#a96926', '#c78942', '#8d531e', '#dca45c'],
    antigravity: ['#0ea5e9', '#38bdf8', '#0284c7', '#7dd3fc'],
  };
  // Official product icons, shared by both renderers and the page UI (OMP: a neutral monogram).
  // Load once per page from the same origin so video capture stays readable.
  // Initials remain a fallback if an image cannot be loaded.
  const AGENT_BADGES = {
    claude: { label: 'Claude', short: 'Cl', color: '#c96442', logo: '/campus/world/office/vendor/assets/agents/claude.png' },
    codex: { label: 'Codex', short: 'Cx', color: '#10a37f', logo: '/campus/world/office/vendor/assets/agents/codex.png' },
    gemini: { label: 'Gemini', short: 'G', color: '#4f7cf0', logo: '/campus/world/office/vendor/assets/agents/gemini.png' },
    copilot: { label: 'Copilot', short: 'Co', color: '#8f5cf5', logo: '/campus/world/office/vendor/assets/agents/copilot.svg', mono: true },
    kimi: { label: 'Kimi Code', short: 'Ki', logo: '/campus/world/office/vendor/assets/agents/kimi.svg', mono: true },
    dsh: { label: 'DSH', short: 'Ds', logo: '/campus/world/office/vendor/assets/agents/dsh.svg' },
    grok: { label: 'Grok Build', short: 'Gr', logo: '/campus/world/office/vendor/assets/agents/grok.svg', mono: true },
    omp: { label: 'OMP', short: 'OMP', color: '#a96926', logo: '/campus/world/office/vendor/assets/agents/omp.svg' },
    antigravity: { label: 'Antigravity', short: 'Ag', color: '#0ea5e9', logo: '/campus/world/office/vendor/assets/agents/antigravity.png' },
  };
  for (const badge of Object.values(AGENT_BADGES)) {
    badge.image = new Image();
    badge.image.src = badge.logo;
  }
  const PANTS = ['#34405a', '#2c2c34', '#4a3f35', '#3b4a3f'];
  const PANEL = ['#7194a4', '#829da4', '#668ca1', '#80969d'];

  const STATUS_COLOR = {
    thinking: '#8b6be6', tool: '#3b8ee0', typing: '#22a874', waiting: '#e09412',
    done: '#5f9a4c', error: '#de4b40', interrupted: '#9b9a94', idle: '#9b9a94',
  };

  const ACT_EMOJI = {
    coffee: '☕', water: '💧', fridge: '🍎', sink: '🫧', stool: '💬', couch: '💬', beanbag: '🎧',
    window: '🔭', read: '📖', whiteboard: '✏️', meeting: '💬', arcade: '🎮', pingpong: '🏓', plant: '🌱',
    vending: '🥤', foosball: '⚽', phone: '📞',
  };

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const pick = (arr, h, salt) => arr[(Math.imul(h ^ Math.imul(salt, 2654435761), 2246822519) >>> 0) % arr.length];
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function palette() {
    return {
      dark: true,
      wood1: '#596c7a', wood2: '#536572', woodLine: 'rgba(20,38,51,.28)',
      tileA: '#71838d', tileB: '#657782', carpet: '#415664', carpetLine: 'rgba(173,219,239,.10)',
      wallL: '#d5ddd9', wallR: '#b9c7c8', wallTop: '#e8ece5', trim: '#415969',
      deskTop: '#d9e2df', deskL: '#839da6', deskR: '#627f8d',
      monitor: '#243b4b', screenOff: '#1b3949', chair: '#405562',
      rug: '#344e60', rugEdge: '#78aec8', couch: '#67899c', couchD: '#4d6d81',
      counter: '#e5e8df', counterL: '#acbcb9', counterR: '#829c9f', metal: '#97acb6',
      glass: 'rgba(126,207,237,.12)', glassEdge: 'rgba(145,217,244,.55)', mat: '#3c5462',
      text: '#edf5f7', tagBg: 'rgba(10,24,34,.88)', bubble: '#e9f3f6', bubbleInk: '#152c3a',
      plant: '#638e7b', pot: '#b2c5c9', shadow: 'rgba(3,16,28,.28)', book: ['#d5a754', '#79b8d3', '#91a89e', '#d2d7c5', '#72899f'],
    };
  }

  function skyColor() { return { sky: '#06111e', night: true }; }

  // ---------------------------------------------------------------- A* grid

  class Grid {
    constructor(W, D, res = 4) {
      this.res = res;
      this.cw = Math.ceil(W * res);
      this.ch = Math.ceil(D * res);
      this.cost = new Uint8Array(this.cw * this.ch);
    }
    block(x, y, w, d, pad = 0.12) {
      const R = this.res;
      const i0 = clamp(Math.floor((x - pad) * R), 0, this.cw - 1);
      const i1 = clamp(Math.ceil((x + w + pad) * R) - 1, 0, this.cw - 1);
      const j0 = clamp(Math.floor((y - pad) * R), 0, this.ch - 1);
      const j1 = clamp(Math.ceil((y + d + pad) * R) - 1, 0, this.ch - 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.cost[j * this.cw + i] = 1;
    }
    blocked(x, y) {
      const i = Math.floor(x * this.res), j = Math.floor(y * this.res);
      if (i < 0 || j < 0 || i >= this.cw || j >= this.ch) return true;
      return !!this.cost[j * this.cw + i];
    }
    path(ax, ay, bx, by) {
      const R = this.res, cw = this.cw, ch = this.ch;
      const si = clamp(Math.floor(ax * R), 0, cw - 1), sj = clamp(Math.floor(ay * R), 0, ch - 1);
      const gi = clamp(Math.floor(bx * R), 0, cw - 1), gj = clamp(Math.floor(by * R), 0, ch - 1);
      const N = cw * ch;
      const g = new Float32Array(N).fill(Infinity);
      const came = new Int32Array(N).fill(-1);
      const closed = new Uint8Array(N);
      const heap = [];
      const push = (f, n) => {
        heap.push([f, n]);
        let k = heap.length - 1;
        while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; }
      };
      const pop = () => {
        const top = heap[0], last = heap.pop();
        if (heap.length) {
          heap[0] = last;
          let k = 0;
          for (;;) {
            const l = 2 * k + 1, r = l + 1;
            let m = k;
            if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
            if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
            if (m === k) break;
            [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
          }
        }
        return top;
      };
      const hfn = (i, j) => { const dx = Math.abs(i - gi), dy = Math.abs(j - gj); return Math.max(dx, dy) + 0.41 * Math.min(dx, dy); };
      // Blocked cells are expensive, not impossible, so a path always exists
      // (someone standing right against furniture can still step away).
      const stepCost = (n) => (this.cost[n] ? 25 : 1);
      const start = sj * cw + si, goal = gj * cw + gi;
      g[start] = 0;
      push(hfn(si, sj), start);
      const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]];
      while (heap.length) {
        const [, n] = pop();
        if (n === goal) break;
        if (closed[n]) continue;
        closed[n] = 1;
        const i = n % cw, j = (n / cw) | 0;
        for (const [di, dj, c] of dirs) {
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= cw || nj >= ch) continue;
          if (di && dj && (this.cost[j * cw + ni] || this.cost[nj * cw + i])) continue;
          const nn = nj * cw + ni;
          const ng = g[n] + c * stepCost(nn);
          if (ng < g[nn]) { g[nn] = ng; came[nn] = n; push(ng + hfn(ni, nj), nn); }
        }
      }
      const cells = [];
      for (let n = goal; n !== -1 && n !== start; n = came[n]) cells.push(n);
      cells.reverse();
      const pts = [];
      let lastDir = null;
      for (let k = 0; k < cells.length; k++) {
        const n = cells[k];
        const dir = n - (k ? cells[k - 1] : start);
        const pt = { x: ((n % cw) + 0.5) / R, y: (((n / cw) | 0) + 0.5) / R };
        if (dir === lastDir && pts.length) pts[pts.length - 1] = pt;
        else pts.push(pt);
        lastDir = dir;
      }
      if (pts.length) pts[pts.length - 1] = { x: bx, y: by };
      else pts.push({ x: bx, y: by });
      return pts;
    }
  }

  // ---------------------------------------------------------------- office

  class Office {
    constructor(root, { onHover, label, onFrame, showAgent = true, compact = false, deskCapacity = 0 } = {}) {
      this.root = root;
      this.onHover = onHover || (() => {});
      this.label = label || ((s) => s.project || s.agent);
      this.onFrame = onFrame;
      this.showAgent = showAgent;
      this.compact = compact;
      this.deskCapacity = deskCapacity;
      this.offDutyLabel = 'went home';
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'office-canvas';
      root.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      this.people = new Map();
      this.deskOf = new Map();
      this.offDuty = 0;
      this.first = true;
      this.visible = true;
      this.hit = [];
      this.hoverKey = null;
      this.t = performance.now();
      this.pal = palette();
      this.plan = this.buildPlan(0);
      this.cat = { x: this.plan.W - 3, y: this.plan.D - 2, path: [], until: 0, face: 1 };
      this.theme = matchMedia('(prefers-color-scheme: dark)');
      this.onTheme = () => (this.pal = palette());
      this.theme.addEventListener('change', this.onTheme);

      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(root);
      this.canvas.addEventListener('mousemove', (e) => this.pointer(e));
      this.canvas.addEventListener('click', (e) => this.pointer(e, true));
      this.canvas.addEventListener('mouseleave', () => { this.hoverKey = null; this.onHover(null); });
      this.resize();
      this.last = performance.now();
      // Resolves true once a few frames have been drawn with data in place,
      // false if the renderer gave up (3D load failure).
      this.ready = new Promise((ok) => (this.markReady = ok));
      this.framesShown = 0;
      const loop = (t) => { if (this.dead) return; this.frame(t); this.raf = requestAnimationFrame(loop); };
      this.raf = requestAnimationFrame(loop);
    }

    destroy() {
      this.dead = true;
      cancelAnimationFrame(this.raf);
      this.ro.disconnect();
      this.theme.removeEventListener('change', this.onTheme);
      this.canvas.remove();
    }

    // ------------------------------------------------------------ floor plan

    buildPlan() {
      const campus=window.CampusPlan.createCampusPlan(),{W,D}=campus,grid=new Grid(W,D),items=[],props=[],pois=[];
      const desks=campus.officeSeats.map(desk=>({...desk,seat:{...desk.seat}}));
      for(const desk of desks)grid.block(desk.x,desk.y,1.4,1.2,.08);
      grid.block(25,15,4,4,.15);
      items.push({roomId:'office',depth:44,draw:()=>this.drawMissionTable()});
      items.push({roomId:'office',depth:44.1,draw:()=>this.drawOxygenModule(21.9,22.2)});
      items.push({roomId:'office',depth:54,draw:()=>this.drawSpecimenModule(31.0,22.1)});
      for(const {x,y} of window.CampusPlan.getStudyDesks())items.push({roomId:'study',depth:x+y+1.7,draw:()=>this.drawStudyDesk(x,y)});
      const bookcase=window.CampusPlan.getStudyBookcase();items.push({roomId:'study',depth:bookcase.x+bookcase.y,draw:()=>this.drawBookcase(bookcase.x,bookcase.y,bookcase.width)});
      props.push({t:'mission-table',x:27,y:17},{t:'oxygen',x:21.9,y:22.2},{t:'specimen',x:31,y:22.1});
      for(const desk of desks)props.push({t:'research-station',desk});
      pois.push({x:27,y:10.4,act:'window',face:'back',sit:0});
      const officeRoom=campus.rooms.find(room=>room.id==='office');
      return {W,D,OW:W,OD:D,MR:0,PY:D,RW:0,campus,grid,items,props,pois,desks,
        windows:[],observationWindows:[{x:23.1,y:9.4,width:7.8,bottom:.68,top:2.9}],
        allObservationWindows:[{x:23.1,y:9.4,width:7.8,bottom:.68,top:2.9}],
        outline:officeRoom.outline,posters:[],pp:null,door:{...campus.spawn},fixed:true,noNap:true,noCat:true,viewH:3.4,lunarLab:true};
    }

    // ------------------------------------------------------------ sessions → people

    update(sessions) {
      // Registered employees stay at their desks even when runtime is unknown.
      // Keep legacy demo activity separate from the persistent company roster.
      sessions = [...new Map(sessions.map((s) => [s.key, s])).values()];
      const working = sessions.filter((s) => s.status === 'present' || WORKING.has(s.status));
      const off = sessions
        .filter((s) => s.status !== 'present' && !WORKING.has(s.status))
        .sort((a, b) => (b.lastEventAt || 0) - (a.lastEventAt || 0));
      const wanderers = off.slice(0, MAX_WANDERERS);
      this.offDuty = off.length - wanderers.length;

      const cap = this.plan.desks.length;
      // Scene packs have a fixed floor plan; the built-in office grows with the team.
      if (!this.plan.fixed && !this.deskCapacity && working.length > cap) {
        this.plan = this.buildPlan(working.length);
        // Desk indices and person objects survive room growth and new reports.
        for (const p of this.people.values()) { p.poi = null; p.napDesk = null; p.desk = null; p.until = 0; }
      }

      const previousSeats = this.deskOf;
      this.deskOf = new Map();
      const used = new Set();
      // Fill the desks that face us first so more faces and screens show.
      const desks = this.plan.desks;
      const order = desks.map((d, i) => i).sort((a, b) => (desks[a].side === 's') - (desks[b].side === 's') || a - b);
      // Local placements reserve exact seats, including the fixed manager seat.
      for (const s of working) {
        if (!Number.isInteger(s.seatIndex) || s.seatIndex < 0 || s.seatIndex >= desks.length || used.has(s.seatIndex)) continue;
        this.deskOf.set(s.key, s.seatIndex); used.add(s.seatIndex);
      }
      for (const s of working) {
        const seat = previousSeats.get(s.key);
        if (this.deskOf.has(s.key) || !Number.isInteger(seat) || seat >= desks.length || used.has(seat)) continue;
        this.deskOf.set(s.key, seat); used.add(seat);
      }
      for (const s of [...working].sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0))) {
        if (this.deskOf.has(s.key)) continue;
        const i = order.find((n) => !used.has(n));
        if (i == null) continue;
        this.deskOf.set(s.key, i);
        used.add(i);
      }
      const takenDesks = new Set([...this.deskOf.values()].map((i) => desks[i]));

      const shown = new Set();
      for (const s of [...working, ...wanderers]) {
        const isWorker = this.deskOf.has(s.key);
        if (!isWorker && (s.status === 'present' || WORKING.has(s.status))) continue;
        shown.add(s.key);
        let p = this.people.get(s.key);
        if (!p) { p = this.newPerson(s); this.people.set(s.key, p); }
        p.s = s;
        p.leaving = false;
        if (isWorker) {
          this.release(p);
          const desk = desks[this.deskOf.get(s.key)];
          if (s.status === 'present') {
            p.desk = desk;
            p.x = desk.seat.x; p.y = desk.seat.y;
            p.path = []; p.placeOnArrive = false;
          } else if (p.desk !== desk || p.mode !== 'work') { p.desk = desk; this.goTo(p, desk.seat); }
          p.mode = 'work';
        } else {
          if (p.mode !== 'wander') { p.mode = 'wander'; p.desk = null; p.poi = null; p.until = 0; }
          // Someone started working at the desk this one was napping on.
          if (p.napDesk && takenDesks.has(p.napDesk)) { this.release(p); p.path = []; }
        }
      }
      for (const [k, p] of this.people) {
        if (!shown.has(k) && !p.leaving) {
          if (p.s.status === 'present') {
            this.release(p);
            this.people.delete(k);
            continue;
          }
          p.leaving = true;
          p.mode = 'leave';
          this.release(p);
          p.desk = null;
          this.goTo(p, this.plan.door);
        }
      }
      this.first = false;
    }

    release(p) {
      if (p.poi) { p.poi.taken = null; p.poi = null; }
      if (p.napDesk) { p.napDesk.napper = null; p.napDesk = null; }
    }

    newPerson(s) {
      const h = hash(String(s.appearanceSeed ?? s.key));
      const door = this.plan.door;
      return {
        key: s.key, h, s,
        skin: pick(SKIN, h, 3), hair: pick(HAIR, h, 7), pants: pick(PANTS, h, 13),
        shirt: pick(SHIRT[s.agent] || SHIRT.claude, h, 11),
        hairStyle: h % 4,
        phase: (h % 1000) / 1000 * Math.PI * 2,
        x: door.x, y: door.y,
        path: [], walkFace: 'front', until: 0, mode: null,
        // On the first snapshot everyone is placed directly, no stampede.
        placeOnArrive: this.first,
      };
    }

    goTo(p, target) {
      if (p.placeOnArrive) {
        p.x = target.x; p.y = target.y; p.path = []; p.placeOnArrive = false;
        return;
      }
      p.path = this.plan.grid.path(p.x, p.y, target.x, target.y);
    }

    wander(p, now) {
      if (p.path.length) return;
      if (p.poi && now < p.until) return;
      this.release(p);
      const plan = this.plan;
      const workingDesks = new Set([...this.deskOf.values()].map((i) => plan.desks[i]));
      const sleepy = p.s.status === 'idle';
      const weighted = [];
      for (const q of plan.pois) {
        if (q.taken) continue;
        let w = 1;
        if (q.pair) w = plan.pois.some((o) => o.pair === q.pair && o !== q && o.taken) ? 7 : 1.2;
        if (q.act === 'couch' || q.act === 'beanbag' || q.sleepy) w = sleepy ? 3 : 1.4;
        weighted.push([q, w]);
      }
      for (const d of plan.noNap ? [] : plan.desks) {
        if (workingDesks.has(d) || d.napper) continue;
        weighted.push([{ x: d.seat.x, y: d.seat.y, act: 'nap', face: d.side === 'n' ? 'front' : 'back', sit: 0.34, desk: d }, sleepy ? 3 : 0.25]);
      }
      if (!weighted.length) return;
      let r = Math.random() * weighted.reduce((a, [, w]) => a + w, 0);
      let choice = weighted[0][0];
      for (const [q, w] of weighted) { r -= w; if (r <= 0) { choice = q; break; } }
      if (choice.desk) { choice.desk.napper = p.key; p.napDesk = choice.desk; }
      choice.taken = p.key;
      p.poi = choice;
      p.until = Infinity; // set on arrival
      p.stay = (choice.act === 'nap' ? rand(25, 60) : choice.act === 'pingpong' ? rand(15, 30) : rand(8, 20)) * 1000;
      this.goTo(p, choice);
    }

    setVisible(v) { this.visible = v; if (v) this.resize(); }

    // Room on the right covered by an overlay (the agent panel). The canvas
    // keeps its size; the view eases over so the room stays centred in what
    // is still visible, instead of the canvas resizing under the slide.
    setInset(px, animate = true) {
      const now = performance.now();
      this.insetFrom = animate ? this.inset(now) : px;
      this.insetTo = px;
      this.insetT0 = animate ? now : -Infinity;
    }
    inset(now = performance.now()) {
      if (this.insetTo == null) return 0;
      const k = Math.min(1, (now - this.insetT0) / 340);
      const e = 1 - Math.pow(1 - k, 3); // ease out, like the panel's slide
      return this.insetFrom + (this.insetTo - this.insetFrom) * e;
    }
    insetMoving(now = performance.now()) { return this.insetTo != null && now - this.insetT0 < 360; }

    // ------------------------------------------------------------ camera / input

    resize() {
      const r = this.root.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.cw = Math.max(this.compact ? 1 : 200, r.width);
      this.ch = Math.max(this.compact ? 1 : 240, r.height);
      this.canvas.width = Math.round(this.cw * dpr);
      this.canvas.height = Math.round(this.ch * dpr);
      this.canvas.style.width = this.cw + 'px';
      this.canvas.style.height = this.ch + 'px';
      this.dpr = dpr;
    }

    fitCamera() {
      const { W, D } = this.plan;
      const left = this.iso(0, D, 0).x, right = this.iso(W, 0, 0).x;
      const top = this.iso(0, 0, WALL_H).y - 20, bottom = this.iso(W, D, 0).y + 10;
      const inset = this.inset();
      const vw = Math.max(120, this.cw - inset);
      const zoom = Math.min(vw / (right - left + 30), this.ch / (bottom - top + 30), 2);
      const want = { zoom, ox: vw / 2 - ((left + right) / 2) * zoom, oy: this.ch / 2 - ((top + bottom) / 2) * zoom };
      // While the inset eases, follow it exactly; otherwise settle gently.
      if (!this.cam || this.insetMoving()) this.cam = want;
      else for (const k of ['zoom', 'ox', 'oy']) this.cam[k] += (want[k] - this.cam[k]) * 0.1;
    }

    pointer(e, click) {
      const r = this.canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      let found = null;
      for (let i = this.hit.length - 1; i >= 0; i--) {
        const h = this.hit[i];
        if (mx >= h.x0 && mx <= h.x1 && my >= h.y0 && my <= h.y1) { found = h; break; }
      }
      const key = found ? found.key : null;
      const self=this.campusAvatarHit;
      if(!key&&self&&mx>=self.x0&&mx<=self.x1&&my>=self.y0&&my<=self.y1){
        this.canvas.style.cursor='pointer';
        if(click&&typeof CustomEvent==='function')this.root.dispatchEvent(new CustomEvent('campus-avatar-request'));
        return;
      }
      // Employee hit boxes always win over room labels behind them.
      const roomHit=!key&&(this.campusRoomHits||[]).find(hit=>mx>=hit.x0&&mx<=hit.x1&&my>=hit.y0&&my<=hit.y1);
      this.canvas.style.cursor = key||roomHit ? 'pointer' : 'default';
      if(roomHit){
        if(this.hoverKey!==null){this.hoverKey=null;this.onHover(null,{x:e.clientX,y:e.clientY},false);}
        if(click&&typeof CustomEvent==='function')this.root.dispatchEvent(new CustomEvent('campus-room-request',{detail:{roomId:roomHit.roomId}}));
        return;
      }
      if (key !== this.hoverKey || click) {
        this.hoverKey = key;
        const p = key && this.people.get(key);
        this.onHover(p ? p.s : null, { x: e.clientX, y: e.clientY }, !!click);
      }
    }

    visibleCampusRoom() {
      const id=this.getCampusVisibleRoom?.()||this.campusAvatar?.roomId||'office';
      return this.plan.campus?.rooms.some(room=>room.id===id)?id:'office';
    }

    campusExit() {
      const visible=this.visibleCampusRoom(),link=this.plan.campus?.corridors.find(c=>c.from===visible||c.to===visible);
      if(!link)return null;
      const targetId=link.from===visible?link.to:link.from,door=link.from===visible?link.path[0]:link.path.at(-1);
      const target=this.plan.campus.rooms.find(room=>room.id===targetId);
      const occupancy=this.campusOccupancy?.[targetId];
      const count=targetId==='office'?'직원 '+(Number.isInteger(occupancy?.employeeCount)?Math.max(0,occupancy.employeeCount):this.people.size)+'명':Number.isInteger(occupancy?.participantCount)?'참여 '+Math.max(0,occupancy.participantCount)+'명':'참여 인원 확인 전';
      return {roomId:targetId,name:target.name,x:door.x,y:door.y,count};
    }

    projectCampusLabel(exit) {
      const p=this.iso(exit.x,exit.y,2.35);
      return{x:p.x*this.cam.zoom+this.cam.ox,y:p.y*this.cam.zoom+this.cam.oy};
    }

    drawCampusRoomLabels() {
      this.campusRoomHits=[];
      if(!this.plan.campus||!this.cam&&!this.gl)return;
      const exit=this.campusExit();if(!exit)return;
      const p=this.projectCampusLabel(exit);if(!p)return;
      const c=this.ctx,available=Math.max(110,this.cw-(this.inset?.()||0));
      const label=(exit.roomId==='office'?'내 사무실':exit.name)+' · '+exit.count;
      c.save();c.setTransform(this.dpr,0,0,this.dpr,0,0);c.font='500 11px LocalKR,sans-serif';
      const w=Math.min(210,available-16,c.measureText(label).width+26),h=30;
      const x=Math.max(8,Math.min(available-w-8,p.x-w/2)),y=Math.max(12,Math.min(this.ch-h-12,p.y-62));
      this.roundRect(x,y,w,h,6,'rgba(12,23,34,.92)','#668a9d');
      c.fillStyle='#c6dbe8';c.textAlign='center';c.textBaseline='middle';c.fillText(label,x+w/2,y+h/2,w-16);
      this.campusRoomHits.push({roomId:exit.roomId,x0:x,x1:x+w,y0:y-6,y1:y+h+6});c.restore();
    }

    iso(x, y, z = 0) {
      return { x: (x - y) * TW / 2, y: (x + y) * TH / 2 - z * TH };
    }

    // ------------------------------------------------------------ primitives

    poly(pts, fill, stroke) {
      const c = this.ctx;
      c.beginPath();
      pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.closePath();
      if (fill) { c.fillStyle = fill; c.fill(); }
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
    }

    box(x, y, z, w, d, h, top, left, right) {
      const P = (a, b, cc) => this.iso(a, b, cc);
      this.poly([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], left);
      this.poly([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], right);
      this.poly([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], top);
    }

    shade(color, amt) {
      if (color[0] !== '#') return color;
      const n = parseInt(color.slice(1), 16);
      const f = (v) => clamp(Math.round(v + amt), 0, 255);
      return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
    }

    roundRect(x, y, w, h, r, fill, stroke) {
      const c = this.ctx;
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
      if (fill) { c.fillStyle = fill; c.fill(); }
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.5; c.stroke(); }
    }

    // Draw flat things on a wall: 'y0' = back wall (runs along x),
    // 'x0' = left wall (runs along y).
    onWall(dir, a, z, fn) {
      const c = this.ctx;
      const o = dir === 'y0' ? this.iso(a, 0, z) : this.iso(0, a, z);
      c.save();
      c.translate(o.x, o.y);
      c.transform(1, dir === 'y0' ? 0.5 : -0.5, 0, 1, 0, 0);
      fn(c);
      c.restore();
    }

    // ------------------------------------------------------------ room shell

    getCampusInteriorItems(roomId=this.visibleCampusRoom()) {
      const source=typeof this.campusInteriorItems==='function'?this.campusInteriorItems(roomId):this.campusInteriorItems;
      return (Array.isArray(source)?source:window.CampusInterior?.getCampusInterior?.(roomId)||window.CampusPlan?.getCampusInterior?.(roomId)||[]).filter(item=>!item.roomId||item.roomId===roomId);
    }

    projectInteriorPoint(item) {
      if(!item||!this.cam)return null;
      const p=this.iso(item.x+item.w/2,item.y+item.d/2,(item.y0||0)+Math.min(1.1,(item.height||1)*.65));
      return{x:p.x*this.cam.zoom+this.cam.ox,y:p.y*this.cam.zoom+this.cam.oy,radius:Math.max(18,Math.min(44,(item.w+item.d)*16*this.cam.zoom))};
    }

    triggerInteriorEffect(id) {
      this.campusInteriorEffects ||= new Map();
      this.campusInteriorEffects.set(id,{startedAt:Date.now()});this.draw();return true;
    }

    interiorEffect(item) {
      const value=this.campusInteriorEffects?.get?.(item.id),started=typeof value==='number'?value:value?.startedAt;
      const elapsed=Number.isFinite(started)?(Date.now()-started)/1000:Infinity;
      return elapsed>=0&&elapsed<4?elapsed:null;
    }

    drawInteriorLightPools(roomId,items) {
      const mode=this.environmentLighting||'bright',c=this.ctx,room=this.plan.campus?.rooms.find(value=>value.id===roomId);
      if(!room)return;
      c.save();c.beginPath();(room.indoorOutline||room.outline).forEach(([x,y],i)=>{const p=this.iso(x,y,.02);i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y);});c.closePath();c.clip();
      if(mode==='night'){c.fillStyle='rgba(22,43,69,.20)';c.fill();}
      const pool=(x,y,radius,color,opacity)=>{const p=this.iso(x,y,.035),g=c.createRadialGradient(p.x,p.y,2,p.x,p.y,radius);g.addColorStop(0,'rgba('+color+','+opacity+')');g.addColorStop(1,'rgba('+color+',0)');c.save();c.translate(p.x,p.y);c.scale(1,.5);c.translate(-p.x,-p.y);c.fillStyle=g;c.beginPath();c.arc(p.x,p.y,radius,0,Math.PI*2);c.fill();c.restore();};
      const desks=roomId==='office'?this.plan.desks:window.CampusPlan?.getStudyDesks?.()||[];
      for(const desk of desks)pool(desk.x+.55,desk.y+.65,58,'255,206,133',mode==='night'?.36:mode==='normal'?.16:.035);
      for(const item of items)if(/lamp|light/.test(item.type))pool(item.x+item.w/2,item.y+item.d/2,76,'255,213,153',mode==='night'?.3:mode==='normal'?.17:.04);
      pool(room.center.x,room.center.y,200,'203,224,240',mode==='night'?.045:mode==='normal'?.12:.08);
      c.restore();
    }

    drawInteriorTaskLamp(x,y,z=.9) {
      const c=this.ctx,mode=this.environmentLighting||'bright',base=this.iso(x,y,z),head=this.iso(x+.12,y,z+.49);
      this.box(x-.12,y-.10,z,.24,.2,.04,'#92a3a6','#566e7b','#3d5667');
      c.save();c.lineWidth=2.8;c.strokeStyle='#586f7a';c.beginPath();c.moveTo(base.x,base.y-2);c.lineTo(head.x-4,head.y+3);c.lineTo(head.x+5,head.y);c.stroke();
      c.fillStyle=mode==='night'?'#ffe1a0':mode==='normal'?'#fff0c8':'#d6e4e7';c.beginPath();c.ellipse(head.x+5,head.y+1,8,3,.1,0,Math.PI*2);c.fill();
      if(mode!=='bright'){c.fillStyle=mode==='night'?'rgba(255,216,147,.14)':'rgba(255,230,183,.08)';c.beginPath();c.moveTo(head.x-3,head.y+3);c.lineTo(base.x-16,base.y+4);c.lineTo(base.x+18,base.y+4);c.lineTo(head.x+12,head.y+3);c.closePath();c.fill();}
      c.restore();
    }

    drawCampusInteriorItem(item) {
      const {x,y,w,d}=item,c=this.ctx,type=String(item.type||''),height=item.height||1,cx=x+w/2,cy=y+d/2,effect=this.interiorEffect(item),P=(a,b,z=0)=>this.iso(a,b,z);
      if(type==='rug'||type==='carpet'){
        this.poly([P(x,y,.015),P(x+w,y,.015),P(x+w,y+d,.015),P(x,y+d,.015)],'#45616c','#71919c');
        this.poly([P(x+.08,y+.08,.018),P(x+w-.08,y+.08,.018),P(x+w-.08,y+d-.08,.018),P(x+.08,y+d-.08,.018)],null,'#6e8994');return;
      }
      if(/plant|planter|terrarium/.test(type)){
        const color=item.color||'#638f79',potH=Math.min(.46,height*.3);this.box(x,y,.02,w,d,potH,'#c5d0c7','#7f9c9c','#597b88');
        const b=P(cx,cy,potH),sway=Math.sin(this.t/1700+cx)*.05+(effect===null?0:Math.sin(effect*8)*.12),leafH=Math.max(14,height*24),radius=Math.max(9,w*22);
        c.save();c.fillStyle=color;
        for(let n=0;n<7;n++){const angle=n*Math.PI*2/7;c.beginPath();c.ellipse(b.x+Math.cos(angle)*radius*.35,b.y-leafH*.62+Math.sin(angle)*4,radius*.34,leafH*.62,Math.sin(angle)*.5+sway,0,Math.PI*2);c.fill();}
        c.fillStyle='#8bb29a';c.beginPath();c.ellipse(b.x,b.y-leafH*.8,radius*.22,leafH*.45,sway,0,Math.PI*2);c.fill();
        if(effect!==null){c.fillStyle='#acdff2';for(let n=0;n<5;n++){const drop=(effect*19+n*7)%27;c.beginPath();c.ellipse(b.x-14+n*7,b.y-leafH-13+drop,1.6,3.2,0,0,Math.PI*2);c.fill();}}
        c.restore();return;
      }
      if(/sofa|couch|lounge/.test(type)){
        this.box(x,y,.10,w,d,.34,'#9bb3b7','#6b8b97','#4d6f80');
        this.box(x,y,.39,w,.18,.43,'#a8bdbe','#718f99','#58798b');
        for(const ax of[x,x+w-.15])this.box(ax,y,.3,.15,d,.35,'#adc0bf','#78949d','#5c7c8b');
        for(let n=0;n<2;n++)this.box(x+.25+n*Math.max(.5,(w-.8)/2),y+.2,.44,Math.min(.55,w*.24),Math.min(.42,d*.5),.12,n?'#d6b47d':'#89abbc','#6c8e9d','#557586');return;
      }
      if(type==='lamp'||/floor.?lamp|standing.?lamp/.test(type)){
        const b=P(cx,cy,.04),head=P(cx,cy,height),on=this.environmentLighting!=='bright';
        c.save();c.strokeStyle='#738c95';c.lineWidth=2.6;c.beginPath();c.moveTo(b.x,b.y);c.lineTo(head.x,head.y);c.stroke();c.fillStyle='#567582';c.beginPath();c.ellipse(b.x,b.y,10,5,0,0,Math.PI*2);c.fill();c.fillStyle=on?'#ffdfa8':'#c5d2d1';c.beginPath();c.moveTo(head.x-12,head.y+5);c.lineTo(head.x+12,head.y+5);c.lineTo(head.x+6,head.y-9);c.lineTo(head.x-6,head.y-9);c.closePath();c.fill();c.restore();return;
      }
      if(type==='coffee'||type==='pantry'){
        this.box(x,y,.03,w,d,.79,'#d9d5c6','#8a9b9b','#5d7a8b');this.box(x-.03,y-.03,.82,w+.06,d+.06,.06,'#dce1d7','#a4b5b5','#6e8e9d');
        this.coffeeMachine(x+.12,y+.06);
        for(let n=0;n<3;n++)this.box(x+Math.min(w-.18,.85+n*.19),y+d*.6,.9,.13,.13,.12,'#e8e7d7','#abb8b4','#708b96');
        if(effect!==null){const p=P(x+.45,y+.35,1.5);c.save();c.strokeStyle='rgba(230,241,238,.7)';c.lineWidth=2;for(let n=0;n<3;n++){c.beginPath();c.moveTo(p.x+n*5-5,p.y);c.bezierCurveTo(p.x+Math.sin(effect*4+n)*5+n*5-5,p.y-7,p.x+n*5+3,p.y-13,p.x+n*5-5,p.y-20-effect*4);c.stroke();}c.restore();}return;
      }
      if(type==='books'){
        for(let n=0;n<3;n++)this.box(x+n*.025,y+n*.02,.02+n*height/3,w-n*.025,d-n*.02,height/3,['#93b5be','#c8b07f','#b3c4b3'][n],'#7d969f','#506f83');return;
      }
      if(/bookcase|shelf/.test(type)){
        this.box(x,y,.02,w,d,height,'#a4b8b9','#708d99','#4e7084');
        for(let row=0;row<2;row++){
          const z=.12+row*(height*.45);this.box(x+.07,y+d*.55,z,w-.14,d*.46,.06,'#c6d3c9','#8da5aa','#5a7b8e');
          for(let n=0;n<Math.floor(w/.25)-1;n++)this.box(x+.14+n*.25,y+d*.58,z+.07,.13,d*.35,Math.min(.32,height*.3),['#86aec0','#c1aa78','#9db49e'][n%3]);
        }return;
      }
      if(/table|bench/.test(type)){
        const h=Math.min(.54,height);for(const ax of[x+.1,x+w-.2])this.box(ax,y+.1,0,.1,Math.max(.1,d-.2),h,'#849b9f','#557381','#3f5d72');this.box(x,y,h,w,d,.08,'#cfd6c9','#98acad','#668697');
        this.box(x+.15,y+.15,h+.09,Math.min(.5,w*.25),Math.min(.36,d*.55),.06,'#c58f71','#9d7465','#765d59');return;
      }
      if(/telescope/.test(type)){
        const stand=P(cx,cy,.1),joint=P(cx,cy,1.15);c.save();c.strokeStyle='#7f9ca7';c.lineWidth=3;
        for(const[dx,dy]of[[-.35,.15],[.35,.15],[0,-.32]]){const foot=P(cx+dx,cy+dy,.02);c.beginPath();c.moveTo(joint.x,joint.y);c.lineTo(foot.x,foot.y);c.stroke();}
        const angle=effect===null?-.35:-.35+Math.sin(effect*2)*.14;c.translate(joint.x,joint.y-10);c.rotate(angle);c.strokeStyle='#c5d8da';c.lineWidth=11;c.beginPath();c.moveTo(-18,0);c.lineTo(18,0);c.stroke();c.fillStyle='#224e67';c.beginPath();c.ellipse(19,0,4,7,0,0,Math.PI*2);c.fill();c.fillStyle='#9fd8e8';c.beginPath();c.ellipse(20,0,2,4,0,0,Math.PI*2);c.fill();c.restore();return;
      }
      if(/rocket/.test(type)){
        this.box(x,y,.02,w,d,.38,'#a9bbc0','#6b8c9d','#48697f');const lift=effect===null?0:Math.sin(Math.min(1,effect/2.8)*Math.PI)*1.5,p=P(cx,cy,.45+lift);
        c.save();c.translate(p.x,p.y);c.fillStyle='#dce7e5';c.beginPath();c.moveTo(-7,-4);c.lineTo(-7,-29);c.quadraticCurveTo(0,-43,7,-29);c.lineTo(7,-4);c.closePath();c.fill();c.fillStyle='#71bad6';c.beginPath();c.arc(0,-25,3,0,Math.PI*2);c.fill();c.fillStyle='#698c9c';c.beginPath();c.moveTo(-7,-13);c.lineTo(-13,-2);c.lineTo(-7,-2);c.moveTo(7,-13);c.lineTo(13,-2);c.lineTo(7,-2);c.fill();if(effect!==null){c.fillStyle='#f1c46f';c.beginPath();c.moveTo(-4,-4);c.lineTo(0,7+Math.sin(effect*30)*3);c.lineTo(4,-4);c.fill();}c.restore();return;
      }
      if(/globe|orrery/.test(type)){
        this.box(cx-.07,cy-.07,0,.14,.14,.58,'#8caaa9','#5e7f8a','#426575');const p=P(cx,cy,.93);c.save();c.fillStyle='#6cabc4';c.beginPath();c.arc(p.x,p.y,18,0,Math.PI*2);c.fill();c.save();c.beginPath();c.arc(p.x,p.y,18,0,Math.PI*2);c.clip();c.fillStyle='#98b79f';const turn=this.t/4000+(effect===null?0:effect*2);for(let n=0;n<3;n++){c.beginPath();c.ellipse(p.x+Math.sin(turn+n*2)*16,p.y-7+n*7,9,4,n*.5,0,Math.PI*2);c.fill();}c.restore();c.strokeStyle='#cbdab9';c.lineWidth=2;c.beginPath();c.ellipse(p.x,p.y,23,8,-.35,0,Math.PI*2);c.stroke();c.restore();return;
      }
      if(/arcade|game/.test(type)){
        const h=height;this.box(x,y,.02,w,d,h,'#687f9c','#425c79','#304a66');
        const fy=y+d+.012;this.poly([P(x+w*.12,fy,h*.47),P(x+w*.88,fy,h*.47),P(x+w*.88,fy,h*.82),P(x+w*.12,fy,h*.82)],'#102f49','#8bbcd0');
        c.save();c.fillStyle='#9bdcef';const speed=effect===null?1:4;for(let n=0;n<7;n++){const p=P(x+w*(.18+n*.1),fy,h*(.52+((n*.13+this.t/10000*speed)%.24)));c.fillRect(p.x-1,p.y-1,2,2);}c.restore();
        this.box(x,y+d,.35*h,w,.18,.07,'#8baabd','#5c7d92','#3c5d76');return;
      }
      if(/board|display|mission/.test(type)){
        this.box(x,y,.03,w,d,.25,'#7795a0','#4b6f82','#35586f');this.box(x,y,.28,w,Math.min(.22,d),height-.28,'#c3d3d0','#87a3ad','#628391');
        for(let n=0;n<4;n++)this.box(x+.13+n*Math.max(.16,(w-.4)/4),y+Math.min(.22,d)+.01,height*.54,.12,.025,.2,['#91c9dd','#dcb775','#a5bd9b','#b6a3c0'][n]);return;
      }
      this.box(x,y,.02,w,d,Math.min(.7,height),'#a9bfc2','#7493a0','#4f7288');
    }

    studyTerraceBounds(room) {
      const terrace=room?.terrace;if(!terrace)return null;
      const b=terrace.bounds||terrace,minX=b.minX??b.x??0,minY=b.minY??b.y??21.739;
      const maxX=b.maxX??minX+(b.w??7.8),maxY=b.maxY??minY+(b.d??3.861);
      return{minX,minY,maxX,maxY};
    }

    drawStudyTerraceFloor(room) {
      const b=this.studyTerraceBounds(room);if(!b)return;
      const P=(x,y,z=0)=>this.iso(x,y,z),{minX,minY,maxX,maxY}=b;
      this.poly([P(minX,minY,.01),P(maxX,minY,.01),P(maxX,maxY,.01),P(minX,maxY,.01)],'#8c8c7b','#b6b8a2');
      for(let y=minY;y<maxY-.01;y+=.28){
        const next=Math.min(maxY,y+.26),index=Math.floor((y-minY)/.28);
        this.poly([P(minX+.025,y+.01,.018),P(maxX-.025,y+.01,.018),P(maxX-.025,next,.018),P(minX+.025,next,.018)],index%3===0?'#a4a08b':index%3===1?'#999783':'#918f7d');
      }
      if(this.environmentLighting!=='bright'){
        const c=this.ctx,mode=this.environmentLighting;
        c.save();c.beginPath();[P(minX,minY,.03),P(maxX,minY,.03),P(maxX,maxY,.03),P(minX,maxY,.03)].forEach((point,index)=>index?c.lineTo(point.x,point.y):c.moveTo(point.x,point.y));c.closePath();c.clip();
        const lamps=this.getCampusInteriorItems('study').filter(item=>item.type==='lamp'&&item.y>=minY);
        for(const item of lamps){const at=P(item.x+item.w/2,item.y+item.d/2,.035),radius=65,g=c.createRadialGradient(at.x,at.y,0,at.x,at.y,radius);g.addColorStop(0,mode==='night'?'rgba(255,211,145,.28)':'rgba(255,224,172,.14)');g.addColorStop(1,'rgba(255,216,154,0)');c.save();c.translate(at.x,at.y);c.scale(1,.5);c.translate(-at.x,-at.y);c.fillStyle=g;c.beginPath();c.arc(at.x,at.y,radius,0,Math.PI*2);c.fill();c.restore();}
        c.restore();
      }
      // The entire indoor/deck seam stays flush and open; only a slim material transition is visible.
      this.poly([P(minX,minY-.025,.022),P(maxX,minY-.025,.022),P(maxX,minY+.025,.022),P(minX,minY+.025,.022)],'#bbcac5');
    }

    studyTerraceRails(room) {
      const b=this.studyTerraceBounds(room);if(!b)return [];
      const {minX,minY,maxX,maxY}=b;
      return[[[minX,minY],[minX,maxY]],[[minX,maxY],[maxX,maxY]],[[maxX,maxY],[maxX,minY]]];
    }

    drawStudyTerraceRail(a,b) {
      const P=(x,y,z=0)=>this.iso(x,y,z),c=this.ctx,length=Math.hypot(b[0]-a[0],b[1]-a[1]);
      this.poly([P(a[0],a[1],.12),P(b[0],b[1],.12),P(b[0],b[1],.95),P(a[0],a[1],.95)],'rgba(170,213,220,.075)','#80a7b8');
      this.poly([P(a[0],a[1],.96),P(b[0],b[1],.96),P(b[0],b[1],1),P(a[0],a[1],1)],'#a9c2c7');
      const count=Math.max(1,Math.ceil(length/2.8));
      for(let n=0;n<=count;n++){
        const x=a[0]+(b[0]-a[0])*n/count,y=a[1]+(b[1]-a[1])*n/count;
        this.box(x-.035,y-.035,0,.07,.07,1.02,'#a7bec2','#718e9d','#486779');
        if(n===0||n===count){
          const top=P(x,y,1.035),on=this.environmentLighting!=='bright';
          c.save();c.fillStyle=on?'#ffe6b5':'#bdd1cd';c.beginPath();c.ellipse(top.x,top.y,3.4,2.1,0,0,Math.PI*2);c.fill();c.restore();
        }
      }
    }

    drawRoom() {
      const P=(x,y,z=0)=>this.iso(x,y,z),c=this.ctx;
      const visible=this.visibleCampusRoom();
      for(const room of this.plan.campus.rooms.filter(room=>room.id===visible)){
        const outline=room.outline,indoor=room.indoorOutline||outline,upper=outline.map(([x,y])=>P(x,y)),lower=outline.map(([x,y])=>P(x,y,-.3));
        this.poly(outline.map(([x,y])=>P(x+.25,y+.25,-.45)),'rgba(0,0,0,.23)');
        for(let i=0;i<outline.length;i++){const j=(i+1)%outline.length;this.poly([lower[i],lower[j],upper[j],upper[i]],i<3?'#2e4b60':'#1d3448');}
        this.poly(upper,room.id==='office'?'#5a7584':'#647e89','#9fb9c5');
        const tileArea=indoor.map(([x,y])=>P(x,y));
        c.save();c.beginPath();tileArea.forEach((pt,i)=>i?c.lineTo(pt.x,pt.y):c.moveTo(pt.x,pt.y));c.closePath();c.clip();
        for(let x=room.bounds.minX;x<room.bounds.maxX;x+=1.5)for(let y=room.bounds.minY;y<room.bounds.maxY;y+=1.5)this.poly([P(x+.035,y+.035),P(x+1.46,y+.035),P(x+1.46,y+1.46),P(x+.035,y+1.46)],null,'rgba(38,65,84,.3)');
        c.restore();
        if(room.id==='study')this.drawStudyTerraceFloor(room);
        const wall=(a,b)=>{this.poly([P(...a),P(...b),P(b[0],b[1],3.2),P(a[0],a[1],3.2)],'#c9d8d9','#7193a4');this.poly([P(a[0],a[1],3.1),P(b[0],b[1],3.1),P(b[0],b[1],3.16),P(a[0],a[1],3.16)],'#b3e1e8');};
        const windowWall=(a,b)=>{
          const point=t=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
          this.poly([P(...a,.02),P(...b,.02),P(b[0],b[1],.38),P(a[0],a[1],.38)],'#a4bbc0','#688b9b');
          this.poly([P(a[0],a[1],.46),P(b[0],b[1],.46),P(b[0],b[1],3.08),P(a[0],a[1],3.08)],'rgba(167,212,221,.045)','#98b9c4');
          this.poly([P(a[0],a[1],3.08),P(b[0],b[1],3.08),P(b[0],b[1],3.22),P(a[0],a[1],3.22)],'#b6cccd','#6f94a5');
          const divisions=Math.max(2,Math.round(Math.hypot(b[0]-a[0],b[1]-a[1])/3.2));
          for(let n=0;n<=divisions;n++){
            const [x,y]=point(n/divisions);this.box(x-.025,y-.025,.38,.05,.05,2.76,'#bad1d0','#83a7b4','#5e839a');
          }
          this.poly([P(a[0],a[1],.39),P(b[0],b[1],.39),P(b[0],b[1],.45),P(a[0],a[1],.45)],'#cfddd4');
        };
        if(room.id==='office'){
          const wx=23.1,wy=9.4,ww=7.8;
          wall(indoor[0],[wx,wy]);wall([wx+ww,wy],indoor[1]);
          for(const [bottom,top]of[[0,.68],[2.9,3.2]])this.poly([P(wx,wy,bottom),P(wx+ww,wy,bottom),P(wx+ww,wy,top),P(wx,wy,top)],'#c9d8d9','#7193a4');
        }else windowWall(indoor[0],indoor[1]);
        const leftTip=indoor[5],back=indoor[0],length=Math.hypot(back[0]-leftTip[0],back[1]-leftTip[1]);
        const leftStart=[leftTip[0]+(back[0]-leftTip[0])/length*1.2,leftTip[1]+(back[1]-leftTip[1])/length*1.2];
        if(room.id==='study')windowWall(leftStart,back);else wall(leftStart,back);
        for(const index of[0,1,4]){const[x,y]=indoor[index];this.box(x-.06,y-.06,0,.12,.12,3.3,'#e0e7e1','#819dac','#58798e');}
        for(let i=1;i<indoor.length;i++){if(room.id==='study'&&room.terrace&&i===3)continue;const a=indoor[i],b=indoor[(i+1)%indoor.length];this.poly([P(a[0],a[1],.02),P(b[0],b[1],.02),P(b[0],b[1],.07),P(a[0],a[1],.07)],'#9ed3df');}
        const tag=P(room.center.x,room.bounds.minY,3.22);c.fillStyle='#b2d2df';c.font='600 10px ui-monospace,monospace';c.textAlign='center';c.fillText(room.id==='office'?'01 / PERSONAL OFFICE':'02 / STUDY LOUNGE',tag.x,tag.y-5);
        const exit=this.campusExit();if(exit){const x=exit.x,y=exit.y;
          this.box(x-.11,y-.86,.02,.18,.14,1.9,'#a3bfc8','#557d92','#375e77');this.box(x-.11,y+.72,.02,.18,.14,1.9,'#a3bfc8','#557d92','#375e77');
          this.poly([P(x,y-.7,.04),P(x,y+.7,.04),P(x,y+.7,1.86),P(x,y-.7,1.86)],'#365971','#9fc5d0');
          this.poly([P(x+.015,y-.02,.05),P(x+.015,y+.02,.05),P(x+.015,y+.02,1.86),P(x+.015,y-.02,1.86)],'#8abac9');
        }
      }
      if(visible==='office'){const wx=23.1,wy=9.4,ww=7.8;
      this.poly([P(wx-.09,wy,.54),P(wx+ww+.09,wy,.54),P(wx+ww+.09,wy,3.02),P(wx-.09,wy,3.02)],null,'#7ba6ba');
      this.poly([P(wx,wy,.68),P(wx+ww,wy,.68),P(wx+ww,wy,2.9),P(wx,wy,2.9)],'rgba(125,177,198,.13)');
      this.poly([P(wx,wy+.03,.53),P(wx+ww,wy+.03,.53),P(wx+ww,wy+.03,.59),P(wx,wy+.03,.59)],'#d5b06b');
      for(const ox of[ww/3,ww*2/3])this.poly([P(wx+ox-.025,wy+.035,.68),P(wx+ox+.025,wy+.035,.68),P(wx+ox+.025,wy+.035,2.9),P(wx+ox-.025,wy+.035,2.9)],'#537f98');
      this.box(wx-.08,wy-.04,.48,ww+.16,.25,.12,'#c8d7d6','#8aa9b7','#5a829d');}
      // A clear center aisle stays open between reading desks and lesson tables.
      for(const room of this.plan.campus.rooms.filter(room=>room.id===visible)){const {x,y}=room.center;this.poly([P(x-2.1,y-1.05),P(x+2.1,y-1.05),P(x+2.1,y+1.05),P(x-2.1,y+1.05)],'rgba(28,67,91,.13)');}
    }

    drawStudyDesk(x,y) {
      this.box(x,y,0,2.8,1.2,.08,'#385c70','#28485e','#203f55');
      for(const ox of[.15,2.5])this.box(x+ox,y+.12,.08,.15,.95,.65,'#92abb4','#638596','#456a81');
      this.box(x-.07,y-.06,.73,2.94,1.32,.10,'#dfdfcd','#afbebc','#819ca6');
      this.box(x+.25,y+.24,.84,.58,.42,.055,'#80b6c9','#5f8fa9','#426e8a');
      this.box(x+1.7,y+.22,.84,.6,.4,.04,'#bdcdd2','#8ca5b3','#62869d');
      for(const ox of[.7,2.1])this.box(x+ox-.23,y+1.35,.1,.46,.46,.36,'#7094a6','#4f748b','#345b76');
    }

    drawBookcase(x,y,width) {
      this.box(x,y,0,width,.45,1.9,'#d0dcda','#8da7b1','#5d8095');
      for(let row=0;row<3;row++)for(let i=0;i<Math.floor(width*3);i++)this.box(x+.12+i*.30,y+.40,.2+row*.53,.20,.10,.35,['#8bc1d2','#d1b279','#a8bdb8','#c7d3cf'][i%4],'#678b9c','#466e87');
    }

    applyCampusVisitorAppearance(person,profile={}) {
      if(window.OfficeAppearance?.appearanceValues)Object.assign(person,window.OfficeAppearance.appearanceValues(profile));
      const model=Number.isInteger(profile.model)&&profile.model>=0&&profile.model<=5?profile.model:null;
      person.avatarModel=model;person.avatarGender=profile.gender==='female'?'female':'male';
      person.heldItem=['coffee','book'].includes(profile.heldItem)?profile.heldItem:'none';
      return person;
    }

    drawCampusVisitorHair(person,hy,front) {
      const c=this.ctx,m=person.avatarModel,female=person.avatarGender==='female';
      if(!Number.isInteger(m))return;
      c.fillStyle=person.hair;
      c.beginPath();
      if(!female&&m===3){if(front)c.arc(0,hy-4.5,5.2,Math.PI,Math.PI*2);else c.ellipse(0,hy-2,5.8,4.6,0,0,Math.PI*2);}
      else if(front)c.arc(0,hy-1.5,7.3,Math.PI*1.05,Math.PI*1.95);
      else c.arc(0,hy-.5,7.2,0,Math.PI*2);
      c.fill();
      if(female){
        if(m===0){c.fillRect(-7.3,hy-2,2.8,10);c.fillRect(4.6,hy-2,2.8,10);if(!front)c.fillRect(-6,hy+1,12,8);}
        else if(m===1){c.fillRect(-7.5,hy-3,2.8,15);c.fillRect(4.7,hy-3,2.8,15);if(!front)c.fillRect(-6.5,hy+1,13,12);}
        else if(m===2){c.beginPath();c.arc(0,hy-8.6,4.2,0,Math.PI*2);c.fill();}
        else if(m===3){c.beginPath();c.ellipse(front?8:-7,hy+1,3,8,front?-.24:.24,0,Math.PI*2);c.fill();}
        else if(m===4){for(let n=0;n<4;n++){c.beginPath();c.arc(6.5-n*.4,hy+3+n*3,2.4,0,Math.PI*2);c.fill();}}
        else{c.beginPath();c.moveTo(-7,hy-4);c.lineTo(5,hy-8);c.lineTo(7,hy+1);c.lineTo(2,hy-2);c.lineTo(-5,hy+1);c.closePath();c.fill();}
      }else{
        if(m===0){c.fillRect(-6.5,hy-4,13,2);}
        else if(m===1){c.beginPath();c.moveTo(-7,hy-3);c.lineTo(3,hy-8);c.lineTo(7,hy-2);c.lineTo(1,hy-3);c.lineTo(-5,hy+1);c.closePath();c.fill();}
        else if(m===2){for(let n=0;n<4;n++){c.beginPath();c.arc(-5+n*3.3,hy-6.7-(n%2)*1.3,3,0,Math.PI*2);c.fill();}}
        else if(m===3){c.fillRect(-4.8,hy-5,9.6,1.2);}
        else if(m===4){c.beginPath();c.moveTo(-7,hy-4);c.lineTo(-5,hy-10);c.lineTo(-1,hy-6);c.lineTo(2,hy-11);c.lineTo(5,hy-6);c.lineTo(7,hy-5);c.closePath();c.fill();}
        else{c.fillRect(-7.1,hy-2,2.8,5);c.fillRect(4.3,hy-2,2.8,5);c.beginPath();c.ellipse(0,hy-5,7.8,4.2,-.08,0,Math.PI*2);c.fill();}
      }
    }

    createAvatarPreview(host,{reduceMotion=false}={}) {
      if(!host?.append)return {update(){},destroy(){}};
      const canvas=document.createElement('canvas');canvas.setAttribute('role','img');canvas.setAttribute('aria-label','선택한 캐릭터 미리보기');
      canvas.style.cssText='display:block;width:100%;height:180px';host.append(canvas);
      const ctx=canvas.getContext('2d');let profile={},destroyed=false,frame=null,last=0;
      const paint=now=>{
        if(destroyed||!ctx)return;
        const ratio=Math.min(2,window.devicePixelRatio||1),width=Math.max(160,host.clientWidth||240),height=180;
        if(canvas.width!==Math.round(width*ratio)||canvas.height!==Math.round(height*ratio)){canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);}
        ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);ctx.translate(width/2,height-15);ctx.scale(3.2,3.2);
        const original={ctx:this.ctx,t:this.t,hit:this.hit,hoverKey:this.hoverKey};
        try{
          this.ctx=ctx;this.t=reduceMotion?0:now;this.hit=[];this.hoverKey=null;
          const person=this.newPerson({key:'campus:self',appearanceSeed:profile.appearanceSeed??0x42524e44,status:'present',agent:'present'});
          Object.assign(person,{x:0,y:0,mode:'visitor',path:[],studyPose:'stand'});this.applyCampusVisitorAppearance(person,profile);this.person(person);
        }finally{Object.assign(this,original);}
      };
      const tick=now=>{if(destroyed)return;if(now-last>50){paint(now);last=now;}frame=requestAnimationFrame(tick);};
      if(!reduceMotion)frame=requestAnimationFrame(tick);
      return{update(next){profile={...next};paint(performance.now());},destroy(){if(destroyed)return;destroyed=true;if(frame!==null)cancelAnimationFrame(frame);canvas.remove();}};
    }

    drawCampusAvatar() {
      const avatar=this.campusAvatar;if(!avatar)return;
      const identity=this.campusIdentity||{},seed=identity.appearanceSeed??0x42524e44;
      if(!this.campusPlayerPerson||this.campusPlayerPerson.appearanceSeed!==seed){
        this.campusPlayerPerson=this.newPerson({key:'campus:self',appearanceSeed:seed,status:'present',agent:'present'});this.campusPlayerPerson.appearanceSeed=seed;
        this.campusPlayerPerson.originalShirt=this.campusPlayerPerson.shirt;this.campusPlayerPerson.originalHairStyle=this.campusPlayerPerson.hairStyle;
      }
      const player=this.campusPlayerPerson;player.x=avatar.x;player.y=avatar.y;player.mode='visitor';player.jumpHeight=avatar.jumpHeight||0;
      player.shirt=typeof identity.coat==='string'&&/^#[0-9a-f]{6}$/i.test(identity.coat)?identity.coat:player.originalShirt;
      player.hairStyle=identity.gender==='female'?1:identity.gender==='male'?0:player.originalHairStyle;
      this.applyCampusVisitorAppearance(player,identity);
      player.studyPose=this.visibleCampusRoom()==='study'&&!avatar.moving?avatar.studyPose:null;
      player.path=avatar.moving?[{x:avatar.x,y:avatar.y}]:[];player.walkFace=Math.sin(avatar.yaw||0)+Math.cos(avatar.yaw||0)>=0?'front':'back';
      const savedTime=this.t;if(Number.isFinite(avatar.motionTime))this.t=avatar.motionTime;
      const at=this.person(player);this.t=savedTime;if(this.hit.at(-1)?.key==='campus:self')this.campusAvatarHitRaw=this.hit.pop();
      this.avatarNameplate?.(this.ctx,{x:at.x,y:at.y-12,name:identity.displayId||'나',level:identity.level,self:true});
      this.avatarSpeech?.(this.ctx,{x:at.x,y:at.y-12,participantId:'self'});
    }

    drawStudyCompanion(companion,sampledFrame=null){
      if(this.visibleCampusRoom()!=='study')return;
      const motion=sampledFrame||this.sampleStudyCompanion?.(companion)||companion;
      this.studyCompanionPeople ||= new Map();
      let person=this.studyCompanionPeople.get(companion.id);
      if(!person){person=this.newPerson({key:'study:participant:'+companion.id,appearanceSeed:companion.appearanceSeed,status:'present',agent:'present',participant:true});this.studyCompanionPeople.set(companion.id,person);}
      const x=Number.isFinite(motion.x)?motion.x:companion.x,y=Number.isFinite(motion.y)?motion.y:companion.y;
      const moving=typeof motion.moving==='boolean'?motion.moving:motion.pose==='walk';
      const dx=x-person.x,dy=y-person.y;
      const yaw=Number.isFinite(motion.yaw)?motion.yaw:Math.hypot(dx,dy)>.001?Math.atan2(dx,dy):person.yaw||0;
      person.x=x;person.y=y;person.yaw=yaw;person.mode='visitor';
      person.path=moving?[{x,y}]:[];
      person.walkFace=Math.sin(yaw)+Math.cos(yaw)>=0?'front':'back';
      person.jumpHeight=Number.isFinite(motion.jumpHeight)?Math.max(0,Math.min(3,motion.jumpHeight)):0;
      person.studyPose=!moving&&motion.pose==='sit'?'sit':!moving&&motion.pose==='wave'?'wave':'stand';
      person.shirt=companion.coat;person.hairStyle=companion.gender==='female'?1:0;this.applyCampusVisitorAppearance(person,companion);
      const count=this.hit.length,at=this.person(person);this.hit.length=count;
      // The returned head anchor includes the sampled position and jump height,
      // so the nameplate and speech never lag behind the interpolated body.
      this.avatarNameplate?.(this.ctx,{x:at.x,y:at.y-12,name:companion.label,level:companion.level});
      this.avatarSpeech?.(this.ctx,{x:at.x,y:at.y-12,participantId:companion.id});
    }

    drawMissionTable() {
      const P=(x,y,z=0)=>this.iso(x,y,z),cx=this.plan.campus?.mission.center.x??7.5,cy=this.plan.campus?.mission.center.y??5.5,c=this.ctx;
      const ring=(rx,ry,z)=>Array.from({length:8},(_,i)=>{const a=Math.PI/8+i*Math.PI/4;return P(cx+Math.cos(a)*rx,cy+Math.sin(a)*ry,z);});
      this.poly(ring(2.25,1.95,.04),'#263f52','#78a4b8');
      for(const [x,y] of[[-1.25,-.8],[1.25,-.8],[-1.25,.8],[1.25,.8]])this.box(cx+x-.18,cy+y-.18,.04,.36,.36,.65,'#8daab8','#4f7084','#35566b');
      const top=ring(2.05,1.75,.95),base=ring(2.05,1.75,.72);
      for(let i=0;i<8;i++)this.poly([base[i],base[(i+1)%8],top[(i+1)%8],top[i]],'#315a73','#73a7bd');
      this.poly(top,'#b6cbd0','#deece8');this.poly(ring(1.75,1.43,.975),'#173e55','#91dce9');
      for(let j=0;j<3;j++){const center=P(cx,cy,1.02+j*.12);c.strokeStyle=j===1?'#a2e5f0':'#4b91ae';c.lineWidth=1.2;c.beginPath();c.ellipse(center.x,center.y,42-j*8,21-j*4,0,0,Math.PI*2);c.stroke();}
      const holo=P(cx,cy,2.05);c.save();c.globalAlpha=.82;c.strokeStyle='#9ce6f3';c.fillStyle='rgba(95,193,222,.18)';c.lineWidth=1.1;c.beginPath();c.arc(holo.x,holo.y,20,0,Math.PI*2);c.fill();c.stroke();c.beginPath();c.ellipse(holo.x,holo.y,8,20,-.3,0,Math.PI*2);c.stroke();c.beginPath();c.ellipse(holo.x,holo.y,20,7,.1,0,Math.PI*2);c.stroke();c.strokeStyle='rgba(151,223,241,.25)';for(const dx of[-12,0,12]){c.beginPath();c.moveTo(holo.x+dx,holo.y+17);const bottom=P(cx,cy,1);c.lineTo(bottom.x+dx*1.7,bottom.y);c.stroke();}c.restore();
    }

    drawOxygenModule(x,y) {
      this.box(x,y,0,1.25,.78,1.75,'#c4d4d3','#708e9e','#486b82');
      this.box(x+.12,y+.77,.2,.96,.035,1.25,'#294b61','#23485e','#1d4056');
      const c=this.ctx;for(let i=0;i<3;i++){const p=this.iso(x+.28+i*.3,y+.82,1.25);c.fillStyle=i===2?'#dfb966':'#93dedc';c.fillRect(p.x-1,p.y-5,3,12);}
      this.box(x+.12,y+.11,1.75,1.01,.55,.08,'#c2d8dd','#7598ab','#486d85');
    }

    drawSpecimenModule(x,y) {
      this.box(x,y,.02,1.1,.7,.8,'#afc5ce','#63859a','#42657e');
      this.box(x+.08,y+.08,.82,.94,.54,.08,'#a7dce6','#659bac','#3f728b');
      for(let i=0;i<3;i++)this.box(x+.15+i*.27,y+.2,.9,.18,.22,.3,'#c0dee1','#739bac','#4d7f95');
    }

    drawResearchStation(dk,p) {
      const {x,y,wing,index}=dk, pal=this.pal,P=(a,b,z)=>this.iso(a,b,z);
      this.box(x-.12,y-.12,0,1.62,1.44,.10,'#334e63','#223e53','#183446');
      this.box(x,y,.10,1.4,1.2,.7,'#b9ccd2','#6c8c9e','#4d7088');
      this.box(x-.04,y-.04,.80,1.48,1.28,.1,'#e0e8e1','#87a6b6','#5d8198');
      const screenX=wing==='left'?x+1.3:x+.1;
      this.box(screenX-.06,y+.08,.9,.12,1.04,.68,'#375d77','#21465f','#163c55');
      this.poly([P(screenX+.075,y+.18,1),P(screenX+.075,y+1.02,1),P(screenX+.075,y+1.02,1.48),P(screenX+.075,y+.18,1.48)],'#69bad3','#b7edf3');
      this.poly([P(x+.15,y+.2,.905),P(x+1.2,y+.2,.905),P(x+1.2,y+.38,.905),P(x+.15,y+.38,.905)],'#284d65','#5d9cb3');
      for(let i=0;i<5;i++){const point=P(x+.22+i*.18,y+.28,.92);this.ctx.fillStyle=i===0?'#e8bb67':'#9cd9e5';this.ctx.fillRect(point.x-1,point.y-1,2,2);}
      this.box(x+.12,y+1.14,.18,1.12,.05,.07,'#e0b362','#c79b50','#ae8340');
      const tag=P(x+.65,y+1.2,.58);this.ctx.fillStyle='#d2e6ed';this.ctx.font='700 7px ui-monospace,monospace';this.ctx.textAlign='center';this.ctx.fillText('ST / '+String(index+1).padStart(2,'0'),tag.x,tag.y);
    }

    // ------------------------------------------------------------ furniture

    plant(x, y) {
      const pal = this.pal;
      this.box(x - 0.18, y - 0.18, 0, 0.36, 0.36, 0.3, this.shade(pal.pot, 10), pal.pot, this.shade(pal.pot, -15));
      const c = this.ctx;
      const b = this.iso(x, y, 0.3);
      const sway = Math.sin(this.t / 1400 + x) * 0.05;
      c.fillStyle = pal.plant;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        c.beginPath();
        c.ellipse(b.x + Math.cos(a) * 6, b.y - 13 + Math.sin(a) * 3, 5.5, 13, a / 3 + sway, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = this.shade(pal.plant, 22);
      c.beginPath(); c.ellipse(b.x, b.y - 20, 5, 10, sway, 0, Math.PI * 2); c.fill();
    }

    serverRack(x, y) {
      this.box(x, y, 0, 0.7, 0.6, 1.9, '#3a3d44', '#24262b', '#1b1d21');
      const c = this.ctx;
      const busy = this.deskOf.size;
      for (let r = 0; r < 7; r++) {
        for (let k = 0; k < 4; k++) {
          const on = Math.sin(this.t / (180 + r * 37 + k * 53) + r * k) > 0.2 && (r * 4 + k) < Math.max(4, busy * 3);
          const p = this.iso(x + 0.12 + k * 0.13, y + 0.6, 1.7 - r * 0.22);
          c.fillStyle = on ? (k % 3 === 0 ? '#ffb347' : '#5cf08a') : '#2f3a33';
          c.fillRect(p.x - 1, p.y - 1, 2.5, 2);
        }
      }
    }

    printer(x, y) {
      const pal = this.pal;
      this.box(x, y, 0, 0.75, 0.55, 0.55, pal.deskTop, pal.deskL, pal.deskR);
      this.box(x + 0.05, y + 0.05, 0.55, 0.65, 0.45, 0.28, '#e8e8e8', '#c8c8c8', '#b3b3b3');
      this.box(x + 0.15, y + 0.35, 0.83, 0.45, 0.15, 0.02, '#ffffff', '#eee', '#ddd');
    }

    pingpong(x, y) {
      for (const [lx, ly] of [[0.1, 0.1], [2.4, 0.1], [0.1, 1.2], [2.4, 1.2]]) this.box(x + lx, y + ly, 0, 0.08, 0.08, 0.7, '#333', '#333', '#222');
      this.box(x, y, 0.7, 2.6, 1.4, 0.06, '#2f7a52', '#245f40', '#1d4f35');
      const P = (a, b, c) => this.iso(a, b, c);
      this.poly([P(x + 0.04, y + 0.69, 0.765), P(x + 2.56, y + 0.69, 0.765), P(x + 2.56, y + 0.71, 0.765), P(x + 0.04, y + 0.71, 0.765)], '#ffffff');
      this.poly([P(x + 1.3, y - 0.05, 0.76), P(x + 1.3, y + 1.45, 0.76), P(x + 1.3, y + 1.45, 0.95), P(x + 1.3, y - 0.05, 0.95)], 'rgba(255,255,255,.55)', '#ddd');
    }

    meetingTable(x, y) {
      const pal = this.pal;
      this.box(x + 0.3, y + 0.5, 0, 0.12, 0.4, 0.7, pal.deskL, pal.deskL, pal.deskR);
      this.box(x + 2.6, y + 0.5, 0, 0.12, 0.4, 0.7, pal.deskL, pal.deskL, pal.deskR);
      this.box(x, y, 0.7, 3.0, 1.4, 0.08, this.shade(pal.deskTop, 12), pal.deskL, pal.deskR);
      this.box(x + 1.2, y + 0.45, 0.78, 0.5, 0.35, 0.03, '#2a2a2e', '#222', '#1a1a1a');
      this.box(x + 0.4, y + 0.3, 0.78, 0.2, 0.28, 0.02, '#fff', '#eee', '#ddd');
      this.box(x + 2.2, y + 0.8, 0.78, 0.12, 0.12, 0.12, '#f2f2f2', '#d0d0d0', '#bbb');
    }

    stool(x, y, h, color) {
      this.box(x - 0.04, y - 0.04, 0, 0.08, 0.08, h, '#555', '#444', '#333');
      this.box(x - 0.2, y - 0.2, h, 0.4, 0.4, 0.07, this.shade(color, 18), color, this.shade(color, -18));
    }

    roundTable(x, y) {
      const c = this.ctx;
      this.box(x - 0.05, y - 0.05, 0, 0.1, 0.1, 0.72, '#555', '#444', '#333');
      const p = this.iso(x, y, 0.75);
      c.fillStyle = this.shade(this.pal.deskTop, -15);
      c.beginPath(); c.ellipse(p.x, p.y + 3, 30, 15, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = this.shade(this.pal.deskTop, 15);
      c.beginPath(); c.ellipse(p.x, p.y, 30, 15, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff';
      c.beginPath(); c.ellipse(p.x + 8, p.y - 2, 5, 2.5, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#e6b35c';
      c.beginPath(); c.arc(p.x + 8, p.y - 3, 2, 0, Math.PI * 2); c.fill();
    }

    coffeeMachine(x, y) {
      this.box(x, y, 0.9, 0.5, 0.45, 0.6, '#555b63', '#3a3f45', '#2e3237');
      this.box(x + 0.15, y + 0.42, 1.0, 0.2, 0.05, 0.15, '#222', '#111', '#111');
      const p = this.iso(x + 0.4, y + 0.45, 1.35);
      this.ctx.fillStyle = Math.sin(this.t / 400) > 0 ? '#ff6b4a' : '#7a3a2a';
      this.ctx.fillRect(p.x, p.y, 2.5, 2.5);
      this.box(x + 0.6, y + 0.1, 0.9, 0.14, 0.14, 0.14, '#fff', '#ddd', '#ccc');
    }

    sink(x, y) {
      this.box(x, y + 0.05, 0.9, 0.55, 0.4, 0.02, '#9aa3ad', '#7d858e', '#6c737b');
      this.box(x + 0.22, y + 0.02, 0.92, 0.06, 0.06, 0.3, this.pal.metal, this.pal.metal, '#888');
      this.box(x + 0.22, y + 0.02, 1.2, 0.06, 0.2, 0.04, this.pal.metal, this.pal.metal, '#888');
    }

    fridge(x, y) {
      this.box(x, y, 0, 0.85, 0.75, 1.95, '#eef1f4', '#cfd5db', '#bcc3ca');
      const P = (a, b, c) => this.iso(a, b, c);
      this.poly([P(x, y + 0.75, 1.25), P(x + 0.85, y + 0.75, 1.25), P(x + 0.85, y + 0.75, 1.27), P(x, y + 0.75, 1.27)], '#9aa3ad');
      this.poly([P(x + 0.7, y + 0.75, 1.4), P(x + 0.73, y + 0.75, 1.4), P(x + 0.73, y + 0.75, 1.75), P(x + 0.7, y + 0.75, 1.75)], '#888');
      for (const [mx, mz, col] of [[0.2, 1.6, '#c96442'], [0.4, 1.45, '#3b8ee0'], [0.3, 0.9, '#5f9a4c']]) {
        const p = P(x + mx, y + 0.75, mz);
        this.ctx.fillStyle = col; this.ctx.fillRect(p.x, p.y, 4, 4);
      }
    }

    waterCooler(x, y) {
      this.box(x, y, 0, 0.42, 0.42, 0.95, '#e8ecef', '#cfd5db', '#bcc3ca');
      const c = this.ctx;
      const p = this.iso(x + 0.21, y + 0.21, 0.95);
      c.fillStyle = 'rgba(120,180,240,.6)';
      c.beginPath(); c.ellipse(p.x, p.y - 9, 8, 11, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,.5)';
      c.fillRect(p.x - 4, p.y - 16, 2, 10);
      const k = (this.t / 1800) % 1;
      c.fillStyle = 'rgba(255,255,255,.85)';
      c.beginPath(); c.arc(p.x + 2, p.y - 2 - k * 16, 1.2, 0, Math.PI * 2); c.fill();
      const tap = this.iso(x + 0.21, y + 0.42, 0.65);
      c.fillStyle = '#3b8ee0'; c.fillRect(tap.x - 1.5, tap.y, 3, 3);
    }

    couch(x, y) {
      const pal = this.pal;
      this.box(x, y - 0.05, 0.32, 2.8, 0.25, 0.42, this.shade(pal.couch, 10), pal.couchD, this.shade(pal.couchD, -12));
      this.box(x, y, 0, 2.8, 0.8, 0.32, pal.couch, pal.couchD, this.shade(pal.couchD, -12));
      this.box(x - 0.15, y - 0.05, 0, 0.18, 0.85, 0.52, this.shade(pal.couch, 6), pal.couchD, this.shade(pal.couchD, -12));
      this.box(x + 2.8, y - 0.05, 0, 0.18, 0.85, 0.52, this.shade(pal.couch, 6), pal.couchD, this.shade(pal.couchD, -12));
      this.box(x + 2.15, y + 0.12, 0.32, 0.35, 0.16, 0.28, '#e9c46a', '#d4ae52', '#c19c43');
    }

    coffeeTable(x, y) {
      const pal = this.pal;
      this.box(x, y, 0, 1.6, 0.7, 0.3, this.shade(pal.deskTop, -10), pal.deskL, pal.deskR);
      this.box(x + 0.2, y + 0.15, 0.3, 0.35, 0.25, 0.06, '#c96442', '#a85336', '#8f462e');
      this.box(x + 1.1, y + 0.3, 0.3, 0.12, 0.12, 0.12, '#fff', '#ddd', '#ccc');
    }

    beanbag(x, y, color) {
      const c = this.ctx;
      const p = this.iso(x, y, 0);
      c.fillStyle = this.shade(color, -25);
      c.beginPath(); c.ellipse(p.x, p.y - 4, 20, 11, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = color;
      c.beginPath(); c.ellipse(p.x, p.y - 8, 18, 10, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = this.shade(color, 20);
      c.beginPath(); c.ellipse(p.x - 3, p.y - 14, 10, 6, -0.2, 0, Math.PI * 2); c.fill();
    }

    books(x0, x1, y) {
      const P = (a, b, c) => this.iso(a, b, c);
      const cols = this.pal.book;
      for (let shelf = 0; shelf < 3; shelf++) {
        const z = 0.12 + shelf * 0.45;
        let bx = x0 + 0.05;
        let i = Math.round(x0 * 7) + shelf * 5;
        while (bx < x1 - 0.1) {
          const bw = 0.07 + ((i * 13) % 5) * 0.015;
          const bh = 0.25 + ((i * 7) % 4) * 0.03;
          if (i % 7 !== 3) this.poly([P(bx, y, z), P(bx + bw, y, z), P(bx + bw, y, z + bh), P(bx, y, z + bh)], cols[i % cols.length]);
          bx += bw + 0.015;
          i++;
        }
        this.poly([P(x0, y, z - 0.02), P(x1, y, z - 0.02), P(x1, y, z), P(x0, y, z)], this.pal.deskR);
      }
    }

    arcade(x, y) {
      this.box(x, y, 0, 0.7, 0.7, 1.75, '#3a2a6a', '#2b1f52', '#221843');
      const P = (a, b, c) => this.iso(a, b, c);
      const hue = (this.t / 20) % 360;
      this.poly([P(x + 0.1, y + 0.7, 1.0), P(x + 0.6, y + 0.7, 1.0), P(x + 0.6, y + 0.7, 1.45), P(x + 0.1, y + 0.7, 1.45)], `hsl(${hue},70%,55%)`);
      const blip = this.iso(x + 0.25 + 0.2 * Math.sin(this.t / 300), y + 0.7, 1.2);
      this.ctx.fillStyle = '#fff'; this.ctx.fillRect(blip.x, blip.y, 3, 3);
      this.poly([P(x, y + 0.7, 1.55), P(x + 0.7, y + 0.7, 1.55), P(x + 0.7, y + 0.7, 1.72), P(x, y + 0.7, 1.72)], '#ffcf4a');
      this.box(x, y + 0.7, 0.8, 0.7, 0.2, 0.08, '#4a3a8a', '#3a2a6a', '#2b1f52');
      const j = this.iso(x + 0.25, y + 0.8, 0.88);
      this.ctx.fillStyle = '#e04a4a'; this.ctx.beginPath(); this.ctx.arc(j.x, j.y - 3, 2.5, 0, Math.PI * 2); this.ctx.fill();
    }

    floorLamp(x, y) {
      const c = this.ctx;
      const b = this.iso(x, y, 0), t = this.iso(x, y, 1.7);
      if (skyColor().night) {
        c.fillStyle = 'rgba(255,220,140,.14)';
        c.beginPath(); c.ellipse(b.x, b.y, 50, 25, 0, 0, Math.PI * 2); c.fill();
      }
      c.strokeStyle = '#333'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(t.x, t.y); c.stroke();
      c.fillStyle = '#333'; c.beginPath(); c.ellipse(b.x, b.y, 7, 3.5, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#f3e3b5';
      c.beginPath(); c.moveTo(t.x - 9, t.y + 4); c.lineTo(t.x + 9, t.y + 4); c.lineTo(t.x + 5, t.y - 8); c.lineTo(t.x - 5, t.y - 8); c.closePath(); c.fill();
    }

    vending(x, y, color) {
      this.box(x, y, 0, 0.7, 0.75, 1.85, this.shade(color, 15), this.shade(color, -10), color);
      const P = (a, b, c) => this.iso(a, b, c);
      const fx = x + 0.7;
      this.poly([P(fx, y + 0.08, 0.7), P(fx, y + 0.55, 0.7), P(fx, y + 0.55, 1.7), P(fx, y + 0.08, 1.7)], 'rgba(20,30,40,.75)');
      const cols = ['#f2d16b', '#5cf08a', '#ff8a65', '#81d4fa', '#ce93d8'];
      for (let r = 0; r < 4; r++) {
        for (let k = 0; k < 3; k++) {
          const q = P(fx, y + 0.15 + k * 0.14, 1.55 - r * 0.23);
          this.ctx.fillStyle = cols[(r * 3 + k + Math.round(y)) % cols.length];
          this.ctx.fillRect(q.x - 1.5, q.y - 4, 3, 5);
        }
      }
      this.poly([P(fx, y + 0.1, 0.25), P(fx, y + 0.5, 0.25), P(fx, y + 0.5, 0.45), P(fx, y + 0.1, 0.45)], '#222');
      const glow = P(fx, y + 0.65, 1.2);
      this.ctx.fillStyle = Math.sin(this.t / 700 + y) > 0 ? '#9ef' : '#4ad';
      this.ctx.fillRect(glow.x - 1, glow.y - 3, 2, 6);
    }

    foosball(x, y) {
      for (const [lx, ly] of [[0.1, 0.1], [1.42, 0.1], [0.1, 0.62], [1.42, 0.62]]) this.box(x + lx, y + ly, 0, 0.08, 0.08, 0.6, '#5a4030', '#5a4030', '#4a3428');
      this.box(x, y, 0.6, 1.6, 0.8, 0.25, '#2f8a4a', '#6e533b', '#5c4431');
      const P = (a, b, c) => this.iso(a, b, c);
      const players = this.plan && this.plan.pois.filter((q) => q.pair === 'fb' && q.taken).length === 2;
      for (let k = 0; k < 6; k++) {
        const rx = x + 0.2 + k * 0.24;
        const shift = players ? Math.sin(this.t / 120 + k) * 0.06 : 0;
        const a = P(rx, y - 0.15, 0.82), b = P(rx, y + 0.95, 0.82);
        this.ctx.strokeStyle = '#c8ccd0'; this.ctx.lineWidth = 1.2;
        this.ctx.beginPath(); this.ctx.moveTo(a.x, a.y); this.ctx.lineTo(b.x, b.y); this.ctx.stroke();
        for (let m = 0; m < 2; m++) {
          const q = P(rx, y + 0.25 + m * 0.3 + shift, 0.82);
          this.ctx.fillStyle = k % 2 ? '#c0392b' : '#2f6fb0';
          this.ctx.fillRect(q.x - 1.5, q.y - 3, 3, 6);
        }
      }
    }

    booth(add, x, y) {
      const P = (a, b, c) => this.iso(a, b, c);
      const pal = this.pal;
      const H = 2.0;
      // back walls (felt panels), then the stool, then glass front
      add(x + 0.65 + y + 0.05, () => {
        this.poly([P(x, y, 0), P(x + 1.3, y, 0), P(x + 1.3, y, H), P(x, y, H)], pal.dark ? '#3c4a5a' : '#9fb3c8');
        this.poly([P(x, y, 0), P(x, y + 1.3, 0), P(x, y + 1.3, H), P(x, y, H)], pal.dark ? '#34404e' : '#8ea3b8');
        this.poly([P(x + 0.02, y + 0.02), P(x + 1.28, y + 0.02), P(x + 1.28, y + 1.28), P(x + 0.02, y + 1.28)], pal.dark ? '#2a323b' : '#d8dee5');
        const lamp = P(x + 0.65, y + 0.65, H - 0.05);
        this.ctx.fillStyle = 'rgba(255,230,160,.9)';
        this.ctx.beginPath(); this.ctx.ellipse(lamp.x, lamp.y, 8, 4, 0, 0, Math.PI * 2); this.ctx.fill();
        this.stool(x + 0.65, y + 0.6, 0.43, '#c96442');
      });
      add(x + 1.3 + y + 0.65 + 0.3, () => {
        this.poly([P(x + 1.3, y, 0), P(x + 1.3, y + 1.3, 0), P(x + 1.3, y + 1.3, H), P(x + 1.3, y, H)], pal.glass, pal.glassEdge);
        this.poly([P(x, y + 1.3, 0), P(x + 1.3, y + 1.3, 0), P(x + 1.3, y + 1.3, H), P(x, y + 1.3, H)], pal.glass, pal.glassEdge);
        this.poly([P(x + 0.85, y + 1.3, 0), P(x + 0.87, y + 1.3, 0), P(x + 0.87, y + 1.3, H), P(x + 0.85, y + 1.3, H)], pal.glassEdge);
        this.box(x - 0.03, y - 0.03, H, 1.36, 1.36, 0.08, pal.dark ? '#4a5868' : '#b5c4d3', pal.trim, pal.trim);
      });
    }

    desk(dk, p) {
      if(dk.lab)return this.drawResearchStation(dk,p);
      const pal = this.pal;
      const { x, y } = dk;
      for (const [lx, ly] of [[0.05, 0.05], [1.27, 0.05], [0.05, 0.67], [1.27, 0.67]]) {
        this.box(x + lx, y + ly, 0, 0.08, 0.08, 0.72, pal.deskL, pal.deskL, pal.deskR);
      }
      this.box(x, y, 0.72, 1.4, 0.8, 0.07, pal.deskTop, pal.deskL, pal.deskR);
      const worker = p && p.mode === 'work' ? p : null;
      if (dk.side === 's') {
        const mx = x + 0.42, my = y + 0.1, mz = 0.79;
        this.box(mx + 0.22, my + 0.04, mz, 0.1, 0.1, 0.18, pal.monitor, pal.monitor, pal.monitor);
        this.box(mx, my, mz + 0.18, 0.56, 0.08, 0.42, pal.monitor, pal.monitor, this.shade(pal.monitor, 10));
        this.screen(mx + 0.04, my + 0.08, mz + 0.22, 0.48, 0.34, worker);
        this.box(x + 0.48, y + 0.48, 0.79, 0.44, 0.16, 0.025, '#d8d8d8', '#aaa', '#999');
      } else {
        // We see this monitor from behind; a status LED on its back.
        const mx = x + 0.42, my = y + 0.6, mz = 0.79;
        this.box(x + 0.48, y + 0.16, 0.79, 0.44, 0.16, 0.025, '#d8d8d8', '#aaa', '#999');
        this.box(mx + 0.22, my - 0.02, mz, 0.1, 0.1, 0.18, pal.monitor, pal.monitor, pal.monitor);
        this.box(mx, my, mz + 0.18, 0.56, 0.08, 0.42, this.shade(pal.monitor, 15), this.shade(pal.monitor, 8), this.shade(pal.monitor, 12));
        if (worker) {
          const g = this.iso(mx + 0.28, my + 0.08, mz + 0.5);
          this.ctx.fillStyle = STATUS_COLOR[worker.s.status] || '#888';
          this.ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.t / 400 + worker.phase);
          this.ctx.beginPath(); this.ctx.arc(g.x, g.y, 1.8, 0, Math.PI * 2); this.ctx.fill();
          this.ctx.globalAlpha = 1;
        }
      }
      // personal touches, stable per desk
      const h = hash(`${x.toFixed(1)},${y.toFixed(1)}`);
      if (h % 3 === 0) this.box(x + 1.12, y + 0.3, 0.79, 0.12, 0.12, 0.13, '#f2f2f2', '#d0d0d0', '#bbb');
      if (h % 5 === 1) {
        this.box(x + 0.14, y + 0.24, 0.79, 0.12, 0.12, 0.08, pal.pot, pal.pot, this.shade(pal.pot, -15));
        const q = this.iso(x + 0.2, y + 0.3, 0.87);
        this.ctx.fillStyle = pal.plant;
        this.ctx.beginPath(); this.ctx.ellipse(q.x, q.y - 4, 4, 6, 0, 0, Math.PI * 2); this.ctx.fill();
      }
      if (h % 4 === 2) this.box(x + 0.12, y + 0.45, 0.79, 0.22, 0.15, 0.05, '#f2d16b', '#d9b84f', '#c4a33f');
    }

    screen(x, y, z, w, h, p) {
      const P = (a, b, cc) => this.iso(a, b, cc);
      const st = p ? p.s.status : 'off';
      const base = { thinking: '#3a3160', tool: '#14324f', typing: '#123d2e', waiting: '#4d3510', error: '#4a1612' }[st] || this.pal.screenOff;
      const corners = [P(x, y, z), P(x + w, y, z), P(x + w, y, z + h), P(x, y, z + h)];
      this.poly(corners, base);
      if (!p || st === 'present') return;
      const c = this.ctx;
      c.save();
      c.beginPath();
      corners.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
      c.closePath();
      c.clip();
      const t = this.t / 1000;
      const col = STATUS_COLOR[st];
      if (st === 'tool' || st === 'typing') {
        const scroll = (t * (st === 'tool' ? 2.2 : 1.2) + p.phase) % 1;
        for (let i = -1; i < 6; i++) {
          const zz = z + h - 0.05 - ((i + scroll) * h) / 5;
          const len = 0.12 + ((p.h >> ((i + 8) & 15)) % 7) / 20;
          const a = P(x + 0.05, y, zz), b = P(x + 0.05 + Math.min(len, w - 0.1), y, zz);
          c.strokeStyle = i % 3 === 0 ? col : 'rgba(255,255,255,.55)';
          c.lineWidth = 1.5;
          c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
        }
      } else {
        const m = P(x + w / 2, y, z + h / 2);
        c.fillStyle = col;
        c.globalAlpha = st === 'thinking' ? 0.5 + 0.4 * Math.sin(t * 3 + p.phase) : 0.9;
        c.font = '700 10px ui-sans-serif, system-ui, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText({ thinking: '…', waiting: '?', error: '!' }[st] || '', m.x, m.y);
      }
      c.restore();
      c.save();
      c.globalAlpha = 0.18;
      const g = P(x + w / 2, y + 0.35, 0.8);
      c.fillStyle = col;
      c.beginPath(); c.ellipse(g.x, g.y, 18, 7, 0, 0, Math.PI * 2); c.fill();
      c.restore();
    }

    chair(dk, p) {
      const pal = this.pal;
      const sx = dk.seat.x - 0.25, sy = dk.seat.y - 0.22;
      const seated = p && !p.path.length && p.pose === 'sit' && Math.hypot(p.x - dk.seat.x, p.y - dk.seat.y) < 0.05;
      const ox = seated ? 0 : 0.12, oy = seated ? 0 : dk.side === 's' ? 0.18 : -0.18;
      this.box(sx + 0.22 + ox, sy + 0.19 + oy, 0, 0.06, 0.06, 0.32, '#222', '#222', '#111');
      if (dk.side === 'n') this.box(sx + ox, sy + oy - 0.05, 0.4, 0.5, 0.07, 0.55, this.shade(pal.chair, 15), pal.chair, this.shade(pal.chair, -10));
      this.box(sx + ox, sy + oy, 0.32, 0.5, 0.45, 0.08, this.shade(pal.chair, 15), pal.chair, this.shade(pal.chair, -10));
      if (dk.side === 's' && !seated) this.box(sx + ox, sy + oy + 0.4, 0.4, 0.5, 0.07, 0.5, this.shade(pal.chair, 15), pal.chair, this.shade(pal.chair, -10));
    }

    // ------------------------------------------------------------ people

    stateOf(p) {
      const s = p.s || {};
      if (p.path.length) return { pose: 'walk', face: p.walkFace, act: null, sitZ: 0 };
      if((p.key==='campus:self'||s.participant===true)&&p.studyPose==='sit')return{pose:'sit',face:'back',act:'type',sitZ:.36};
      if((p.key==='campus:self'||s.participant===true)&&p.studyPose==='wave')return{pose:'stand',face:'front',act:'wave',sitZ:0};
      if(s.participant===true)return{pose:'stand',face:p.walkFace||'front',act:null,sitZ:0};
      if (p.mode === 'work' && p.desk) {
        const face = p.desk.side === 'n' ? 'front' : 'back';
        if (s.status === 'present') return { pose: 'sit', face, act: null, sitZ: 0.34 };
        if (s.status === 'waiting' || s.status === 'error') return { pose: 'stand', face, act: 'wave', sitZ: 0 };
        if (p.desk.pose === 'stand') return { pose: 'stand', face, act: 'station', sitZ: 0 };
        return { pose: 'sit', face, act: s.status === 'tool' || s.status === 'typing' ? 'type' : 'think', sitZ: 0.34 };
      }
      if (p.mode === 'wander' && p.poi) {
        const q = p.poi;
        return { pose: q.sit ? 'sit' : 'stand', face: q.face === 'side' ? 'front' : q.face, act: q.act, sitZ: q.sit || 0 };
      }
      return { pose: 'stand', face: 'front', act: null, sitZ: 0 };
    }

    person(p) {
      const c = this.ctx;
      const t = this.t / 1000;
      const s = p.s || {};
      const st = {...this.stateOf(p)};
      if(p.key==='campus:self'||s.participant===true){if(p.heldItem==='coffee')st.act='coffee';else if(p.heldItem==='book')st.act='read';}
      p.pose = st.pose;
      const moving = st.pose === 'walk';
      const seated = st.pose === 'sit';
      const front = st.face !== 'back';
      const b = this.iso(p.x, p.y, st.sitZ+(p.jumpHeight||0));
      const step = moving ? Math.sin(t * 12 + p.phase) : 0;
      const bob = moving ? Math.abs(step) * 1.5 : 0;

      const fb = this.iso(p.x, p.y, 0);
      c.fillStyle = this.pal.shadow;
      c.beginPath(); c.ellipse(fb.x, fb.y, 10, 5, 0, 0, Math.PI * 2); c.fill();
      if (this.hoverKey === p.key) {
        c.strokeStyle = STATUS_COLOR[s.status] || '#888';
        c.lineWidth = 2;
        c.beginPath(); c.ellipse(fb.x, fb.y, 14, 7, 0, 0, Math.PI * 2); c.stroke();
      }

      let x = b.x;
      const y = b.y - bob;
      if (st.act === 'pingpong') x += Math.sin(t * 7 + p.phase) * 4;
      if (st.act === 'foosball') x += Math.sin(t * 5 + p.phase) * 1.5;
      const sc = s.subagent ? 0.8 : 1;
      c.save();
      c.translate(x, y);
      c.scale(sc, sc);

      c.fillStyle = p.pants;
      if (seated) {
        c.fillRect(-5, -4, 4, 5);
        c.fillRect(1, -4, 4, 5);
      } else {
        c.fillRect(-5, -10, 4, 10 + step * 2);
        c.fillRect(1, -10, 4, 10 - step * 2);
        c.fillStyle = '#2a2a2a';
        c.fillRect(-5, -1 + step, 4, 2);
        c.fillRect(1, -1 - step, 4, 2);
      }
      const hip = seated ? -4 : -10;
      this.roundRect(-7, hip - 13, 14, 14, 3, p.shirt);
      const arm = this.shade(p.shirt, -18);
      const hand = (hx, hy) => { c.fillStyle = p.skin; c.beginPath(); c.arc(hx, hy, 2.2, 0, Math.PI * 2); c.fill(); };
      c.fillStyle = arm;
      const sip = Math.sin(t * 0.9 + p.phase) > 0.6;
      switch (st.act) {
        case 'wave': {
          const wave = Math.sin(t * 8 + p.phase) * 2;
          c.fillRect(6, hip - 26, 3, 14);
          hand(7.5 + wave * 0.5, hip - 27);
          c.fillStyle = arm; c.fillRect(-9, hip - 11, 3, 10);
          break;
        }
        case 'type': {
          const k1 = Math.sin(t * 18 + p.phase) > 0 ? 1 : 0;
          c.fillRect(-9, hip - 11 - k1, 3, 8);
          c.fillRect(6, hip - 11 - (1 - k1), 3, 8);
          break;
        }
        case 'coffee':
        case 'water': {
          c.fillRect(-9, hip - 11, 3, 10);
          c.fillRect(6, sip ? hip - 15 : hip - 11, 3, sip ? 7 : 10);
          const cupY = sip && front ? hip - 19 : hip - 4;
          c.fillStyle = st.act === 'water' ? 'rgba(170,215,255,.95)' : '#fafafa';
          c.fillRect(6, cupY, 5, 6);
          if (st.act === 'coffee') { c.fillStyle = '#6b3f22'; c.fillRect(7, cupY, 3, 1.5); }
          break;
        }
        case 'read': {
          c.fillRect(-8, hip - 11, 3, 7);
          c.fillRect(5, hip - 11, 3, 7);
          c.fillStyle = pick(this.pal.book, p.h, 5);if(front){c.fillRect(-7,hip-12,14,9);c.fillStyle='#fff';c.fillRect(-.5,hip-12,1,9);}else{c.fillRect(5,hip-11,5,9);c.fillStyle='#eef0df';c.fillRect(8,hip-10,1,7);}
          break;
        }
        case 'whiteboard':
        case 'arcade': {
          const k = Math.sin(t * (st.act === 'arcade' ? 14 : 3) + p.phase);
          c.fillRect(-9, hip - 11, 3, 10);
          c.fillRect(6, hip - 20 + k * 2, 3, 12);
          hand(7.5, hip - 21 + k * 2);
          break;
        }
        case 'pingpong': {
          c.fillRect(-9, hip - 11, 3, 10);
          c.fillRect(6, hip - 14, 3, 9);
          c.fillStyle = '#c0392b';
          c.beginPath(); c.arc(10, hip - 16, 4, 0, Math.PI * 2); c.fill();
          break;
        }
        case 'foosball': {
          const k1 = Math.sin(t * 16 + p.phase) * 1.5;
          c.fillRect(-9, hip - 12 + k1, 3, 7);
          c.fillRect(6, hip - 12 - k1, 3, 7);
          break;
        }
        case 'phone': {
          c.fillRect(-9, hip - 11, 3, 10);
          c.fillRect(5, hip - 22, 3, 12);
          c.fillStyle = '#222'; c.fillRect(5, hip - 25, 3, 6);
          break;
        }
        case 'nap': {
          c.fillRect(-9, hip - 13, 3, 6);
          c.fillRect(6, hip - 13, 3, 6);
          break;
        }
        default: {
          const sw = moving ? step * 2 : 0;
          c.fillRect(-9, hip - 11 + sw, 3, 10);
          c.fillRect(6, hip - 11 - sw, 3, 10);
        }
      }

      const napping = st.act === 'nap';
      const hy = hip - 20 + (napping ? 7 : 0) + (st.act === 'think' ? Math.sin(t * 1.5 + p.phase) * 0.6 : 0);
      c.fillStyle = p.skin;
      c.beginPath(); c.arc(0, hy, 7, 0, Math.PI * 2); c.fill();
      c.fillStyle = p.hair;
      if (front && !napping) {
        if(!Number.isInteger(p.avatarModel)){c.beginPath();c.arc(0,hy-1.5,7.3,Math.PI*1.05,Math.PI*1.95);c.fill();}
        if(Number.isInteger(p.avatarModel))this.drawCampusVisitorHair(p,hy,true);
        else{if(p.hairStyle===1){c.fillRect(-7.3,hy-2,2.5,8);c.fillRect(4.8,hy-2,2.5,8);}if(p.hairStyle===2){c.beginPath();c.arc(0,hy-8,3.2,0,Math.PI*2);c.fill();}}
        c.fillStyle = '#2a2018';
        const sleepy = s.status === 'idle';
        const blink = Math.sin(t * 0.7 + p.phase * 3) > 0.985;
        c.fillRect(-3, hy - 0.5, 1.6, blink || sleepy ? 0.7 : 2);
        c.fillRect(1.6, hy - 0.5, 1.6, blink || sleepy ? 0.7 : 2);
        c.strokeStyle = '#2a2018'; c.lineWidth = 1;
        if (p.mode === 'wander' && !sleepy) {
          c.beginPath(); c.arc(0, hy + 2.2, 2, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
        } else if (s.status === 'error' && p.mode === 'work') {
          c.beginPath(); c.arc(0, hy + 4.5, 2, 1.15 * Math.PI, 1.85 * Math.PI); c.stroke();
        }
      } else {
        if(!Number.isInteger(p.avatarModel)){c.beginPath();c.arc(0,hy-.5,7.2,0,Math.PI*2);c.fill();}
        if(Number.isInteger(p.avatarModel))this.drawCampusVisitorHair(p,hy,false);
        else{if(p.hairStyle===2){c.beginPath();c.arc(0,hy-7,3.2,0,Math.PI*2);c.fill();}if(p.hairStyle===1)c.fillRect(-6,hy,12,8);}
      }
      if (st.act === 'arcade' || st.act === 'beanbag') {
        c.strokeStyle = '#222'; c.lineWidth = 2;
        c.beginPath(); c.arc(0, hy, 8, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
      }
      c.restore();

      const headTop = y + (hy - 8) * sc;
      this.hit.push({ key: p.key, x0: x - 13, x1: x + 13, y0: headTop - 22, y1: fb.y + 4 });
      return { x, y: headTop, act: st.act };
    }

    bubble(p, at) {
      const c = this.ctx;
      const t = this.t / 1000;
      const s = p.s || {};
      const st = s.status;
      const pal = this.pal;
      const x = at.x, y = at.y - 6;
      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const font = (w, px) => `${w} ${px}px ui-sans-serif, system-ui, -apple-system, "PingFang TC", "Apple Color Emoji", sans-serif`;
      c.font = font(600, 10);

      const badge = this.showAgent && AGENT_BADGES[s.agent];
      const pill = (text, fg, bg, yy, alpha = 1, identify = false) => {
        c.globalAlpha = alpha;
        let tx = text;
        while (c.measureText(tx).width > 118 && tx.length > 2) tx = tx.slice(0, -2) + '…';
        const extra = badge && identify ? 26 : 0;
        const w = c.measureText(tx).width + 12 + extra;
        const height = extra ? 22 : 16;
        this.roundRect(x - w / 2, yy - height / 2, w, height, 8, bg);
        c.fillStyle = fg;
        c.fillText(tx, x + extra / 2, yy + 0.5);
        if (extra) this.agentBadge(badge, x - w / 2 + 13, yy);
        c.globalAlpha = 1;
        return yy - 8;
      };

      let top = y;
      if (p.mode === 'work' && !p.path.length) {
        const col = STATUS_COLOR[st] || '#888';
        if (st === 'thinking') {
          c.fillStyle = pal.bubble;
          c.beginPath(); c.arc(x + 6, y - 2, 2, 0, Math.PI * 2); c.fill();
          c.beginPath(); c.arc(x + 10, y - 7, 3, 0, Math.PI * 2); c.fill();
          this.roundRect(x - 2, y - 26, 32, 16, 8, pal.bubble);
          for (let i = 0; i < 3; i++) {
            c.fillStyle = col;
            c.globalAlpha = 0.3 + 0.7 * Math.max(0, Math.sin(t * 5 - i * 0.7));
            c.beginPath(); c.arc(x + 6 + i * 8, y - 18, 2.4, 0, Math.PI * 2); c.fill();
          }
          c.globalAlpha = 1;
          top = y - 26;
        } else if (st === 'typing') {
          this.roundRect(x - 2, y - 24, 34, 16, 5, col);
          c.beginPath(); c.moveTo(x + 2, y - 9); c.lineTo(x - 2, y - 3); c.lineTo(x + 8, y - 9); c.fillStyle = col; c.fill();
          const n = Math.floor(t * 4) % 4;
          c.fillStyle = '#fff';
          for (let i = 0; i < n; i++) { c.beginPath(); c.arc(x + 7 + i * 8, y - 16, 2, 0, Math.PI * 2); c.fill(); }
          top = y - 24;
        } else if (st === 'tool') {
          const tool = (s.activity || 'tool').split(/[:\s]/)[0];
          top = pill('⚙ ' + tool, '#fff', col, y - 12);
        } else if (st === 'waiting' || st === 'error') {
          const jump = Math.abs(Math.sin(t * 4)) * 4;
          c.fillStyle = col;
          c.beginPath(); c.arc(x, y - 12 - jump, 9, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#fff';
          c.font = font(800, 12);
          c.fillText('!', x, y - 11.5 - jump);
          c.font = font(600, 10);
          top = y - 22 - jump;
        }
      } else if (p.mode === 'wander') {
        const justDone = st === 'done' && Date.now() - (s.lastEventAt || 0) < 3 * 60_000;
        const dozing = at.act === 'nap' || (st === 'idle' && (at.act === 'couch' || at.act === 'beanbag' || (p.poi && p.poi.sleepy)));
        if (justDone) {
          c.fillStyle = STATUS_COLOR.done;
          c.beginPath(); c.arc(x, y - 10, 7, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#fff'; c.font = font(800, 9); c.fillText('✓', x, y - 9.5); c.font = font(600, 10);
          top = y - 18;
        } else if (dozing && !p.path.length) {
          c.fillStyle = STATUS_COLOR.idle;
          c.font = font(700, 10);
          for (let i = 0; i < 3; i++) {
            const k = (t * 0.6 + i / 3) % 1;
            c.globalAlpha = 1 - k;
            c.fillText('z', x + 6 + k * 10, y - 4 - k * 18);
          }
          c.globalAlpha = 1;
          c.font = font(600, 10);
          top = y - 20;
        } else if (at.act && (ACT_EMOJI[at.act] || (p.poi && p.poi.emoji)) && !p.path.length) {
          const cycle = (t + p.phase * 3) % 9;
          if (cycle < 2.2) {
            c.globalAlpha = Math.min(1, cycle * 3, (2.2 - cycle) * 3);
            c.font = font(400, 13);
            c.fillText((p.poi && p.poi.emoji) || ACT_EMOJI[at.act], x, y - 10);
            c.globalAlpha = 1;
            c.font = font(600, 10);
            top = y - 18;
          }
        }
      }

      const hover = this.hoverKey === p.key;
      if (!s.subagent || hover) {
        pill(this.label(s), pal.text, pal.tagBg, top - 11, p.mode === 'work' || hover ? 1 : 0.7, true);
      } else if (badge) {
        this.agentBadge(badge, x, top - 11);
      }
      c.restore();
    }

    agentBadge(badge, x, y) {
      const c = this.ctx;
      c.save();
      c.globalAlpha = 1;
      if (badge.image.complete && badge.image.naturalWidth > 0) {
        if (badge.mono && this.pal.dark) c.filter = 'invert(1)';
        c.imageSmoothingEnabled = true;
        c.imageSmoothingQuality = 'high';
        c.drawImage(badge.image, x - 9, y - 9, 18, 18);
      } else {
        c.fillStyle = this.pal.text;
        c.font = '800 10px ui-sans-serif, system-ui, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(badge.short, x, y + 0.5);
      }
      c.restore();
    }

    moveCat(dt, now) {
      const k = this.cat;
      if (!k.path.length && now > k.until) {
        const { W, D, grid } = this.plan;
        let tx, ty, tries = 0;
        do { tx = rand(0.6, W - 0.6); ty = rand(1, D - 0.6); tries++; } while (grid.blocked(tx, ty) && tries < 30);
        k.path = grid.path(k.x, k.y, tx, ty);
        k.until = Infinity;
      }
      if (k.path.length) {
        const n = k.path[0];
        const dx = n.x - k.x, dy = n.y - k.y, d = Math.hypot(dx, dy), v = 1.2 * dt;
        if (d > 0.001) k.face = dx - dy >= 0 ? 1 : -1;
        if (d <= v) { k.x = n.x; k.y = n.y; k.path.shift(); if (!k.path.length) k.until = now + rand(4000, 12000); }
        else { k.x += (dx / d) * v; k.y += (dy / d) * v; }
      }
    }

    drawCat() {
      const k = this.cat;
      const c = this.ctx;
      const p = this.iso(k.x, k.y, 0);
      const t = this.t / 1000;
      const walking = k.path.length > 0;
      c.save();
      c.translate(p.x, p.y);
      c.scale(k.face, 1);
      c.fillStyle = this.pal.shadow;
      c.beginPath(); c.ellipse(0, 0, 8, 3, 0, 0, Math.PI * 2); c.fill();
      const col = '#e09a4a';
      c.fillStyle = col;
      if (walking) {
        const s = Math.sin(t * 14) * 1.5;
        c.fillRect(-5, -4, 2, 4 + s); c.fillRect(3, -4, 2, 4 - s);
      }
      c.beginPath(); c.ellipse(0, walking ? -6 : -4, 7, walking ? 4 : 5, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(6, walking ? -10 : -9, 3.6, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(4, -12); c.lineTo(5, -16); c.lineTo(7, -12.5); c.fill();
      c.beginPath(); c.moveTo(7, -12.5); c.lineTo(9, -15.5); c.lineTo(9.5, -11); c.fill();
      c.strokeStyle = col; c.lineWidth = 2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-6, -6); c.quadraticCurveTo(-12, -8 + Math.sin(t * 3) * 3, -10, -14); c.stroke();
      c.fillStyle = '#2a2018';
      c.fillRect(7, -10.5, 1.2, walking ? 1.2 : 0.6);
      c.restore();
    }

    pingPongBall() {
      const players = this.plan.pois
        .filter((q) => q.pair === 'pp' && q.taken)
        .map((q) => this.people.get(q.taken))
        .filter((p) => p && p.poi && p.poi.pair === 'pp' && !p.path.length);
      if (players.length < 2) return;
      const pp = this.plan.pp;
      const k = (this.t / 900) % 2;
      const f = k < 1 ? k : 2 - k;
      const x = pp.x0 + 0.3 + f * (pp.x1 - pp.x0 - 0.6);
      const z = 0.8 + Math.abs(Math.sin(f * Math.PI * 2)) * 0.45;
      const c = this.ctx;
      const sh = this.iso(x, pp.y, 0.77);
      c.fillStyle = 'rgba(0,0,0,.25)';
      c.beginPath(); c.ellipse(sh.x, sh.y, 2.5, 1.2, 0, 0, Math.PI * 2); c.fill();
      const p = this.iso(x, pp.y, z);
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(p.x, p.y, 2.2, 0, Math.PI * 2); c.fill();
    }

    // ------------------------------------------------------------ frame

    frame(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.t = now;
      if (!this.visible) return;
      this.step(dt);
      if (this.draw() !== false) {
        if (!this.first && ++this.framesShown === 3) this.markReady(true);
        // Capture immediately: a WebGL drawing buffer may be cleared after
        // this task. The overlay and the 3D canvas must be copied together.
        if (this.onFrame) this.onFrame(this);
      }
    }

    // Advance people and the cat; shared by the 2D and 3D renderers.
    step(dt) {
      const wall = Date.now();
      for (const [k, p] of this.people) {
        if (p.mode === 'wander') {
          if (p.poi && !p.path.length && p.until === Infinity) p.until = wall + p.stay;
          this.wander(p, wall);
        }
        if (p.path.length) {
          const n = p.path[0];
          const dx = n.x - p.x, dy = n.y - p.y, d = Math.hypot(dx, dy), v = SPEED * dt;
          if (d > 0.001) p.walkFace = dx + dy >= 0 ? 'front' : 'back';
          if (d <= v) { p.x = n.x; p.y = n.y; p.path.shift(); }
          else { p.x += (dx / d) * v; p.y += (dy / d) * v; }
        } else if (p.leaving) {
          this.people.delete(k);
        }
      }
      if(!this.plan.noCat)this.moveCat(dt, wall);
    }

    draw() {
      const c = this.ctx;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.clearRect(0, 0, this.cw, this.ch);
      this.fitCamera();
      c.translate(this.cam.ox, this.cam.oy);
      c.scale(this.cam.zoom, this.cam.zoom);

      const visible=this.visibleCampusRoom();
      this.plan.observationWindows=visible==='office'?this.plan.allObservationWindows:[];
      if(visible==='office')this.paintCampusExterior?.();
      this.drawRoom();
      const interior=this.getCampusInteriorItems(visible);
      for(const item of interior)if(item.type==='rug'||item.type==='carpet')this.drawCampusInteriorItem(item);
      this.drawInteriorLightPools(visible,interior);
      const occupant = new Map();
      for (const p of this.people.values()) {
        if (p.mode === 'work' && p.desk) occupant.set(p.desk, p);
        else if (p.napDesk) occupant.set(p.napDesk, p);
      }
      const items = this.plan.items.filter(item=>!item.roomId||item.roomId===visible);
      if(visible==='study'){const room=this.plan.campus.rooms.find(value=>value.id==='study');for(const[a,b]of this.studyTerraceRails(room))items.push({depth:(a[0]+b[0]+a[1]+b[1])/2,draw:()=>this.drawStudyTerraceRail(a,b)});}
      for(const item of interior.filter(item=>item.type!=='rug'&&item.type!=='carpet'))items.push({depth:item.x+item.w/2+item.y+item.d/2,draw:()=>{c.save();c.translate(0,-(item.y0||0)*TH);this.drawCampusInteriorItem(item);c.restore();}});
      const litDesks=visible==='office'?this.plan.desks:window.CampusPlan?.getStudyDesks?.()||[];
      for(const desk of litDesks)items.push({depth:desk.x+desk.y+1.2,draw:()=>this.drawInteriorTaskLamp(desk.x+.35,desk.y+.9,.9)});
      for (const dk of visible==='office'?this.plan.desks:[]) {
        const p = occupant.get(dk);
        items.push({ depth: dk.x + 0.7 + dk.y + 0.4, draw: () => this.desk(dk, p) });
        items.push({ depth: dk.seat.x + dk.seat.y - 0.06, draw: () => this.chair(dk, p) });
      }
      if(visible==='office')for (const p of this.people.values()) items.push({ depth: p.x + p.y + 0.01, person: p });
      if(visible==='study')for(const companion of this.studyCompanions||[]){const frame=this.sampleStudyCompanion?.(companion)||companion;items.push({depth:frame.x+frame.y+.01,draw:()=>this.drawStudyCompanion(companion,frame)});}
      if(!this.plan.noCat)items.push({ depth: this.cat.x + this.cat.y, draw: () => this.drawCat() });
      if(this.campusAvatar)items.push({depth:this.campusAvatar.x+this.campusAvatar.y+.02,draw:()=>this.drawCampusAvatar()});
      items.sort((a, b) => a.depth - b.depth);

      this.hit = [];
      const heads = [];
      for (const it of items) {
        if (it.person) heads.push([it.person, this.person(it.person)]);
        else it.draw();
      }
      this.pingPongBall();
      if (this.compact) {
        // Keep labels readable when the room is scaled down for PiP.
        c.save();
        c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        for (const [p, at] of heads) this.bubble(p, {
          ...at, x: at.x * this.cam.zoom + this.cam.ox, y: at.y * this.cam.zoom + this.cam.oy,
        });
        c.restore();
      } else {
        for (const [p, at] of heads) this.bubble(p, at);
      }

      if (this.offDuty > 0&&visible==='office') {
        const d = this.iso(0.2, this.plan.door.y + 0.9, 0);
        c.font = '600 10px ui-sans-serif, system-ui, -apple-system, "PingFang TC", sans-serif';
        c.textAlign = 'center';
        c.fillStyle = this.pal.text;
        c.globalAlpha = 0.65;
        c.fillText(`+${this.offDuty} ${this.offDutyLabel}`, d.x - 10, d.y + 14);
        c.globalAlpha = 1;
      }

      const z = this.cam.zoom;
      this.hit = this.hit.map((h) => ({
        key: h.key,
        x0: h.x0 * z + this.cam.ox, x1: h.x1 * z + this.cam.ox,
        y0: h.y0 * z + this.cam.oy, y1: h.y1 * z + this.cam.oy,
      }));
      if(this.campusAvatarHitRaw){const h=this.campusAvatarHitRaw;this.campusAvatarHit={x0:h.x0*z+this.cam.ox,x1:h.x1*z+this.cam.ox,y0:h.y0*z+this.cam.oy,y1:h.y1*z+this.cam.oy};}
      this.drawCampusRoomLabels();
    }
  }

  window.Office = Office;
  window.OFFICE_AGENT_BADGES = AGENT_BADGES;
  window.OfficeGrid = Grid;
})();

