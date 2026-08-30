// Autocorrelation-based pitch detector (time-domain ACF with parabolic
// interpolation), tuned for the guitar/ukulele fundamental range (~70-500 Hz).

const RMS_THRESHOLD = 0.003;
const MIN_FREQUENCY = 60;
const MAX_FREQUENCY = 1000;

export function autocorrelate(buffer, sampleRate) {
  const size = buffer.length;

  let rms = 0;
  for (let i = 0; i < size; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / size);
  if (rms < RMS_THRESHOLD) return { rms, frequency: null, clarity: 0 };

  // Trim to the region with signal to keep autocorrelation stable.
  let start = 0;
  let end = size - 1;
  const trimThreshold = rms * 0.25;
  while (start < size && Math.abs(buffer[start]) < trimThreshold) start++;
  while (end > start && Math.abs(buffer[end]) < trimThreshold) end--;
  const trimmed = buffer.subarray(start, end + 1);
  const n = trimmed.length;
  if (n < 2) return { rms, frequency: null, clarity: 0 };

  const maxLag = Math.min(n - 1, Math.floor(sampleRate / MIN_FREQUENCY));
  const minLag = Math.max(1, Math.floor(sampleRate / MAX_FREQUENCY));

  const correlations = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const limit = n - lag;
    for (let i = 0; i < limit; i++) sum += trimmed[i] * trimmed[i + lag];
    correlations[lag] = sum / limit;
  }

  // Walk past the initial downward slope from lag 0, then find the first
  // (and usually strongest) peak — this is the fundamental period.
  let lag = minLag;
  while (lag < maxLag - 1 && correlations[lag + 1] > correlations[lag]) lag++;
  let bestLag = -1;
  let bestValue = -Infinity;
  for (let i = lag; i <= maxLag; i++) {
    if (correlations[i] > bestValue) {
      bestValue = correlations[i];
      bestLag = i;
    }
  }
  if (bestLag <= 0 || bestValue <= 0) return { rms, frequency: null, clarity: 0 };

  // Parabolic interpolation around the peak for sub-sample precision.
  const y0 = correlations[Math.max(bestLag - 1, minLag)];
  const y1 = correlations[bestLag];
  const y2 = correlations[Math.min(bestLag + 1, maxLag)];
  const denom = y0 - 2 * y1 + y2;
  const shift = denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0;
  const refinedLag = bestLag + Math.max(-1, Math.min(1, shift));

  const frequency = sampleRate / refinedLag;
  if (frequency < MIN_FREQUENCY || frequency > MAX_FREQUENCY) return { rms, frequency: null, clarity: 0 };

  // Normalized clarity of the peak, used to reject noisy/ambiguous reads.
  const zeroLagEnergy = correlations[minLag] || 1e-9;
  const clarity = Math.max(0, Math.min(1, bestValue / zeroLagEnergy));

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
    this.analyser.fftSize = 2048;
    this.buffer = new Float32Array(this.analyser.fftSize);
    this.source.connect(this.analyser);

    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.analyser.getFloatTimeDomainData(this.buffer);
      const result = autocorrelate(this.buffer, this.audioContext.sampleRate);
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
