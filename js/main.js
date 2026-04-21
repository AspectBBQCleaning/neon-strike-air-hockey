/* ========================================================================
   Main — wires lobby UI to game / AI / multiplayer / wallet / auth.
   ======================================================================== */
(() => {
  // -- DOM refs --
  const $ = (id) => document.getElementById(id);
  const lobby = $('lobby');
  const gameScreen = $('game');

  // top bar
  const accountChip = $('accountChip');
  const accountIcon = $('accountIcon');
  const accountName = $('accountName');
  const walletPillEl = $('walletPill');
  const walletAmountEl = $('walletAmount');
  const walletSymbolEl = $('walletSymbol');
  const walletLabelEl = $('walletLabel');
  const settingsBtn = $('settingsBtn');
  const pingPill = $('pingPill');
  const pingMs = $('pingMs');

  // currency strip
  const currencyTabs = $('currencyTabs');
  const depositOpenBtn = $('depositOpenBtn');
  const depositOpenBtn2 = $('depositOpenBtn2');

  // bet/diff
  const aiBetCur = $('aiBetCur');
  const mpBetCur = $('mpBetCur');
  const aiBetControls = $('aiBetControls');
  const mpBetControls = $('mpBetControls');
  const playAiBtn = $('playAiBtn');
  const diffRow = $('diffRow');

  // stats
  const statWins = $('statWins');
  const statLosses = $('statLosses');
  const statStreak = $('statStreak');
  const statBiggest = $('statBiggest');

  // mp
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

  // game
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

  // result
  const resultModal = $('resultModal');
  const resultBanner = $('resultBanner');
  const resultScore = $('resultScore');
  const payoutLabel = $('payoutLabel');
  const payoutAmount = $('payoutAmount');
  const rematchBtn = $('rematchBtn');
  const lobbyBtn = $('lobbyBtn');

  // wallet modal
  const walletModal = $('walletModal');
  const walletChips = $('walletChips');
  const walletBtc = $('walletBtc');
  const walletXrp = $('walletXrp');
  const btcInChips = $('btcInChips');
  const xrpInChips = $('xrpInChips');
  const resetBtn = $('resetBtn');

  // deposit modal
  const depositModal = $('depositModal');
  const depositTabs = $('depositTabs');
  const depositPresets = $('depositPresets');
  const faucetBtn = $('faucetBtn');
  const faucetHint = $('faucetHint');

  // auth modal
  const authModal = $('authModal');
  const authTabs = $('authTabs');
  const authForm = $('authForm');
  const authUser = $('authUser');
  const authPass = $('authPass');
  const authSubmit = $('authSubmit');
  const authHint = $('authHint');

  // settings modal
  const settingsModal = $('settingsModal');
  const settingsAccountName = $('settingsAccountName');
  const settingsAuthBtn = $('settingsAuthBtn');
  const settingsLogoutRow = $('settingsLogoutRow');
  const settingsLogoutBtn = $('settingsLogoutBtn');
  const togglePing = $('togglePing');
  const toggleSound = $('toggleSound');
  const settingsResetBtn = $('settingsResetBtn');

  const toast = $('toast');

  // -- bet presets per currency --
  const PRESETS = {
    chips: [10, 50, 100, 200, 500],
    btc:   [0.0001, 0.0005, 0.001, 0.005, 0.01],
    xrp:   [50, 100, 500, 1000, 5000],
  };
  const DEPOSIT_PRESETS = {
    chips: [100, 500, 1000, 5000, 10000, 50000],
    btc:   [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05],
    xrp:   [100, 500, 1000, 5000, 10000, 50000],
  };

  // -- state --
  let activeCurrency = localStorage.getItem('ns_active_currency') || 'chips';
  let selectedDiff = 'easy';
  let selectedMult = 1.5;
  let aiBet = PRESETS.chips[1];   // 50 chips default
  let mpBet = PRESETS.chips[2];   // 100 chips default
  let depositCur = 'chips';
  let authMode = 'login';
  let currentMatch = null;
  let lastSnapshot = 0;
  let mpHelloPeer = null;
  let netRaf = 0;
  let pingTimer = 0;
  let showPing = localStorage.getItem('ns_show_ping') === '1';

  // -- init --
  Game.init(board);
  refreshAccount();
  refreshWallet();
  buildBetControls('ai');
  buildBetControls('mp');
  buildDepositPresets();
  setMute(Sound.isMuted());
  toggleSound.checked = !Sound.isMuted();
  togglePing.checked = showPing;
  applyPingVisibility();

  // -- helpers --
  function showToast(msg, kind = '') {
    toast.textContent = msg;
    toast.className = 'toast ' + kind;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.add('hidden'), 2200);
  }
  function openModal(id) { $(id).classList.remove('hidden'); }
  function closeModal(id) { $(id).classList.add('hidden'); }
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));

  function fmt(currency, amount) { return Wallet.format(currency, amount); }
  function sym(currency) { return Wallet.symbol(currency); }
  function curLabel(c) { return c === 'btc' ? 'BTC' : c === 'xrp' ? 'XRP' : 'CHIPS'; }

  function refreshAccount() {
    const id = Auth.currentId();
    const display = id === 'guest' ? 'Guest' : '@' + id;
    accountName.textContent = display;
    accountIcon.textContent = (id === 'guest' ? 'G' : id.charAt(0).toUpperCase());
    settingsAccountName.textContent = id === 'guest' ? 'Playing as Guest' : 'Signed in as @' + id;
    settingsAuthBtn.textContent = id === 'guest' ? 'SIGN IN' : 'SWITCH';
    settingsLogoutRow.classList.toggle('hidden', id === 'guest');
  }

  function refreshWallet() {
    const w = Wallet.load();
    walletAmountEl.textContent = fmt(activeCurrency, w[activeCurrency]);
    walletSymbolEl.textContent = sym(activeCurrency);
    walletLabelEl.textContent = curLabel(activeCurrency);
    statWins.textContent = w.wins;
    statLosses.textContent = w.losses;
    statStreak.textContent = (w.streak >= 0 ? '+' : '') + w.streak;
    statBiggest.textContent = Math.round(w.biggestWinChips).toLocaleString();
    walletChips.textContent = fmt('chips', w.chips);
    walletBtc.textContent = fmt('btc', w.btc);
    walletXrp.textContent = fmt('xrp', w.xrp);
    btcInChips.textContent = Math.round(Wallet.inChips('btc', w.btc)).toLocaleString();
    xrpInChips.textContent = Math.round(Wallet.inChips('xrp', w.xrp)).toLocaleString();
    syncBetAvailability();
  }
  function syncBetAvailability() {
    const w = Wallet.load();
    document.querySelectorAll('#aiBetControls .chip-btn').forEach(btn => {
      const v = parseFloat(btn.dataset.bet);
      btn.disabled = v > (w[activeCurrency] || 0);
    });
    document.querySelectorAll('#mpBetControls .chip-btn').forEach(btn => {
      const v = parseFloat(btn.dataset.bet);
      btn.disabled = v > (w[activeCurrency] || 0);
    });
    playAiBtn.disabled = aiBet > (w[activeCurrency] || 0);
    hostBtn.disabled = mpBet > (w[activeCurrency] || 0);
    joinBtn.disabled = mpBet > (w[activeCurrency] || 0);
  }
  function flashWallet() {
    walletAmountEl.classList.remove('flash');
    void walletAmountEl.offsetWidth;
    walletAmountEl.classList.add('flash');
  }

  // -- bet controls (per currency) --
  function buildBetControls(mode) {
    const el = mode === 'ai' ? aiBetControls : mpBetControls;
    const presets = PRESETS[activeCurrency];
    const defaultIdx = mode === 'ai' ? 1 : 2;
    el.innerHTML = '';
    presets.forEach((v, i) => {
      const btn = document.createElement('button');
      btn.className = 'chip-btn' + (i === defaultIdx ? ' active' : '');
      btn.dataset.bet = String(v);
      btn.textContent = formatBetButton(activeCurrency, v);
      btn.addEventListener('click', () => {
        el.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (mode === 'ai') aiBet = v; else mpBet = v;
        Sound.chip();
        syncBetAvailability();
      });
      el.appendChild(btn);
    });
    if (mode === 'ai') aiBet = presets[defaultIdx];
    else mpBet = presets[defaultIdx];
    (mode === 'ai' ? aiBetCur : mpBetCur).textContent = curLabel(activeCurrency);
  }
  function formatBetButton(currency, v) {
    if (currency === 'btc') return v.toFixed(4);
    if (currency === 'xrp') return v >= 1000 ? (v/1000).toFixed(0) + 'K' : String(v);
    return v >= 1000 ? (v/1000).toFixed(0) + 'K' : String(v);
  }

  // -- currency picker --
  currencyTabs.addEventListener('click', e => {
    const btn = e.target.closest('.cur-tab'); if (!btn) return;
    setCurrency(btn.dataset.cur);
  });
  function setCurrency(cur) {
    activeCurrency = cur;
    localStorage.setItem('ns_active_currency', cur);
    currencyTabs.querySelectorAll('.cur-tab').forEach(b => b.classList.toggle('active', b.dataset.cur === cur));
    buildBetControls('ai');
    buildBetControls('mp');
    refreshWallet();
    Sound.chip();
  }

  // -- difficulty --
  diffRow.addEventListener('click', e => {
    const btn = e.target.closest('.diff-btn'); if (!btn) return;
    diffRow.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedDiff = btn.dataset.diff;
    selectedMult = parseFloat(btn.dataset.mult);
    Sound.click();
  });

  // -- account chip / auth modal --
  accountChip.addEventListener('click', () => openAuthModal('login'));
  function openAuthModal(mode = 'login') {
    authMode = mode;
    authTabs.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.auth === mode));
    authSubmit.textContent = mode === 'login' ? 'LOG IN' : 'SIGN UP';
    authPass.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    authHint.textContent = '';
    authHint.className = 'modal-hint';
    openModal('authModal');
    setTimeout(() => authUser.focus(), 50);
  }
  authTabs.addEventListener('click', e => {
    const t = e.target.closest('.auth-tab'); if (!t) return;
    authMode = t.dataset.auth;
    authTabs.querySelectorAll('.auth-tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    authSubmit.textContent = authMode === 'login' ? 'LOG IN' : 'SIGN UP';
    authHint.textContent = '';
    authHint.className = 'modal-hint';
  });
  authForm.addEventListener('submit', async e => {
    e.preventDefault();
    authSubmit.disabled = true;
    authHint.textContent = '';
    const u = authUser.value;
    const p = authPass.value;
    const fn = authMode === 'login' ? Auth.login : Auth.signup;
    const r = await fn(u, p);
    authSubmit.disabled = false;
    if (!r.ok) {
      authHint.textContent = r.error;
      authHint.className = 'modal-hint error';
      return;
    }
    authHint.textContent = (authMode === 'login' ? 'Welcome back, @' : 'Account created, @') + r.username;
    authHint.className = 'modal-hint success';
    closeModal('authModal');
    refreshAccount();
    refreshWallet();
    showToast('Signed in as @' + r.username, 'success');
  });

  // -- settings --
  settingsBtn.addEventListener('click', () => openModal('settingsModal'));
  settingsAuthBtn.addEventListener('click', () => { closeModal('settingsModal'); openAuthModal('login'); });
  settingsLogoutBtn.addEventListener('click', () => {
    Auth.logout();
    refreshAccount();
    refreshWallet();
    showToast('Logged out', 'success');
  });
  togglePing.addEventListener('change', () => {
    showPing = togglePing.checked;
    localStorage.setItem('ns_show_ping', showPing ? '1' : '0');
    applyPingVisibility();
  });
  toggleSound.addEventListener('change', () => {
    if (toggleSound.checked && Sound.isMuted()) Sound.toggle();
    if (!toggleSound.checked && !Sound.isMuted()) Sound.toggle();
    setMute(Sound.isMuted());
  });
  settingsResetBtn.addEventListener('click', () => {
    if (!confirm('Reset balances and stats for the current account?')) return;
    Wallet.reset();
    refreshWallet();
    showToast('Account reset', 'success');
  });

  function applyPingVisibility() {
    const live = !!(currentMatch && currentMatch.kind === 'mp');
    pingPill.classList.toggle('hidden', !(showPing && live));
  }

  // -- wallet modal --
  walletPillEl.addEventListener('click', () => {
    if (Wallet.topUpIfBroke()) showToast('Free top-up: 100 chips', 'success');
    refreshWallet();
    openModal('walletModal');
  });
  resetBtn.addEventListener('click', () => {
    if (!confirm('Reset balances and stats for the current account?')) return;
    Wallet.reset();
    refreshWallet();
    showToast('Account reset', 'success');
  });

  // -- deposit modal --
  depositOpenBtn.addEventListener('click', () => openDeposit(activeCurrency));
  depositOpenBtn2.addEventListener('click', () => openDeposit(activeCurrency));
  function openDeposit(cur) {
    closeModal('walletModal');
    setDepositCur(cur);
    refreshFaucet();
    openModal('depositModal');
  }
  depositTabs.addEventListener('click', e => {
    const t = e.target.closest('.dep-tab'); if (!t) return;
    setDepositCur(t.dataset.cur);
  });
  function setDepositCur(cur) {
    depositCur = cur;
    depositTabs.querySelectorAll('.dep-tab').forEach(b => b.classList.toggle('active', b.dataset.cur === cur));
    buildDepositPresets();
    refreshFaucet();
  }
  function buildDepositPresets() {
    depositPresets.innerHTML = '';
    const arr = DEPOSIT_PRESETS[depositCur];
    arr.forEach(v => {
      const btn = document.createElement('button');
      btn.className = 'dep-preset';
      const inChipsEq = Wallet.inChips(depositCur, v);
      btn.innerHTML = `<span class="dp-amt">${formatBetButton(depositCur, v)} ${sym(depositCur)}</span><span class="dp-sub">≈ ${Math.round(inChipsEq).toLocaleString()} ◎</span>`;
      btn.addEventListener('click', () => {
        Wallet.deposit(depositCur, v);
        refreshWallet();
        flashWallet();
        Sound.chip();
        showToast(`+${formatBetButton(depositCur, v)} ${sym(depositCur)} deposited (demo)`, 'success');
      });
      depositPresets.appendChild(btn);
    });
  }
  function refreshFaucet() {
    const r = Wallet.faucetReady(depositCur);
    if (r.ready) {
      faucetBtn.disabled = false;
      faucetBtn.textContent = `CLAIM ${formatBetButton(depositCur, r.amount)} ${sym(depositCur)}`;
      faucetHint.textContent = 'One free pull every 6 hours.';
      faucetHint.className = 'modal-hint';
    } else {
      faucetBtn.disabled = true;
      faucetBtn.textContent = 'COOLDOWN';
      faucetHint.textContent = 'Next pull in ' + humanizeMs(r.waitMs);
      faucetHint.className = 'modal-hint';
    }
  }
  function humanizeMs(ms) {
    const m = Math.floor(ms / 60000);
    const h = Math.floor(m / 60);
    if (h >= 1) return `${h}h ${m - h*60}m`;
    return `${m}m`;
  }
  faucetBtn.addEventListener('click', () => {
    const r = Wallet.claimFaucet(depositCur);
    if (!r.ok) { showToast('Faucet on cooldown', 'error'); return; }
    refreshWallet();
    flashWallet();
    Sound.chip();
    showToast(`+${formatBetButton(depositCur, r.amount)} ${sym(depositCur)} from faucet`, 'success');
    refreshFaucet();
  });

  // -- mp tabs --
  mpTabs.forEach(tab => tab.addEventListener('click', () => {
    mpTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const m = tab.dataset.mp;
    mpHostPanel.classList.toggle('hidden', m !== 'host');
    mpJoinPanel.classList.toggle('hidden', m !== 'join');
    Sound.click();
  }));

  // ===== AI MATCH =====
  playAiBtn.addEventListener('click', () => {
    const w = Wallet.load();
    if (aiBet > w[activeCurrency]) { showToast('Not enough ' + curLabel(activeCurrency), 'error'); return; }
    Wallet.debit(activeCurrency, aiBet);
    refreshWallet();
    flashWallet();
    const payout = roundForCurrency(activeCurrency, aiBet * selectedMult);
    currentMatch = { kind: 'ai', currency: activeCurrency, bet: aiBet, payout, diff: selectedDiff };
    enterGame({ playerName: 'YOU', oppName: `AI · ${selectedDiff.toUpperCase()}`, pot: aiBet + payout, isHost: true });
    Game.start({
      target: 7,
      onGoal: who => onGoal(who),
      onWin: who => onWin(who),
      onPaddleHit: power => Sound.paddleHit(power),
      onWallHit: power => Sound.wallHit(power),
    });
    countdown(() => AI.start(selectedDiff));
  });
  function roundForCurrency(c, n) {
    if (c === 'btc') return Math.round(n * 1e8) / 1e8;
    return Math.round(n * 100) / 100;
  }

  // ===== MULTIPLAYER =====
  hostBtn.addEventListener('click', () => {
    const w = Wallet.load();
    if (mpBet > w[activeCurrency]) { showToast('Not enough ' + curLabel(activeCurrency), 'error'); return; }
    hostBtn.disabled = true;
    hostBtn.textContent = 'CONNECTING…';
    roomDisplay.classList.add('hidden');
    roomCode.textContent = '———';
    roomHint.classList.remove('error', 'success');
    roomHint.textContent = 'Registering with broker…';
    Multiplayer.host({
      onReady: id => {
        // ID is now live on the broker — safe to share
        roomCode.textContent = id;
        roomDisplay.classList.remove('hidden');
        roomHint.classList.remove('error', 'success');
        roomHint.textContent = 'Share this code with a friend…';
        hostBtn.textContent = 'WAITING FOR FRIEND…';
      },
      onConnect: () => {
        Multiplayer.send({ type: 'hello', v: 2, name: displayName(), bet: mpBet, currency: activeCurrency });
        roomHint.classList.add('success');
        roomHint.textContent = 'Opponent connected — handshaking…';
      },
      onMessage: msg => handleMpMessage(msg, true),
      onClose: () => {
        if (currentMatch && currentMatch.ended) return;
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
  });

  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(roomCode.textContent); showToast('Room code copied', 'success'); }
    catch {}
  });

  joinBtn.addEventListener('click', () => {
    const code = (joinCodeInput.value || '').trim().toUpperCase();
    if (!code) { joinHint.textContent = 'Enter a code'; joinHint.classList.add('error'); return; }
    const w = Wallet.load();
    if (mpBet > w[activeCurrency]) { showToast('Not enough ' + curLabel(activeCurrency), 'error'); return; }
    joinBtn.disabled = true;
    joinBtn.textContent = 'CONNECTING…';
    joinHint.classList.remove('error', 'success');
    joinHint.textContent = 'Connecting…';
    Multiplayer.join(code, {
      onStatus: txt => {
        joinHint.classList.remove('error', 'success');
        joinHint.textContent = txt;
      },
      onConnect: () => {
        Multiplayer.send({ type: 'hello', v: 2, name: displayName(), bet: mpBet, currency: activeCurrency });
        joinHint.classList.add('success');
        joinHint.textContent = 'Connected — waiting for host…';
      },
      onMessage: msg => handleMpMessage(msg, false),
      onClose: () => {
        if (currentMatch && currentMatch.ended) return;
        showToast('Disconnected', 'error');
        leaveMatch();
        joinBtn.disabled = false; joinBtn.textContent = 'JOIN ROOM';
      },
      onError: err => {
        joinHint.classList.add('error');
        const msg = err && err.message ? err.message
                  : err && err.type === 'peer-unavailable' ? 'Room not found — double-check the code'
                  : err && err.type ? 'Error: ' + err.type
                  : 'Connection failed';
        joinHint.textContent = msg;
        joinBtn.disabled = false; joinBtn.textContent = 'JOIN ROOM';
      },
    });
  });
  joinCodeInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !joinBtn.disabled) joinBtn.click();
  });

  function handleMpMessage(msg, asHost) {
    if (!msg || !msg.type) return;
    switch (msg.type) {
      case 'hello': {
        mpHelloPeer = msg;
        if (!asHost) return;
        // Host's currency wins for the match. We use our own wager;
        // joiner adapts (or rejects if they can't afford it).
        const wager = +mpBet;
        if (!isFinite(wager) || wager <= 0) {
          softReject('Host has invalid wager'); return;
        }
        const w = Wallet.load();
        if ((+w[activeCurrency] || 0) < wager) {
          softReject(`Host needs ${fmt(activeCurrency, wager)} ${sym(activeCurrency)} but doesn't have it`);
          return;
        }
        Wallet.debit(activeCurrency, wager);
        refreshWallet(); flashWallet();
        const pot = wager * 2;
        Multiplayer.send({ type: 'ready', v: 2, target: 7, wager, currency: activeCurrency });
        startMpMatch({ wager, pot, asHost: true, currency: activeCurrency, oppName: msg.name || 'OPPONENT' });
        break;
      }
      case 'ready': {
        if (asHost) return;
        const wager = +msg.wager;
        const cur = msg.currency || 'chips';
        if (!isFinite(wager) || wager <= 0) {
          softReject('Host sent invalid wager'); return;
        }
        const w = Wallet.load();
        const have = +w[cur] || 0;
        if (have < wager) {
          softReject(`You need ${fmt(cur, wager)} ${sym(cur)} but only have ${fmt(cur, have)}. Open Wallet → Deposit (or pick a different currency) and rejoin.`);
          return;
        }
        // Adopt host's currency if we were on a different one
        if (cur !== activeCurrency) {
          setCurrency(cur);
          showToast(`Match is in ${curLabel(cur)} — switched`, '');
        }
        Wallet.debit(cur, wager);
        refreshWallet(); flashWallet();
        const pot = wager * 2;
        startMpMatch({ wager, pot, asHost: false, currency: cur, oppName: (mpHelloPeer && mpHelloPeer.name) || 'HOST' });
        break;
      }
      case 'reject': {
        showToast('Match rejected: ' + (msg.reason || 'unknown'), 'error');
        // Give the toast a moment to be readable before tearing down
        setTimeout(() => leaveMatch(), 100);
        break;
      }
      case 'pad': {
        if (!asHost) return;
        Game.setOpponentTarget(Game.W - msg.x, Game.H - msg.y);
        break;
      }
      case 'state': {
        if (asHost) return;
        const s = msg;
        Game.setOpponentTarget(Game.W - s.p1.x, Game.H - s.p1.y);
        Game.setPuck(Game.W - s.puck.x, Game.H - s.puck.y, -s.puck.vx, -s.puck.vy);
        Game.setScore(s.score.p2, s.score.p1);
        scoreP1.textContent = Game.state.score.p1;
        scoreP2.textContent = Game.state.score.p2;
        break;
      }
      case 'goal': {
        if (asHost) return;
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

  function startMpMatch({ wager, pot, asHost, currency, oppName }) {
    currentMatch = { kind: 'mp', currency, bet: wager, payout: pot, isHost: asHost, ended: false };
    enterGame({ playerName: 'YOU', oppName, pot, isHost: asHost });
    Game.start({
      target: 7,
      interpOpponent: true,
      clientRender: !asHost,
      onGoal: who => {
        if (!asHost) return;
        Sound.goal();
        triggerGoalFx(who);
        scoreP1.textContent = Game.state.score.p1;
        scoreP2.textContent = Game.state.score.p2;
        Multiplayer.send({ type: 'goal', who });
        setTimeout(() => countdown(() => {}), 300);
      },
      onWin: who => {
        if (!asHost) return;
        Multiplayer.send({ type: 'win', who });
        onWin(who);
      },
      onPaddleHit: power => Sound.paddleHit(power),
      onWallHit: power => Sound.wallHit(power),
    });
    countdown(() => startNetworkLoops(asHost));
    startPingDisplay();
    applyPingVisibility();
  }

  function startNetworkLoops(asHost) {
    cancelAnimationFrame(netRaf);
    const loop = () => {
      if (!currentMatch || currentMatch.kind !== 'mp') return;
      const now = performance.now();
      if (asHost) {
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
        if (now - lastSnapshot > 20) {
          lastSnapshot = now;
          const p1 = Game.state.p1;
          Multiplayer.send({ type: 'pad', x: p1.x, y: p1.y, vx: p1.vx, vy: p1.vy });
        }
      }
      scoreP1.textContent = Game.state.score.p1;
      scoreP2.textContent = Game.state.score.p2;
      connDot.classList.toggle('bad', !Multiplayer.connected);
      netRaf = requestAnimationFrame(loop);
    };
    netRaf = requestAnimationFrame(loop);
  }

  function startPingDisplay() {
    clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      const p = Multiplayer.ping || 0;
      pingMs.textContent = (p > 0 ? Math.round(p) : '—') + ' ms';
      pingPill.classList.toggle('warn', p > 100 && p <= 200);
      pingPill.classList.toggle('bad', p > 200);
    }, 700);
  }
  function stopPingDisplay() { clearInterval(pingTimer); pingTimer = 0; pingMs.textContent = '— ms'; }

  // ===== ENTER / LEAVE =====
  function enterGame({ playerName, oppName, pot, isHost }) {
    lobby.classList.remove('active');
    gameScreen.classList.add('active');
    hudP1.textContent = playerName;
    hudP2.textContent = oppName;
    Game.setNames(playerName, oppName);
    scoreP1.textContent = 0; scoreP2.textContent = 0;
    potAmount.textContent = `${fmt(currentMatch.currency, pot)} ${sym(currentMatch.currency)}`;
    matchInfo.textContent = 'FIRST TO 7';
    connDot.classList.toggle('bad', currentMatch?.kind === 'mp' && !Multiplayer.connected);
  }

  leaveBtn.addEventListener('click', () => {
    if (currentMatch && currentMatch.kind === 'mp' && !currentMatch.ended) {
      Multiplayer.send({ type: 'bye' });
    }
    leaveMatch();
  });

  function leaveMatch() {
    AI.stop();
    Game.stop();
    Multiplayer.close();
    cancelAnimationFrame(netRaf);
    stopPingDisplay();
    currentMatch = null;
    gameScreen.classList.remove('active');
    lobby.classList.add('active');
    resultModal.classList.add('hidden');
    hostBtn.disabled = false; hostBtn.textContent = 'CREATE ROOM';
    joinBtn.disabled = false; joinBtn.textContent = 'JOIN ROOM';
    roomDisplay.classList.add('hidden');
    roomHint.textContent = '';
    joinHint.textContent = '';
    joinCodeInput.value = '';
    if (Wallet.topUpIfBroke()) showToast('Free top-up: 100 chips', 'success');
    refreshWallet();
    applyPingVisibility();
  }

  // ===== GOAL / WIN =====
  function onGoal(who) {
    Sound.goal();
    triggerGoalFx(who);
    scoreP1.textContent = Game.state.score.p1;
    scoreP2.textContent = Game.state.score.p2;
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
    currentMatch.ended = true;
    const playerWon = who === 'p1';
    let payout = 0;
    if (playerWon) {
      // Defensive: if payout was somehow 0/missing, fall back to 2x bet
      payout = +currentMatch.payout;
      if (!isFinite(payout) || payout <= 0) payout = (+currentMatch.bet || 0) * 2;
      Wallet.credit(currentMatch.currency, payout);
      Wallet.recordResult(true, currentMatch.currency, payout);
      Sound.win();
    } else {
      Wallet.recordResult(false, currentMatch.currency, 0);
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
    const cur = currentMatch.currency;
    payoutAmount.textContent = won
      ? `+${fmt(cur, payout)} ${sym(cur)}`
      : `−${fmt(cur, currentMatch.bet)} ${sym(cur)}`;
    payoutAmount.classList.toggle('loss', !won);
    resultModal.classList.remove('hidden');
    // NOTE: do not close Multiplayer here — it would trigger our own onClose
    // and immediately hide the modal. The Lobby/Rematch buttons close it.
  }

  rematchBtn.addEventListener('click', () => {
    if (!currentMatch) return leaveMatch();
    const m = currentMatch;
    resultModal.classList.add('hidden');
    if (m.kind === 'ai') {
      const w = Wallet.load();
      if (m.bet > w[m.currency]) { showToast('Not enough', 'error'); leaveMatch(); return; }
      Wallet.debit(m.currency, m.bet);
      refreshWallet();
      currentMatch = { ...m, ended: false };
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
      // MP rematch needs full re-handshake (peer connection closed). Return to lobby.
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

  // -- mute --
  muteBtn.addEventListener('click', () => setMute(Sound.toggle()));
  function setMute(m) {
    muteBtn.classList.toggle('muted', m);
    muteBtn.title = m ? 'Sound off' : 'Sound on';
    toggleSound.checked = !m;
  }

  // -- helpers --
  function displayName() {
    // Used as the network-visible name (what your friend sees as their opponent)
    const id = Auth.currentId();
    if (id === 'guest') return 'GUEST';
    return '@' + id;
  }
  function softReject(reason) {
    try { Multiplayer.send({ type: 'reject', reason }); } catch {}
    showToast(reason, 'error');
    setTimeout(() => leaveMatch(), 200);
  }

  // prevent context menu on canvas
  board.addEventListener('contextmenu', e => e.preventDefault());
})();
