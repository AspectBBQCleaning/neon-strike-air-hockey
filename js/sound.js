/* ========================================================================
   Sound — tiny WebAudio synth (no external samples)
   ======================================================================== */
const Sound = (() => {
  let ctx = null;
  let muted = localStorage.getItem('ns_muted') === '1';

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone({ freq = 440, type = 'sine', dur = 0.1, vol = 0.15, slide = 0 }) {
    if (muted) return;
    const c = ensure(); if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), c.currentTime + dur);
    gain.gain.value = vol;
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    osc.connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + dur);
  }

  return {
    paddleHit(power = 1) {
      tone({ freq: 220 + power * 200, type: 'square', dur: 0.06, vol: 0.12 });
    },
    wallHit(power = 1) {
      tone({ freq: 140 + power * 80, type: 'triangle', dur: 0.05, vol: 0.08 });
    },
    goal() {
      tone({ freq: 660, type: 'sawtooth', dur: 0.18, vol: 0.16, slide: 200 });
      setTimeout(() => tone({ freq: 880, type: 'sawtooth', dur: 0.22, vol: 0.16, slide: 300 }), 80);
    },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone({ freq: f, type: 'square', dur: 0.18, vol: 0.18 }), i * 110));
    },
    loss() {
      [392, 311, 261, 196].forEach((f, i) => setTimeout(() => tone({ freq: f, type: 'sawtooth', dur: 0.2, vol: 0.14 }), i * 130));
    },
    countdown() { tone({ freq: 880, type: 'sine', dur: 0.1, vol: 0.12 }); },
    go()        { tone({ freq: 1320, type: 'sine', dur: 0.25, vol: 0.16 }); },
    click()     { tone({ freq: 600, type: 'square', dur: 0.04, vol: 0.06 }); },
    chip()      { tone({ freq: 900, type: 'triangle', dur: 0.05, vol: 0.08 }); },
    isMuted()   { return muted; },
    toggle()    {
      muted = !muted;
      localStorage.setItem('ns_muted', muted ? '1' : '0');
      return muted;
    },
  };
})();
