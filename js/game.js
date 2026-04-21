/* ========================================================================
   Game — air hockey physics + canvas rendering
   Coordinate system: 600 wide x 900 tall.
   Player 1 (you) defends bottom (y=900). Player 2 defends top (y=0).
   In multiplayer: each side sees themselves at the bottom (we mirror render).
   ======================================================================== */
const Game = (() => {
  // --- world constants ---
  const W = 600;
  const H = 900;
  const PADDLE_R = 38;
  const PUCK_R   = 24;
  const GOAL_W   = 200;          // goal mouth width
  const PUCK_FRICTION = 0.9965;  // per-frame velocity decay (60fps target)
  const PUCK_RESTITUTION = 0.92; // wall bounce energy retention
  const PADDLE_TRANSFER = 1.1;   // multiplier on impulse from paddle motion
  const MAX_PUCK_SPEED = 28;
  const MIN_PUCK_BOUNCE_SPEED = 0.6;

  // --- state ---
  let canvas, ctx;
  let scale = 1;          // CSS scale applied to canvas
  let cssRect = null;
  const state = {
    running: false,
    paused: false,
    mirror: false,        // when true, render flipped (so player always at bottom)
    p1: { x: W/2, y: H - 80, vx: 0, vy: 0, color: '#00f0ff', name: 'YOU' },
    p2: { x: W/2, y: 80,     vx: 0, vy: 0, color: '#ff2bd6', name: 'AI'  },
    puck: { x: W/2, y: H/2, vx: 0, vy: 0 },
    score: { p1: 0, p2: 0 },
    target: 7,
    onGoal: null,
    onWin: null,
    onPaddleHit: null,
    onWallHit: null,
    // For trail rendering
    puckTrail: [],
    // Particles for goal celebration
    particles: [],
    // Pointer (input)
    pointer: { active: false, x: W/2, y: H - 80 },
    // Last paddle position for velocity calculation
    p1Prev: { x: W/2, y: H - 80 },
    // Smoothing for opponent (multiplayer interpolation)
    p2Target: { x: W/2, y: 80 },
    interpOpponent: false,
  };

  // --- init ---
  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    canvas.width = W; canvas.height = H;
    attachInput();
    handleResize();
    window.addEventListener('resize', handleResize);
  }

  function handleResize() {
    cssRect = canvas.getBoundingClientRect();
    scale = cssRect.width / W;
  }

  function reset() {
    state.score.p1 = 0;
    state.score.p2 = 0;
    state.particles = [];
    state.puckTrail = [];
    centerPuck(0);
  }

  function centerPuck(servingDir = 0) {
    state.puck.x = W / 2;
    state.puck.y = H / 2;
    // give a small initial nudge toward the player who was scored on (if specified)
    state.puck.vx = (Math.random() - 0.5) * 1.2;
    state.puck.vy = servingDir ? servingDir * 1.5 : (Math.random() - 0.5) * 1.5;
    state.p1.vx = 0; state.p1.vy = 0;
    state.p2.vx = 0; state.p2.vy = 0;
  }

  function start({ target = 7, onGoal, onWin, onPaddleHit, onWallHit, interpOpponent = false, clientRender = false } = {}) {
    state.target = target;
    state.onGoal = onGoal;
    state.onWin = onWin;
    state.onPaddleHit = onPaddleHit;
    state.onWallHit = onWallHit;
    state.interpOpponent = interpOpponent;
    state.clientRender = clientRender;
    reset();
    state.running = true;
    state.paused = false;
    requestAnimationFrame(loop);
  }

  function stop() {
    state.running = false;
  }

  function pause(p) { state.paused = !!p; }

  // --- input handling ---
  function attachInput() {
    const localCoords = (clientX, clientY) => {
      const r = canvas.getBoundingClientRect();
      const x = (clientX - r.left) / r.width  * W;
      const y = (clientY - r.top)  / r.height * H;
      return { x, y };
    };

    const update = (clientX, clientY) => {
      const p = localCoords(clientX, clientY);
      state.pointer.active = true;
      state.pointer.x = p.x;
      state.pointer.y = p.y;
    };

    canvas.addEventListener('mousemove', e => update(e.clientX, e.clientY));
    canvas.addEventListener('mousedown', e => update(e.clientX, e.clientY));
    canvas.addEventListener('mouseleave', () => { state.pointer.active = false; });

    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.touches[0]; if (t) update(t.clientX, t.clientY);
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      const t = e.touches[0]; if (t) update(t.clientX, t.clientY);
    }, { passive: false });
    canvas.addEventListener('touchend', e => { e.preventDefault(); }, { passive: false });
  }

  // --- main loop ---
  let lastTs = 0;
  function loop(ts) {
    if (!state.running) return;
    if (!state.paused) {
      update();
      render();
    }
    lastTs = ts;
    requestAnimationFrame(loop);
  }

  // --- physics ---
  function update() {
    // 1. update player paddle from pointer (constrained to bottom half)
    const p1 = state.p1;
    state.p1Prev.x = p1.x; state.p1Prev.y = p1.y;
    if (state.pointer.active) {
      const dx = state.pointer.x - p1.x;
      const dy = state.pointer.y - p1.y;
      // soft follow with cap so paddle responsiveness has natural feel
      const followSpeed = 0.65;
      p1.x += dx * followSpeed;
      p1.y += dy * followSpeed;
    }
    constrainPaddle(p1, /*bottom*/ true);
    p1.vx = (p1.x - state.p1Prev.x);
    p1.vy = (p1.y - state.p1Prev.y);

    // 2. update opponent — controlled externally (AI or remote). We optionally interpolate.
    if (state.interpOpponent) {
      const p2 = state.p2;
      const t = 0.35;  // smoothing factor
      const px = p2.x, py = p2.y;
      p2.x += (state.p2Target.x - p2.x) * t;
      p2.y += (state.p2Target.y - p2.y) * t;
      p2.vx = p2.x - px;
      p2.vy = p2.y - py;
      constrainPaddle(p2, /*bottom*/ false);
    }

    // 3. integrate puck (client just extrapolates between snapshots; host is authoritative)
    const puck = state.puck;
    puck.x += puck.vx;
    puck.y += puck.vy;

    if (state.clientRender) {
      // client doesn't run physics or scoring — only renders extrapolated puck + particles
      state.puckTrail.unshift({ x: puck.x, y: puck.y });
      if (state.puckTrail.length > 14) state.puckTrail.length = 14;
      for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.x += p.vx; p.y += p.vy;
        p.vx *= 0.96; p.vy *= 0.96;
        p.life -= 1;
        if (p.life <= 0) state.particles.splice(i, 1);
      }
      return;
    }

    puck.vx *= PUCK_FRICTION;
    puck.vy *= PUCK_FRICTION;

    // clamp speed
    const sp = Math.hypot(puck.vx, puck.vy);
    if (sp > MAX_PUCK_SPEED) {
      const k = MAX_PUCK_SPEED / sp;
      puck.vx *= k; puck.vy *= k;
    }

    // 4. wall collisions (left/right always; top/bottom except in goal mouth)
    if (puck.x - PUCK_R < 0) {
      puck.x = PUCK_R;
      puck.vx = -puck.vx * PUCK_RESTITUTION;
      if (Math.abs(puck.vx) > MIN_PUCK_BOUNCE_SPEED) state.onWallHit?.(Math.abs(puck.vx));
    }
    if (puck.x + PUCK_R > W) {
      puck.x = W - PUCK_R;
      puck.vx = -puck.vx * PUCK_RESTITUTION;
      if (Math.abs(puck.vx) > MIN_PUCK_BOUNCE_SPEED) state.onWallHit?.(Math.abs(puck.vx));
    }

    // top wall / goal
    {
      const inGoal = puck.x > (W - GOAL_W) / 2 && puck.x < (W + GOAL_W) / 2;
      if (puck.y < -PUCK_R) {
        // puck fully past the goal line
        if (inGoal) {
          state.score.p1++;
          spawnGoalParticles(puck.x, 0, '#00f0ff');
          state.onGoal?.('p1');
          if (state.score.p1 >= state.target) { state.running = false; state.onWin?.('p1'); return; }
          centerPuck(+1);
          return;
        }
        // safety: outside goal, snap back
        puck.y = PUCK_R;
        puck.vy = Math.abs(puck.vy) * PUCK_RESTITUTION;
      } else if (!inGoal && puck.y - PUCK_R < 0) {
        // hit top wall outside goal mouth
        puck.y = PUCK_R;
        puck.vy = -puck.vy * PUCK_RESTITUTION;
        if (Math.abs(puck.vy) > MIN_PUCK_BOUNCE_SPEED) state.onWallHit?.(Math.abs(puck.vy));
      }
      // if inGoal and puck.y still inside table, let it travel through unobstructed
    }

    // bottom wall / goal
    {
      const inGoal = puck.x > (W - GOAL_W) / 2 && puck.x < (W + GOAL_W) / 2;
      if (puck.y > H + PUCK_R) {
        if (inGoal) {
          state.score.p2++;
          spawnGoalParticles(puck.x, H, '#ff2bd6');
          state.onGoal?.('p2');
          if (state.score.p2 >= state.target) { state.running = false; state.onWin?.('p2'); return; }
          centerPuck(-1);
          return;
        }
        puck.y = H - PUCK_R;
        puck.vy = -Math.abs(puck.vy) * PUCK_RESTITUTION;
      } else if (!inGoal && puck.y + PUCK_R > H) {
        puck.y = H - PUCK_R;
        puck.vy = -puck.vy * PUCK_RESTITUTION;
        if (Math.abs(puck.vy) > MIN_PUCK_BOUNCE_SPEED) state.onWallHit?.(Math.abs(puck.vy));
      }
    }

    // 5. paddle collisions
    paddleCollide(p1);
    paddleCollide(state.p2);

    // 6. trail
    state.puckTrail.unshift({ x: puck.x, y: puck.y });
    if (state.puckTrail.length > 14) state.puckTrail.length = 14;

    // 7. particles
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.96; p.vy *= 0.96;
      p.life -= 1;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
  }

  function constrainPaddle(p, isBottom) {
    // keep paddle inside walls & on its own half
    const minY = isBottom ? H/2 + PADDLE_R : PADDLE_R;
    const maxY = isBottom ? H - PADDLE_R   : H/2 - PADDLE_R;
    if (p.x < PADDLE_R) p.x = PADDLE_R;
    if (p.x > W - PADDLE_R) p.x = W - PADDLE_R;
    if (p.y < minY) p.y = minY;
    if (p.y > maxY) p.y = maxY;
  }

  function paddleCollide(paddle) {
    const puck = state.puck;
    const dx = puck.x - paddle.x;
    const dy = puck.y - paddle.y;
    const dist = Math.hypot(dx, dy);
    const minDist = PADDLE_R + PUCK_R;
    if (dist < minDist && dist > 0.001) {
      // separate
      const nx = dx / dist, ny = dy / dist;
      const overlap = minDist - dist;
      puck.x += nx * overlap;
      puck.y += ny * overlap;

      // relative velocity along normal
      const rvx = puck.vx - paddle.vx;
      const rvy = puck.vy - paddle.vy;
      const velAlongNormal = rvx * nx + rvy * ny;
      if (velAlongNormal < 0) {
        // bounce + transfer paddle velocity
        const j = -(1 + 0.5) * velAlongNormal;
        puck.vx += j * nx;
        puck.vy += j * ny;
        // additional kick from paddle motion
        puck.vx += paddle.vx * PADDLE_TRANSFER;
        puck.vy += paddle.vy * PADDLE_TRANSFER;
        const power = Math.min(1, Math.hypot(puck.vx, puck.vy) / 18);
        state.onPaddleHit?.(power, paddle === state.p1 ? 'p1' : 'p2');
      }
    }
  }

  function spawnGoalParticles(x, y, color) {
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 6;
      state.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color,
      });
    }
  }

  // --- rendering ---
  function render() {
    drawTable();
    drawTrail();
    drawParticles();
    drawPaddle(state.p2);
    drawPaddle(state.p1);
    drawPuck();
  }

  function drawTable() {
    // backdrop gradient
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#170b2a');
    g.addColorStop(0.5, '#0d0d22');
    g.addColorStop(1, '#170b2a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // glowing center seam
    const c = ctx.createLinearGradient(0, H/2 - 1, 0, H/2 + 1);
    c.addColorStop(0, 'transparent');
    c.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)');
    c.addColorStop(1, 'transparent');
    ctx.fillStyle = c;
    ctx.fillRect(0, H/2 - 8, W, 16);
    // dashed line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.moveTo(0, H/2);
    ctx.lineTo(W, H/2);
    ctx.stroke();
    ctx.setLineDash([]);

    // center circle
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(W/2, H/2, 90, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W/2, H/2, 30, 0, Math.PI * 2);
    ctx.stroke();

    // goal areas (semicircles)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.beginPath(); ctx.arc(W/2, 0, 130, 0, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(W/2, H, 130, Math.PI, Math.PI * 2); ctx.stroke();

    // goal mouths (lit strips)
    const goalLeft = (W - GOAL_W) / 2;
    const grad1 = ctx.createLinearGradient(0, 0, 0, 24);
    grad1.addColorStop(0, 'rgba(0, 240, 255, 0.7)');
    grad1.addColorStop(1, 'rgba(0, 240, 255, 0.0)');
    ctx.fillStyle = grad1;
    ctx.fillRect(goalLeft, 0, GOAL_W, 24);

    const grad2 = ctx.createLinearGradient(0, H - 24, 0, H);
    grad2.addColorStop(0, 'rgba(255, 43, 214, 0.0)');
    grad2.addColorStop(1, 'rgba(255, 43, 214, 0.7)');
    ctx.fillStyle = grad2;
    ctx.fillRect(goalLeft, H - 24, GOAL_W, 24);

    // border glow
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, W - 3, H - 3);

    // corner accents
    drawCornerAccent(0, 0, 0, '#00f0ff');
    drawCornerAccent(W, 0, Math.PI/2, '#00f0ff');
    drawCornerAccent(W, H, Math.PI, '#ff2bd6');
    drawCornerAccent(0, H, -Math.PI/2, '#ff2bd6');
  }

  function drawCornerAccent(x, y, rot, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(0, 0);
    ctx.lineTo(0, 20);
    ctx.stroke();
    ctx.restore();
  }

  function drawTrail() {
    for (let i = state.puckTrail.length - 1; i >= 0; i--) {
      const t = state.puckTrail[i];
      const alpha = (1 - i / state.puckTrail.length) * 0.35;
      ctx.fillStyle = `rgba(255, 204, 51, ${alpha})`;
      ctx.beginPath();
      ctx.arc(t.x, t.y, PUCK_R * (1 - i * 0.04), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawParticles() {
    for (const p of state.particles) {
      const a = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, a);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4 * a + 1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPaddle(p) {
    // outer glow
    ctx.save();
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 24;

    // base disc
    const grad = ctx.createRadialGradient(p.x, p.y - 8, 4, p.x, p.y, PADDLE_R);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.4, p.color);
    grad.addColorStop(1, '#1a1a2e');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PADDLE_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // ring
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PADDLE_R - 4, 0, Math.PI * 2);
    ctx.stroke();

    // center hole
    ctx.fillStyle = '#0a0a14';
    ctx.beginPath();
    ctx.arc(p.x, p.y, PADDLE_R * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawPuck() {
    const p = state.puck;
    ctx.save();
    ctx.shadowColor = '#ffcc33';
    ctx.shadowBlur = 18;
    const grad = ctx.createRadialGradient(p.x - 5, p.y - 5, 2, p.x, p.y, PUCK_R);
    grad.addColorStop(0, '#fff5cc');
    grad.addColorStop(0.5, '#ffcc33');
    grad.addColorStop(1, '#7a4f00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PUCK_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PUCK_R - 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  // --- public ---
  return {
    init, start, stop, pause, reset,
    state,
    W, H, PADDLE_R, PUCK_R, GOAL_W,
    setOpponentTarget(x, y) { state.p2Target.x = x; state.p2Target.y = y; },
    setOpponentInstant(x, y, vx = 0, vy = 0) {
      state.p2.x = x; state.p2.y = y; state.p2.vx = vx; state.p2.vy = vy;
    },
    setPuck(x, y, vx, vy) {
      state.puck.x = x; state.puck.y = y; state.puck.vx = vx; state.puck.vy = vy;
    },
    setScore(p1, p2) { state.score.p1 = p1; state.score.p2 = p2; },
    setNames(p1, p2) { state.p1.name = p1; state.p2.name = p2; },
  };
})();
