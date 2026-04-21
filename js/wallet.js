/* ========================================================================
   Wallet — multi-currency virtual balances persisted to localStorage.
   Currencies: chips, btc, xrp.  All balances are demo only.

   Storage layout v3:
     ns_wallet_v3 :: { [accountId]: WalletData }
     WalletData ::
       { chips, btc, xrp, wins, losses, streak, biggestWinChips,
         lastFaucetChips, lastFaucetBtc, lastFaucetXrp }

   The "active account" is provided by Auth.currentId() (defaults to "guest").
   ======================================================================== */
const Wallet = (() => {
  const KEY  = 'ns_wallet_v3';
  const OLD1 = 'ns_wallet_v1';      // pre-multi-currency, single user, 'balance' key

  // Demo conversion rates — display only, never used for real transfers
  const CHIP_RATE = { chips: 1, btc: 80000, xrp: 0.55 };

  const FAUCET = {
    chips: { amount: 250,    cooldownMs: 6 * 60 * 60 * 1000 },
    btc:   { amount: 0.0005, cooldownMs: 6 * 60 * 60 * 1000 },
    xrp:   { amount: 200,    cooldownMs: 6 * 60 * 60 * 1000 },
  };

  function emptyData() {
    return {
      chips: 1000, btc: 0, xrp: 0,
      wins: 0, losses: 0, streak: 0, biggestWinChips: 0,
      lastFaucetChips: 0, lastFaucetBtc: 0, lastFaucetXrp: 0,
    };
  }

  function loadAll() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    // migrate from v1 if present
    try {
      const old = localStorage.getItem(OLD1);
      if (old) {
        const o = JSON.parse(old);
        const guest = emptyData();
        guest.chips = Math.max(0, +o.balance || 1000);
        guest.wins = +o.wins || 0;
        guest.losses = +o.losses || 0;
        guest.streak = +o.streak || 0;
        guest.biggestWinChips = +o.biggestWin || 0;
        const all = { guest };
        save(all);
        return all;
      }
    } catch {}
    return {};
  }

  function save(all) { localStorage.setItem(KEY, JSON.stringify(all)); }

  function activeId() { return (window.Auth && Auth.currentId()) || 'guest'; }

  function load() {
    const all = loadAll();
    const id = activeId();
    if (!all[id]) {
      all[id] = emptyData();
      save(all);
    }
    // self-heal: ensure required fields exist
    const w = all[id];
    Object.assign(w, { ...emptyData(), ...w });
    return w;
  }

  function persist(w) {
    const all = loadAll();
    all[activeId()] = w;
    save(all);
  }

  function balance(currency = 'chips') {
    const w = load();
    return Math.max(0, +w[currency] || 0);
  }

  function debit(currency, amount) {
    const w = load();
    if (amount > w[currency]) amount = w[currency];
    w[currency] = Math.max(0, w[currency] - amount);
    persist(w);
    return w;
  }

  function credit(currency, amount) {
    const w = load();
    w[currency] = (+w[currency] || 0) + (+amount || 0);
    persist(w);
    return w;
  }

  function recordResult(won, currency, payoutAmount) {
    const w = load();
    if (won) {
      w.wins++;
      w.streak = w.streak >= 0 ? w.streak + 1 : 1;
      const inChips = (+payoutAmount || 0) * (CHIP_RATE[currency] || 1);
      if (inChips > w.biggestWinChips) w.biggestWinChips = inChips;
    } else {
      w.losses++;
      w.streak = w.streak <= 0 ? w.streak - 1 : -1;
    }
    persist(w);
    return w;
  }

  function topUpIfBroke() {
    const w = load();
    const totalChipValue = w.chips + w.btc * CHIP_RATE.btc + w.xrp * CHIP_RATE.xrp;
    if (totalChipValue < 10) {
      w.chips = 100;
      persist(w);
      return true;
    }
    return false;
  }

  function reset() {
    const all = loadAll();
    all[activeId()] = emptyData();
    save(all);
    return all[activeId()];
  }

  function deposit(currency, amount) {
    const w = load();
    const a = Math.max(0, +amount || 0);
    w[currency] = (+w[currency] || 0) + a;
    persist(w);
    return w;
  }

  function claimFaucet(currency) {
    const cfg = FAUCET[currency];
    if (!cfg) return { ok: false, reason: 'unknown' };
    const w = load();
    const k = 'lastFaucet' + currency.charAt(0).toUpperCase() + currency.slice(1);
    const last = +w[k] || 0;
    const wait = cfg.cooldownMs - (Date.now() - last);
    if (wait > 0) return { ok: false, reason: 'cooldown', waitMs: wait };
    w[currency] = (+w[currency] || 0) + cfg.amount;
    w[k] = Date.now();
    persist(w);
    return { ok: true, amount: cfg.amount, wallet: w };
  }

  function faucetReady(currency) {
    const cfg = FAUCET[currency];
    if (!cfg) return { ready: false };
    const w = load();
    const k = 'lastFaucet' + currency.charAt(0).toUpperCase() + currency.slice(1);
    const last = +w[k] || 0;
    const wait = cfg.cooldownMs - (Date.now() - last);
    return { ready: wait <= 0, waitMs: Math.max(0, wait), amount: cfg.amount };
  }

  // Format helpers
  function symbol(currency) {
    return currency === 'btc' ? '₿' : currency === 'xrp' ? 'X' : '◎';
  }
  function format(currency, amount) {
    const a = +amount || 0;
    if (currency === 'btc') return a.toFixed(5);
    if (currency === 'xrp') return Math.round(a).toLocaleString();
    return Math.round(a).toLocaleString();
  }
  function inChips(currency, amount) { return (+amount || 0) * (CHIP_RATE[currency] || 1); }

  return {
    load, balance, debit, credit, recordResult, topUpIfBroke,
    reset, deposit, claimFaucet, faucetReady,
    symbol, format, inChips,
    CHIP_RATE, FAUCET,
  };
})();
