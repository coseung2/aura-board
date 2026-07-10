let audioContext: AudioContext | null = null;

type WindowWithWebkitAudioContext = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export function playShadowAllianceGuideTick() {
  if (typeof window === "undefined") return;

  try {
    const AudioContextConstructor =
      window.AudioContext ?? (window as WindowWithWebkitAudioContext).webkitAudioContext;
    if (!AudioContextConstructor) return;

    audioContext ??= new AudioContextConstructor();
    void audioContext.resume();

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;

    oscillator.type = "square";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.05, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.1);
  } catch {
    // Audio is a progressive enhancement; navigation must still work when blocked.
  }
}
