import { useRef, useCallback } from 'react';

// Category → frequency (C pentatonic scale)
const CAT_FREQ = {
  time:  261.63,  // C4
  space: 329.63,  // E4
  mind:  392.00,  // G4
  form:  523.25,  // C5
};

export function useAudio() {
  const ctxRef = useRef(null);

  function getCtx() {
    if (!ctxRef.current)
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return ctxRef.current;
  }

  // Soft sine tone for node arrival
  const playArrival = useCallback((group, volume = 0.15) => {
    try {
      const ac  = getCtx();
      const osc = ac.createOscillator();
      const env = ac.createGain();
      osc.connect(env); env.connect(ac.destination);
      osc.type = 'sine';
      osc.frequency.value = (CAT_FREQ[group] || 440) * (0.98 + Math.random() * 0.04);
      env.gain.setValueAtTime(volume, ac.currentTime);
      env.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.3);
      osc.start(); osc.stop(ac.currentTime + 0.3);
    } catch { /* user hasn't interacted yet */ }
  }, []);

  // Ascending arpeggio for scoring / target reached
  const playScore = useCallback(() => {
    try {
      const ac = getCtx();
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        const osc = ac.createOscillator(), env = ac.createGain();
        osc.connect(env); env.connect(ac.destination);
        osc.type = 'triangle';
        osc.frequency.value = f;
        const t = ac.currentTime + i * 0.08;
        env.gain.setValueAtTime(0.12, t);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.start(t); osc.stop(t + 0.35);
      });
    } catch { /* ignore */ }
  }, []);

  // Gentle chord when mode switches (H key)
  const playModeSwitch = useCallback((toHyper) => {
    try {
      const ac = getCtx();
      const freqs = toHyper ? [220, 277.18, 329.63] : [261.63, 329.63, 392];
      freqs.forEach((f, i) => {
        const osc = ac.createOscillator(), env = ac.createGain();
        osc.connect(env); env.connect(ac.destination);
        osc.type = 'sine';
        osc.frequency.value = f;
        const t = ac.currentTime + i * 0.04;
        env.gain.setValueAtTime(0.08, t);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        osc.start(t); osc.stop(t + 0.5);
      });
    } catch { /* ignore */ }
  }, []);

  return { playArrival, playScore, playModeSwitch };
}
