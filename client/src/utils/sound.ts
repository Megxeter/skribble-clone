/**
 * Web Audio API helper for subtle in-game sound effects.
 * Complies with browser autoplay policies and respects user mute preference.
 */

const SOUND_STORAGE_KEY = 'skribbl_sound_enabled';

let audioCtx: AudioContext | null = null;
let unlockListenersRegistered = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioCtx) {
    try {
      audioCtx = new AudioContextClass();
    } catch {
      audioCtx = null;
    }
  }
  return audioCtx;
}

/**
 * Registers one-time user interaction listeners to resume AudioContext if suspended.
 */
export function setupAudioUnlockListeners(): void {
  if (typeof window === 'undefined' || unlockListenersRegistered) return;
  unlockListenersRegistered = true;

  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {
        // Autoplay policy may still restrict until eligible gesture
      });
    }
  };

  window.addEventListener('click', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
  window.addEventListener('touchstart', unlock, { passive: true });
}

/**
 * Check whether sound effects are enabled in localStorage (default: true).
 */
export function getSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(SOUND_STORAGE_KEY);
  if (stored === null) return true;
  return stored === 'true';
}

/**
 * Persist user sound preference.
 */
export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SOUND_STORAGE_KEY, enabled ? 'true' : 'false');
}

/**
 * Synthesizes a short, subtle, low-volume chime for player join events.
 */
function playTone(ctx: AudioContext): void {
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Gentle ascending tone: 587.33 Hz (D5) to 880 Hz (A5)
    osc.frequency.setValueAtTime(587.33, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.05);

    // Low volume with smooth envelope (no speaker clicks)
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  } catch (err) {
    console.debug('Error synthesizing audio tone:', err);
  }
}

/**
 * Play player join sound if enabled and permitted by browser autoplay.
 */
export function playJoinSound(): void {
  if (!getSoundEnabled()) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx
        .resume()
        .then(() => {
          if (ctx.state === 'running') {
            playTone(ctx);
          }
        })
        .catch(() => {
          // Gracefully suppress autoplay-blocked audio
        });
      return;
    }

    if (ctx.state === 'running') {
      playTone(ctx);
    }
  } catch (err) {
    console.debug('Web Audio playback blocked or unavailable:', err);
  }
}
