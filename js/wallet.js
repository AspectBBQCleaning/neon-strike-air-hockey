/* ========================================================================
   Wallet — virtual chips persisted to localStorage
   ======================================================================== */
const Wallet = (() => {
  const KEY = 'ns_wallet_v1';
  const DEFAULT_BALANCE = 1000;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return seed();
      const w = JSON.parse(raw);
      if (typeof w.balance !== 'number') return seed();
      return w;
    } catch { return seed(); }
  }

  function seed() {
    const w = { balance: DEFAULT_BALANCE, wins: 0, losses: 0, streak: 0, biggestWin: 0 };
    save(w); return w;
  }

  function save(w) { localStorage.setItem(KEY, JSON.stringify(w)); }

  function reset() {
    const w = seed();
    return w;
  }

  function debit(amount) {
    const w = load();
    if (amount > w.balance) amount = w.balance;
    w.balance -= amount;
    save(w);
    return w;
  }

  function credit(amount) {
    const w = load();
    w.balance += amount;
    save(w);
    return w;
  }

  function recordResult(won, payout) {
    const w = load();
    if (won) {
      w.wins++;
      w.streak = w.streak >= 0 ? w.streak + 1 : 1;
      if (payout > w.biggestWin) w.biggestWin = payout;
    } else {
      w.losses++;
      w.streak = w.streak <= 0 ? w.streak - 1 : -1;
    }
    save(w);
    return w;
  }

  function topUpIfBroke() {
    const w = load();
    if (w.balance < 10) {
      w.balance = 100;
      save(w);
      return true;
    }
    return false;
  }

  return { load, save, reset, debit, credit, recordResult, topUpIfBroke };
})();
