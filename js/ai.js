/* ========================================================================
   AI — air hockey opponent (controls Game.state.p2)
   Three difficulties balance: reaction lag, prediction depth,
   tracking speed, intentional error, and aggression.
   ======================================================================== */
const AI = (() => {
  const DIFFS = {
    easy: {
      maxSpeed: 6,           // px / frame
      reactionFrames: 14,    // delay between perception updates
      predictionFrames: 8,   // how far to predict puck
      noisePx: 60,           // aim error
      aggression: 0.3,       // chance to attack rather than just defend
      attackSpeedMul: 0.7,
      idleY: 110,
    },
    medium: {
      maxSpeed: 9,
      reactionFrames: 6,
      predictionFrames: 28,
      noisePx: 22,
      aggression: 0.55,
      attackSpeedMul: 1.0,
      idleY: 130,
    },
    hard: {
      maxSpeed: 13,
      reactionFrames: 2,
      predictionFrames: 60,
      noisePx: 6,
      aggression: 0.85,
      attackSpeedMul: 1.4,
      idleY: 150,
    },
  };

  let cfg = DIFFS.medium;
  let active = false;
  let frame = 0;
  let target = { x: 300, y: 130 };
  let noise = { x: 0, y: 0, until: 0 };

  function start(level = 'medium') {
    cfg = DIFFS[level] || DIFFS.medium;
    active = true;
    frame = 0;
    target.x = Game.W / 2;
    target.y = cfg.idleY;
    tickLoop();
  }

  function stop() { active = false; }

  function tickLoop() {
    if (!active) return;
    tick();
    requestAnimationFrame(tickLoop);
  }

  function tick() {
    frame++;
    const s = Game.state;
    const p2 = s.p2;
    const puck = s.puck;

    // Periodically refresh aim target (simulates reaction time)
    if (frame % cfg.reactionFrames === 0) {
      computeTarget();
    }

    // Move toward target with capped speed
    const dx = (target.x + noise.x) - p2.x;
    const dy = (target.y + noise.y) - p2.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.5) {
      const step = Math.min(cfg.maxSpeed, dist);
      const nx = dx / dist, ny = dy / dist;
      const px = p2.x, py = p2.y;
      p2.x += nx * step;
      p2.y += ny * step;
      // Game's constrainPaddle is called inside its update — but we should also clamp here for safety
      if (p2.x < Game.PADDLE_R) p2.x = Game.PADDLE_R;
      if (p2.x > Game.W - Game.PADDLE_R) p2.x = Game.W - Game.PADDLE_R;
      if (p2.y < Game.PADDLE_R) p2.y = Game.PADDLE_R;
      if (p2.y > Game.H/2 - Game.PADDLE_R) p2.y = Game.H/2 - Game.PADDLE_R;
      p2.vx = p2.x - px;
      p2.vy = p2.y - py;
    } else {
      p2.vx *= 0.7; p2.vy *= 0.7;
    }
  }

  function computeTarget() {
    const s = Game.state;
    const puck = s.puck;
    const p2 = s.p2;

    // Predict puck position N frames ahead
    let px = puck.x + puck.vx * cfg.predictionFrames;
    let py = puck.y + puck.vy * cfg.predictionFrames;
    // Reflect off side walls within prediction
    if (px < Game.PUCK_R) px = Game.PUCK_R + (Game.PUCK_R - px);
    if (px > Game.W - Game.PUCK_R) px = (Game.W - Game.PUCK_R) - (px - (Game.W - Game.PUCK_R));

    // Defensive home position
    let tx = Game.W / 2;
    let ty = cfg.idleY;

    // Where is the puck?
    const puckOnAiSide = puck.y < Game.H / 2;
    const puckMovingTowardAi = puck.vy < -0.3;

    if (puckOnAiSide) {
      // The puck is on AI's half — attack or defend
      const wantsAttack = Math.random() < cfg.aggression || puck.vy >= 0;
      if (wantsAttack) {
        // Position behind the puck slightly (toward AI's goal side) to slam it down
        const offset = Game.PADDLE_R + Game.PUCK_R - 2;
        const dx = puck.x - p2.x;
        const dy = puck.y - p2.y;
        const len = Math.hypot(dx, dy) || 1;
        // approach point on the line from puck toward player side, but slightly above puck
        const aimX = Game.W / 2 + (puck.x - Game.W / 2) * 0.2; // bias toward target goal direction
        // vector from puck to (aimX, Game.H + 200) is the desired strike direction
        const desiredVx = aimX - puck.x;
        const desiredVy = (Game.H + 200) - puck.y;
        const dvLen = Math.hypot(desiredVx, desiredVy) || 1;
        // Position the paddle on the opposite side of the puck (so striking it sends it toward (aimX, Game.H))
        tx = puck.x - (desiredVx / dvLen) * offset;
        ty = puck.y - (desiredVy / dvLen) * offset;
      } else {
        // Defensive intercept
        tx = px;
        ty = Math.max(cfg.idleY * 0.6, Math.min(Game.H / 2 - Game.PADDLE_R, py));
      }
    } else if (puckMovingTowardAi) {
      // Puck on player side but heading our way — get into intercept lane
      // Predict y at AI's ready line
      const readyY = cfg.idleY;
      const framesToReady = puck.vy !== 0 ? (readyY - puck.y) / puck.vy : 0;
      let interceptX = puck.x + puck.vx * framesToReady;
      // reflect off side walls if needed
      while (interceptX < Game.PUCK_R || interceptX > Game.W - Game.PUCK_R) {
        if (interceptX < Game.PUCK_R) interceptX = 2 * Game.PUCK_R - interceptX;
        else if (interceptX > Game.W - Game.PUCK_R) interceptX = 2 * (Game.W - Game.PUCK_R) - interceptX;
      }
      tx = interceptX;
      ty = readyY;
    } else {
      // Idle — return to home
      tx = Game.W / 2 + (puck.x - Game.W / 2) * 0.3;
      ty = cfg.idleY;
    }

    // Add noise for missing
    noise.x = (Math.random() - 0.5) * cfg.noisePx;
    noise.y = (Math.random() - 0.5) * cfg.noisePx;

    target.x = tx;
    target.y = ty;
  }

  return { start, stop, DIFFS };
})();
