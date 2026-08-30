// Pitch detector using the McLeod Pitch Method (MPM): a normalized square
// difference function (NSDF) instead of raw autocorrelation, which is much
// less prone to octave errors on harmonically rich sounds like a plucked
// string. Tuned for the guitar/ukulele fundamental range (~60-1000 Hz).

const RMS_THRESHOLD = 0.003;
const MIN_FREQUENCY = 60;
const MAX_FREQUENCY = 1000;
const PEAK_THRESHOLD_RATIO = 0.8; // MPM's "k": accept the first peak within 80% of the best one
const MIN_CLARITY = 0.5; // reject non-periodic/noisy signals outright

export function detectPitch(buffer, sampleRate) {
  const size = buffer.length;

  let rms = 0;
  for (let i = 0; i < size; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / size);
  if (rms < RMS_THRESHOLD) return { rms, frequency: null, clarity: 0 };

  const maxLag = Math.min(size - 1, Math.floor(sampleRate / MIN_FREQUENCY));

  const nsdf = new Float32Array(maxLag + 1);
  for (let tau = 0; tau <= maxLag; tau++) {
    let acf = 0;
    let energy = 0;
    const limit = size - tau;
    for (let i = 0; i < limit; i++) {
      acf += buffer[i] * buffer[i + tau];
      energy += buffer[i] * buffer[i] + buffer[i + tau] * buffer[i + tau];
    }
    nsdf[tau] = energy > 0 ? (2 * acf) / energy : 0;
  }

  // Key maxima: the highest NSDF value within each lobe between successive
  // positive-going zero crossings. Picking the first lobe that's close enough
  // to the global best (rather than always the global best) is what makes
  // MPM robust against locking onto a harmonic instead of the fundamental.
  const maxima = [];
  for (let tau = 1; tau < maxLag; tau++) {
    if (nsdf[tau - 1] <= 0 && nsdf[tau] > 0) {
      let peakTau = tau;
      let peakValue = nsdf[tau];
      while (tau + 1 <= maxLag && nsdf[tau + 1] > 0) {
        tau++;
        if (nsdf[tau] > peakValue) {
          peakValue = nsdf[tau];
          peakTau = tau;
        }
      }
      maxima.push({ tau: peakTau, value: peakValue });
    }
  }
  if (maxima.length === 0) return { rms, frequency: null, clarity: 0 };

  const globalBest = Math.max(...maxima.map((m) => m.value));
  const threshold = PEAK_THRESHOLD_RATIO * globalBest;
  const chosen = maxima.find((m) => m.value >= threshold) ?? maxima[0];

  // Parabolic interpolation around the chosen peak for sub-sample precision.
  const y0 = nsdf[Math.max(chosen.tau - 1, 0)];
  const y1 = nsdf[chosen.tau];
  const y2 = nsdf[Math.min(chosen.tau + 1, maxLag)];
  const denom = y0 - 2 * y1 + y2;
  const shift = denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0;
  const refinedTau = chosen.tau + Math.max(-1, Math.min(1, shift));

  const frequency = sampleRate / refinedTau;
  const clarity = chosen.value;
  if (frequency < MIN_FREQUENCY || frequency > MAX_FREQUENCY || clarity < MIN_CLARITY) {
    return { rms, frequency: null, clarity };
  }

  return { frequency, rms, clarity };
}

export class PitchDetector {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.source = null;
    this.stream = null;
    this.buffer = null;
    this.rafId = null;
    this.running = false;
  }

  async start(onPitch) {
    if (this.running) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
      },
    });

    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (this.audioContext.state === 'suspended') await this.audioContext.resume();

    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    // Large enough window to cover several periods of the lowest guitar
    // string (~82 Hz) for a stable NSDF estimate.
    this.analyser.fftSize = 4096;
    this.buffer = new Float32Array(this.analyser.fftSize);
    this.source.connect(this.analyser);

    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.analyser.getFloatTimeDomainData(this.buffer);
      const result = detectPitch(this.buffer, this.audioContext.sampleRate);
      onPitch(result);
      this.rafId = requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.analyser = null;
  }
}
