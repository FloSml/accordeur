import './style.css';
import { PitchDetector } from './pitchDetector.js';
import { INSTRUMENTS } from './instruments.js';

const els = {
  instrumentButtons: document.querySelectorAll('.instrument-btn'),
  strings: document.getElementById('strings'),
  noteName: document.getElementById('note-name'),
  cents: document.getElementById('cents'),
  frequency: document.getElementById('frequency'),
  needle: document.getElementById('needle'),
  micToggle: document.getElementById('mic-toggle'),
  micLabel: document.getElementById('mic-label'),
  status: document.getElementById('status'),
};

const NOISE_FLOOR = 0.001;
const LISTENING_STATUS = 'Écoute en cours… jouez une corde.';
const FREQUENCY_HISTORY_SIZE = 5;
// A plucked string holds one frequency steadily as it decays; ambient sound
// (TV, voices) tends to wander from moment to moment. Require several
// consecutive readings to agree before committing to a note, so a brief
// stray match doesn't flash on screen.
const MAX_STABLE_SPREAD_CENTS = 20;
// This is a tuner for known open strings, not a general chromatic tuner: only
// react to pitches close to one of the current instrument's strings, so an
// unrelated ambient tone (TV, voices) can't masquerade as a note. Adjacent
// strings are at least 400 cents apart, so this stays unambiguous.
const STRING_MATCH_TOLERANCE_CENTS = 180;

const detector = new PitchDetector();
let currentInstrument = 'guitar';
let frequencyHistory = [];
let silenceFrames = 0;

function medianFrequency() {
  const sorted = [...frequencyHistory].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function isFrequencyStable() {
  if (frequencyHistory.length < FREQUENCY_HISTORY_SIZE) return false;
  const logs = frequencyHistory.map((f) => Math.log2(f));
  const spreadCents = (Math.max(...logs) - Math.min(...logs)) * 1200;
  return spreadCents <= MAX_STABLE_SPREAD_CENTS;
}

function findNearestString(frequency) {
  let nearest = null;
  let nearestCents = Infinity;
  for (const string of INSTRUMENTS[currentInstrument].strings) {
    const cents = 1200 * Math.log2(frequency / string.frequency);
    if (Math.abs(cents) < Math.abs(nearestCents)) {
      nearest = string;
      nearestCents = cents;
    }
  }
  return { string: nearest, cents: nearestCents };
}

function renderStrings() {
  const instrument = INSTRUMENTS[currentInstrument];
  els.strings.style.setProperty('--string-count', instrument.strings.length);
  els.strings.innerHTML = '';
  for (const string of instrument.strings) {
    const btn = document.createElement('div');
    btn.className = 'string-chip';
    btn.dataset.midi = string.midi;
    btn.innerHTML = `<span class="string-note">${string.label}</span><span class="string-freq">${string.frequency.toFixed(2)} Hz</span>`;
    els.strings.appendChild(btn);
  }
}

function setActiveInstrument(name) {
  currentInstrument = name;
  els.instrumentButtons.forEach((btn) => {
    const active = btn.dataset.instrument === name;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  renderStrings();
}

els.instrumentButtons.forEach((btn) => {
  btn.addEventListener('click', () => setActiveInstrument(btn.dataset.instrument));
});

function updateNeedle(cents) {
  const clamped = Math.max(-50, Math.min(50, cents));
  const angle = (clamped / 50) * 90;
  els.needle.style.transform = `rotate(${angle}deg)`;
  els.needle.style.transformOrigin = '110px 115px';
}

function setTuningState(state) {
  els.noteName.classList.remove('is-flat', 'is-sharp', 'is-in-tune');
  if (state) els.noteName.classList.add(state);
}

function clearReading() {
  els.noteName.textContent = '–';
  els.cents.textContent = '';
  els.frequency.textContent = '';
  updateNeedle(0);
  setTuningState(null);
  document.querySelectorAll('.string-chip').forEach((c) => c.classList.remove('is-active', 'is-in-tune'));
}

function handlePitch(result) {
  if (!result || result.frequency === null) {
    silenceFrames++;
    if (result && result.rms > NOISE_FLOOR) {
      els.status.textContent = 'Son trop faible — rapproche le micro ou joue plus fort.';
    } else if (silenceFrames > 20) {
      els.status.textContent = LISTENING_STATUS;
    }
    if (silenceFrames > 20) {
      frequencyHistory = [];
      clearReading();
    }
    return;
  }
  silenceFrames = 0;
  els.status.textContent = LISTENING_STATUS;

  frequencyHistory.push(result.frequency);
  if (frequencyHistory.length > FREQUENCY_HISTORY_SIZE) frequencyHistory.shift();
  if (!isFrequencyStable()) return;
  const frequency = medianFrequency();

  const { string, cents: rawCents } = findNearestString(frequency);
  if (!string || Math.abs(rawCents) > STRING_MATCH_TOLERANCE_CENTS) return;
  const cents = Math.round(rawCents);

  els.noteName.textContent = string.label;
  els.cents.textContent = `${cents > 0 ? '+' : ''}${cents} cents`;
  els.frequency.textContent = `${frequency.toFixed(1)} Hz`;
  updateNeedle(cents);

  const inTune = Math.abs(cents) <= 5;
  const close = Math.abs(cents) <= 15;
  setTuningState(inTune ? 'is-in-tune' : cents < 0 ? 'is-flat' : 'is-sharp');
  els.needle.classList.toggle('needle-in-tune', inTune);
  els.needle.classList.toggle('needle-close', !inTune && close);

  document.querySelectorAll('.string-chip').forEach((chip) => {
    const isMatch = Number(chip.dataset.midi) === string.midi;
    chip.classList.toggle('is-active', isMatch);
    chip.classList.toggle('is-in-tune', isMatch && inTune);
  });
}

let micActive = false;

async function toggleMic() {
  if (micActive) {
    detector.stop();
    micActive = false;
    els.micLabel.textContent = 'Activer le micro';
    els.micToggle.classList.remove('is-active');
    els.status.textContent = '';
    clearReading();
    return;
  }

  try {
    els.status.textContent = 'Demande d’accès au micro…';
    await detector.start(handlePitch);
    micActive = true;
    els.micLabel.textContent = 'Couper le micro';
    els.micToggle.classList.add('is-active');
    els.status.textContent = 'Écoute en cours… jouez une corde.';
  } catch (err) {
    console.error(err);
    els.status.textContent = "Impossible d'accéder au micro. Vérifiez les autorisations du navigateur.";
  }
}

els.micToggle.addEventListener('click', toggleMic);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && micActive) toggleMic();
});

setActiveInstrument('guitar');
clearReading();
