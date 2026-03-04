// Audio Service to handle sound effects and music
// Uses Web Audio API

const globalRef: { rhythmInterval: any | null } = {
  rhythmInterval: null,
};

let audioCtx: AudioContext | null = null;
const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
     const Ctx = window.AudioContext || (window as any).webkitAudioContext;
     if (Ctx) audioCtx = new Ctx();
  }
  return audioCtx;
};

export const playWinSound = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    
    // Play a happy arpeggio C-E-G-C
    const frequencies = [523.25, 659.25, 783.99, 1046.50]; 
    
    frequencies.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + i * 0.1);
        gain.gain.setValueAtTime(0, t + i * 0.1);
        gain.gain.linearRampToValueAtTime(0.2, t + i * 0.1 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + i * 0.1);
        osc.stop(t + i * 0.1 + 0.5);
    });
  } catch (e) {
    console.error("Audio play failed", e);
  }
};

export const playDissonance = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc1.frequency.value = 150; // Low dissonance
    osc1.type = 'sawtooth';
    osc2.frequency.value = 160;
    osc2.type = 'sawtooth';
    
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
    
    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.4);
    osc2.stop(t + 0.4);
  } catch(e) { console.error(e); }
};

export const playHarmony = (combo: number) => {
    try {
        const ctx = getAudioContext();
        if(!ctx) return;
        const baseFreq = 261.63; // C4
        // Pentatonic scaleish
        const scale = [1, 1.125, 1.25, 1.5, 1.66, 2]; 
        const noteIndex = combo % scale.length;
        const freq = baseFreq * scale[noteIndex] * (1 + Math.floor(combo/scale.length)*0.5);
        
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
    } catch(e) { console.error(e); }
};

// --- RHYTHM GAME AUDIO ENGINE ---

// Play a drum beat
const playDrum = (ctx: AudioContext, time: number, type: 'kick' | 'snare' | 'hihat') => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'kick') {
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
        gain.gain.setValueAtTime(0.8, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
        osc.start(time);
        osc.stop(time + 0.5);
    } else if (type === 'snare') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(100, time);
        gain.gain.setValueAtTime(0.4, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
        osc.start(time);
        osc.stop(time + 0.2);
    } else {
        // Hihat
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, time);
        osc.frequency.exponentialRampToValueAtTime(300, time + 0.05);
        gain.gain.setValueAtTime(0.1, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
        osc.start(time);
        osc.stop(time + 0.05);
    }
};

export const startRhythmBeat = (bpm: number = 80) => {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    stopRhythmBeat(); // Clear existing

    const beatInterval = 60 / bpm; // Seconds per beat
    let nextNoteTime = ctx.currentTime + 0.1;
    let beatCount = 0;

    globalRef.rhythmInterval = setInterval(() => {
        const lookahead = 0.1;
        while (nextNoteTime < ctx.currentTime + lookahead) {
            // 4/4 Beat: Kick - Hat - Snare - Hat
            if (beatCount % 4 === 0) playDrum(ctx, nextNoteTime, 'kick');
            else if (beatCount % 4 === 2) playDrum(ctx, nextNoteTime, 'snare');
            else playDrum(ctx, nextNoteTime, 'hihat');
            
            nextNoteTime += beatInterval;
            beatCount++;
        }
    }, 25);
};

export const stopRhythmBeat = () => {
    if (globalRef.rhythmInterval) {
        clearInterval(globalRef.rhythmInterval);
        globalRef.rhythmInterval = null;
    }
};