/* ========================================================================
   Main — wires lobby UI to game / AI / multiplayer / wallet.
   ======================================================================== */
(() => {
  // -- DOM refs --
  const $ = (id) => document.getElementById(id);
  const lobby = $('lobby');
  const gameScreen = $('game');
  const walletAmountEl = $('walletAmount');
  const walletPillEl = $('walletPill');
  const statWins = $('statWins');
  const statLosses = $('statLosses');
  const statStreak = $('statStreak');
  const statBiggest = $('statBiggest');
  const resetBtn = $('resetBtn');
  const playAiBtn = $('playAiBtn');
  const diffRow = $('diffRow');
  const aiBetButtons = document.querySelectorAll('.mode-card:not(.highlight) .chip-btn');
  const mpBetButtons = document.querySelectorAll('.chip-btn.mp-bet');
  const mpTabs = document.querySelectorAll('.mp-tab');
  const mpHostPanel = $('mpHostPanel');
  const mpJoinPanel = $('mpJoinPanel');
  const hostBtn = $('hostBtn');
  const joinBtn = $('joinBtn');
  const joinCodeInput = $('joinCodeInput');
  const roomDisplay = $('roomDisplay');
  const roomCode = $('roomCode');
  const roomHint = $('roomHint');
  const joinHint = $('joinHint');
  const copyBtn = $('copyBtn');
  const board = $('board');
  const hudP1 = $('hudP1');
  const hudP2 = $('hudP2');
  const scoreP1 = $('scoreP1');
  const scoreP2 = $('scoreP2');
  const potAmount = $('potAmount');
  const matchInfo = $('matchInfo');
  const connDot = $('connDot');
  const goalFlash = $('goalFlash');
  const countdownEl = $('countdown');
  const leaveBtn = $('leaveBtn');
  const muteBtn = $('muteBtn');
  const resultModal = $('resultModal');
  const resultBanner = $('resultBanner');
  const resultScore = $('resultScore');
  const payoutLabel = $('payoutLabel');
  const payoutAmount = $('payoutAmount');
  const rematchBtn = $('rematchBtn');
  const lobbyBtn = $('lobbyBtn');
  const toast = $('toast');
  const repoLink = $('repoLink');

  // -- state --
  let selectedDiff = 'easy';
  let selectedMult = 1.5;
  let aiBet = 50;
  let mpBet = 100;
  let mpMode = 'host';
  let currentMatch = null;  // { kind: 'ai'|'mp', bet, payout, isHost? }
  let lastSnapshot = 0;     // host snapshot throttle

  // -- init --
  Game.init(board);
  refreshWallet();
  setMute(Sound.isMuted());
  // try to populate the repo link to the user's gh repo if possible (best effort)
  // Final URL is set after deploy — kept generic in markup.

  // -- wallet UI --
  function refreshWallet() {
    const w = Wallet.load();
    walletAmountEl.textContent = w.balance.toLocaleString();
    statWins.textContent = w.wins;
    statLosses.textContent = w.losses;
    statStreak.textContent = (w.streak >= 0 ? '+' : '') + w.streak;
    statBiggest.textContent = w.biggestWin.toLocaleString();
    syncBetAvailability();
  }
  function syncBetAvailability() {
    const w = Wallet.load();
    document.querySelectorAll('.chip-btn').forEach(btn => {
      const v = parseInt(btn.dataset.bet, 10);
      btn.disabled = v > w.balance;
    });
    playAiBtn.disabled = aiBet > w.balance;
    hostBtn.disabled = mpBet > w.balance;
    joinBtn.disabled = mpBet > w.balance;
  }
  function flashWallet() {
    walletAmountEl.classList.remove('flash');
    void walletAmountEl.offsetWidth;
    walletAmountEl.classList.add('flash');
  }

  resetBtn.addEventListener('click', () => {
    if (!confirm('Reset wallet to 1,000 chips and clear stats?')) return;
    Wallet.reset();
    refreshWallet();
    showToast('Wallet reset', 'success');
  });

  // -- difficulty selector --
  diffRow.addEventListener('click', e => {
    const btn = e.target.closest('.diff-btn'); if (!btn) return;
    diffRow.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedDiff = btn.dataset.diff;
    selectedMult = parseFloat(btn.dataset.mult);
    Sound.click();
  });

  // -- bet selectors --
  aiBetButtons.forEach(btn => btn.addEventListener('click', () => {
    aiBetButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    aiBet = parseInt(btn.dataset.bet, 10);
    Sound.chip();
    syncBetAvailability();
  }));
  mpBetButtons.forEach(btn => btn.addEventListener('click', () => {
    mpBetButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    mpBet = parseInt(btn.dataset.bet, 10);
    Sound.chip();
    syncBetAvailability();
  }));

  // -- mp tabs --
  mpTabs.forEach(tab => tab.addEventListener('click', () => {
    mpTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    mpMode = tab.dataset.mp;
    mpHostPanel.classList.toggle('hidden', mpMode !== 'host');
    mpJoinPanel.classList.toggle('hidden', mpMode !== 'join');
    Sound.click();
  }));

  // -- play vs AI --
  playAiBtn.addEventListener('click', () => {
    const w = Wallet.load();
    if (aiBet > w.balance) { showToast('Not enough chips', 'error'); return; }
    Wallet.debit(aiBet);
    refreshWallet();
    flashWallet();
    const payout = Math.round(aiBet * selectedMult);
    currentMatch = { kind: 'ai', bet: aiBet, payout, diff: selectedDiff };
    enterGame({ playerName: 'YOU', oppName: `AI · ${selectedDiff.toUpperCase()}`, pot: aiBet + payout, isHost: true });
    Game.start({
      target: 7,
      mirror: false,
      onGoal: who => onGoal(who),
      onWin: who => onWin(who),
      onPaddleHit: power => Sound.paddleHit(power),
      onWallHit: power => Sound.wallHit(power),
    });
    countdown(() => AI.start(selectedDiff));
  });

  // -- host MP --
  hostBtn.addEventListener('click', () => {
    const w = Wallet.load();
    if (mpBet > w.balance) { showToast('Not enough chips', 'error'); return; }
    hostBtn.disabled = true;
    hostBtn.textContent = 'STARTING…';
    roomHint.classList.remove('error', 'success');
    roomHint.textContent = 'Connecting to broker…';
    const code = Multiplayer.host({
      onConnect: () => {
        // opponent joined — initiate handshake & deduct chips for both
        Multiplayer.send({ type: 'hello', name: 'PLAYER 1', bet: mpBet });
        roomHint.classList.add('success');
        roomHint.textContent = 'Opponent connected — starting…';
      },
      onMessage: msg => handleMpMessage(msg, true),
      onClose: () => {
        showToast('Opponent disconnected', 'error');
        leaveMatch();
      },
      onError: err => {
        roomHint.classList.add('error');
        roomHint.textContent = 'Error: ' + (err && err.type ? err.type : 'connection failed');
        hostBtn.disabled = false;
        hostBtn.textContent = 'CREATE ROOM';
      },
    });
    roomCode.textContent = code;
    roomDisplay.classList.remove('hidden');
    roomHint.classList.remove('error');
    roomHint.textContent = 'Share this code with a friend…';
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(roomCode.textContent);
      showToast('Room code copied', 'success');
    } catch {
      // fallback: select
      const range = document.createRange();
      range.selectNode(roomCode);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    }
  });

  // -- join MP --
  joinBtn.addEventListener('click', () => {
    const code = (joinCodeInput.value || '').trim().toUpperCase();
    if (!code) { joinHint.textContent = 'Enter a code'; joinHint.classList.add('error'); return; }
    const w = Wallet.load();
    if (mpBet > w.balance) { showToast('Not enough chips', 'error'); return; }
    joinBtn.disabled = true;
    joinBtn.textContent = 'CONNECTING…';
    joinHint.classList.remove('error', 'success');
    joinHint.textContent = 'Connecting…';
    Multiplayer.join(code, {
      onConnect: () => {
        Multiplayer.send({ type: 'hello', name: 'PLAYER 2', bet: mpBet });
        joinHint.classList.add('success');
        joinHint.textContent = 'Connected — waiting for host…';
      },
      onMessage: msg => handleMpMessage(msg, false),
      onClose: () => {
        showToast('Disconnected', 'error');
        leaveMatch();
        joinBtn.disabled = false;
        joinBtn.textContent = 'JOIN ROOM';
      },
      onError: err => {
        joinHint.classList.add('error');
        joinHint.textContent = 'Error: ' + (err && err.type ? err.type : 'connection failed');
        joinBtn.disabled = false;
        joinBtn.textContent = 'JOIN ROOM';
      },
    });
  });

  joinCodeInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !joinBtn.disabled) joinBtn.click();
  });

  // -- multiplayer message handler --
  let mpHelloPeer = null;
  function handleMpMessage(msg, asHost) {
    if (!msg || !msg.type) return;
    switch (msg.type) {
      case 'hello': {
        mpHelloPeer = msg;
        if (asHost) {
          // both players have committed their wager; deduct now and start
          const localBet = mpBet;
          const remoteBet = msg.bet;
          const wager = Math.min(localBet, remoteBet);  // settle on smaller wager
          Wallet.debit(wager);
          refreshWallet();
          flashWallet();
          const pot = wager * 2;
          // Host announces final settings
          Multiplayer.send({ type: 'ready', target: 7, wager });
          startMpMatch({ wager, pot, asHost: true, oppName: msg.name || 'PLAYER 2' });
        }
        break;
      }
      case 'ready': {
        if (asHost) return;
        const wager = msg.wager;
        Wallet.debit(wager);
        refreshWallet();
        flashWallet();
        const pot = wager * 2;
        startMpMatch({ wager, pot, asHost: false, oppName: (mpHelloPeer && mpHelloPeer.name) || 'HOST' });
        break;
      }
      case 'pad': {
        // received remote paddle position
        if (asHost) {
          // for the host, the remote is "p2" from host's POV but appears mirrored on the client.
          // Convention: the "pad" message is in the *sender's* local coordinates where sender is at bottom.
          // We translate: sender's bottom = host's top, so flip both axes.
          const fx = Game.W - msg.x;
          const fy = Game.H - msg.y;
          Game.setOpponentTarget(fx, fy);
        } else {
          // client: "p2" from msg sender (host) is host's local p1. Likewise flip.
          // The host actually sends 'state' for authoritative; client relies on that.
          // Ignored in client mode.
        }
        break;
      }
      case 'state': {
        // client renders host's authoritative snapshot
        if (asHost) return;
        // Convert to client's mirrored frame: host's p1 is client's opponent (p2), host's p2 is client's local (p1).
        // But client's local paddle is controlled locally (via pointer); to avoid jitter we ignore p2 in state.
        const s = msg;
        // opponent (host's p1) -> client p2 with full mirror flip
        const oppX = Game.W - s.p1.x;
        const oppY = Game.H - s.p1.y;
        Game.setOpponentTarget(oppX, oppY);
        // puck — flip
        Game.setPuck(Game.W - s.puck.x, Game.H - s.puck.y, -s.puck.vx, -s.puck.vy);
        // score — swap (host's p1 score is client's opponent score)
        Game.setScore(s.score.p2, s.score.p1);
        scoreP1.textContent = Game.state.score.p1;
        scoreP2.textContent = Game.state.score.p2;
        break;
      }
      case 'goal': {
        if (asHost) return;
        // who is in host's frame; flip for client
        const who = msg.who === 'p1' ? 'p2' : 'p1';
        Sound.goal();
        triggerGoalFx(who);
        scoreP1.textContent = Game.state.score.p1;
        scoreP2.textContent = Game.state.score.p2;
        setTimeout(() => countdown(() => {}), 300);
        break;
      }
      case 'win': {
        if (asHost) return;
        const who = msg.who === 'p1' ? 'p2' : 'p1';
        onWin(who);
        break;
      }
      case 'bye': {
        showToast('Opponent left', 'error');
        leaveMatch();
        break;
      }
    }
  }

  function startMpMatch({ wager, pot, asHost, oppName }) {
    currentMatch = { kind: 'mp', bet: wager, payout: pot, isHost: asHost };
    enterGame({
      playerName: asHost ? 'HOST' : 'YOU',
      oppName,
      pot,
      isHost: asHost,
    });
    Game.start({
      target: 7,
      interpOpponent: true,       // both: opponent paddle is updated externally + interpolated
      clientRender: !asHost,      // client skips physics/scoring, host is authoritative
      onGoal: who => {
        if (!asHost) return;      // client uses 'goal' message instead
        Sound.goal();
        triggerGoalFx(who);
        scoreP1.textContent = Game.state.score.p1;
        scoreP2.textContent = Game.state.score.p2;
        Multiplayer.send({ type: 'goal', who });
        setTimeout(() => countdown(() => {}), 300);
      },
      onWin: who => {
        if (!asHost) return;      // client uses 'win' message instead
        Multiplayer.send({ type: 'win', who });
        onWin(who);
      },
      onPaddleHit: power => Sound.paddleHit(power),
      onWallHit: power => Sound.wallHit(power),
    });

    countdown(() => {
      // Start streaming loops
      startNetworkLoops(asHost);
    });
  }

  let netRaf = 0;
  function startNetworkLoops(asHost) {
    cancelAnimationFrame(netRaf);
    const loop = () => {
      if (!currentMatch || currentMatch.kind !== 'mp') return;
      const now = performance.now();

      if (asHost) {
        // Host sends state at ~30hz
        if (now - lastSnapshot > 33) {
          lastSnapshot = now;
          const s = Game.state;
          Multiplayer.send({
            type: 'state',
            p1: { x: s.p1.x, y: s.p1.y, vx: s.p1.vx, vy: s.p1.vy },
            p2: { x: s.p2.x, y: s.p2.y, vx: s.p2.vx, vy: s.p2.vy },
            puck: { x: s.puck.x, y: s.puck.y, vx: s.puck.vx, vy: s.puck.vy },
            score: { p1: s.score.p1, p2: s.score.p2 },
            t: now,
          });
        }
      } else {
        // Client sends paddle pos at ~50hz
        if (now - lastSnapshot > 20) {
          lastSnapshot = now;
          const p1 = Game.state.p1;
          Multiplayer.send({
            type: 'pad',
            x: p1.x, y: p1.y, vx: p1.vx, vy: p1.vy,
          });
        }
      }

      // update HUD
      scoreP1.textContent = Game.state.score.p1;
      scoreP2.textContent = Game.state.score.p2;
      // connection health
      connDot.classList.toggle('bad', !Multiplayer.connected);

      netRaf = requestAnimationFrame(loop);
    };
    netRaf = requestAnimationFrame(loop);
  }

  // -- enter game / leave --
  function enterGame({ playerName, oppName, pot, isHost }) {
    lobby.classList.remove('active');
    gameScreen.classList.add('active');
    hudP1.textContent = playerName;
    hudP2.textContent = oppName;
    Game.setNames(playerName, oppName);
    scoreP1.textContent = 0;
    scoreP2.textContent = 0;
    potAmount.textContent = pot.toLocaleString();
    matchInfo.textContent = 'FIRST TO 7';
    connDot.classList.toggle('bad', currentMatch?.kind === 'mp' && !Multiplayer.connected);
  }

  leaveBtn.addEventListener('click', () => {
    if (currentMatch && currentMatch.kind === 'mp') {
      // forfeit: don't refund
      Multiplayer.send({ type: 'bye' });
    } else {
      // forfeit AI: lose bet (already debited)
    }
    leaveMatch();
  });

  function leaveMatch() {
    AI.stop();
    Game.stop();
    Multiplayer.close();
    cancelAnimationFrame(netRaf);
    currentMatch = null;
    gameScreen.classList.remove('active');
    lobby.classList.add('active');
    resultModal.classList.add('hidden');
    // reset MP UI
    hostBtn.disabled = false;
    hostBtn.textContent = 'CREATE ROOM';
    joinBtn.disabled = false;
    joinBtn.textContent = 'JOIN ROOM';
    roomDisplay.classList.add('hidden');
    roomHint.textContent = '';
    joinHint.textContent = '';
    joinCodeInput.value = '';
    if (Wallet.topUpIfBroke()) showToast('Free top-up: 100 chips', 'success');
    refreshWallet();
  }

  // -- goal / win handling --
  function onGoal(who) {
    Sound.goal();
    triggerGoalFx(who);
    scoreP1.textContent = Game.state.score.p1;
    scoreP2.textContent = Game.state.score.p2;
    // small countdown before resume
    setTimeout(() => countdown(() => {}), 300);
  }
  function triggerGoalFx(who) {
    goalFlash.classList.remove('show');
    void goalFlash.offsetWidth;
    goalFlash.classList.add('show');
  }

  function onWin(who) {
    if (!currentMatch) return;
    AI.stop();
    cancelAnimationFrame(netRaf);
    const playerWon = who === 'p1';
    let payout = 0;
    if (playerWon) {
      payout = currentMatch.payout;
      Wallet.credit(payout);
      Wallet.recordResult(true, payout);
      Sound.win();
    } else {
      Wallet.recordResult(false, 0);
      Sound.loss();
    }
    refreshWallet();
    flashWallet();
    showResult(playerWon, payout);
  }

  function showResult(won, payout) {
    resultBanner.textContent = won ? 'VICTORY' : 'DEFEAT';
    resultBanner.classList.toggle('loss', !won);
    resultScore.textContent = `${Game.state.score.p1} — ${Game.state.score.p2}`;
    payoutLabel.textContent = won ? 'PAYOUT' : 'LOST';
    payoutAmount.textContent = won ? `+${payout.toLocaleString()}` : `−${currentMatch.bet.toLocaleString()}`;
    payoutAmount.classList.toggle('loss', !won);
    resultModal.classList.remove('hidden');
    Multiplayer.close();
  }

  rematchBtn.addEventListener('click', () => {
    if (!currentMatch) return leaveMatch();
    const m = currentMatch;
    resultModal.classList.add('hidden');
    if (m.kind === 'ai') {
      const w = Wallet.load();
      if (m.bet > w.balance) { showToast('Not enough chips', 'error'); leaveMatch(); return; }
      Wallet.debit(m.bet);
      refreshWallet();
      currentMatch = { ...m };
      Game.reset();
      scoreP1.textContent = 0; scoreP2.textContent = 0;
      Game.start({
        target: 7,
        onGoal: who => onGoal(who),
        onWin: who => onWin(who),
        onPaddleHit: power => Sound.paddleHit(power),
        onWallHit: power => Sound.wallHit(power),
      });
      countdown(() => AI.start(m.diff));
    } else {
      // MP rematch needs full re-handshake (peer connection closed).
      leaveMatch();
    }
  });
  lobbyBtn.addEventListener('click', () => leaveMatch());

  // -- countdown --
  function countdown(then) {
    Game.pause(true);
    let n = 3;
    const tick = () => {
      countdownEl.textContent = n > 0 ? String(n) : 'GO!';
      countdownEl.classList.remove('show');
      void countdownEl.offsetWidth;
      countdownEl.classList.add('show');
      if (n > 0) Sound.countdown(); else Sound.go();
      if (n === 0) {
        setTimeout(() => { countdownEl.classList.remove('show'); }, 700);
        Game.pause(false);
        then && then();
      } else {
        n--;
        setTimeout(tick, 800);
      }
    };
    tick();
  }

  // -- toast --
  let toastTimer = 0;
  function showToast(msg, kind = '') {
    toast.textContent = msg;
    toast.className = 'toast ' + kind;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 2200);
  }

  // -- mute --
  muteBtn.addEventListener('click', () => setMute(Sound.toggle()));
  function setMute(m) {
    muteBtn.classList.toggle('muted', m);
    muteBtn.title = m ? 'Sound off' : 'Sound on';
  }

  // -- wallet pill: small bonus on click if broke --
  walletPillEl.addEventListener('click', () => {
    if (Wallet.topUpIfBroke()) { showToast('Free top-up: 100 chips', 'success'); refreshWallet(); flashWallet(); }
  });

  // -- prevent context menu on canvas (right click) --
  board.addEventListener('contextmenu', e => e.preventDefault());

  // -- keep canvas displayed at the right size --
  window.addEventListener('resize', () => {
    // Game listens internally; nothing else needed.
  });
})();
