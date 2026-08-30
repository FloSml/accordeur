import './style.css';
import { PitchDetector } from './pitchDetector.js';
import { frequencyToNote } from './notes.js';
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

const NOISE_FLOOR = 0.0008;
const LISTENING_STATUS = 'Écoute en cours… jouez une corde.';

const detector = new PitchDetector();
let currentInstrument = 'guitar';
let smoothedFrequency = null;
let silenceFrames = 0;

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
      smoothedFrequency = null;
      clearReading();
    }
    return;
  }
  silenceFrames = 0;
  els.status.textContent = LISTENING_STATUS;

  smoothedFrequency = smoothedFrequency === null
    ? result.frequency
    : smoothedFrequency * 0.75 + result.frequency * 0.25;

  const note = frequencyToNote(smoothedFrequency);
  els.noteName.textContent = note.name;
  els.cents.textContent = `${note.cents > 0 ? '+' : ''}${note.cents} cents`;
  els.frequency.textContent = `${smoothedFrequency.toFixed(1)} Hz`;
  updateNeedle(note.cents);

  const inTune = Math.abs(note.cents) <= 5;
  const close = Math.abs(note.cents) <= 15;
  setTuningState(inTune ? 'is-in-tune' : note.cents < 0 ? 'is-flat' : 'is-sharp');
  els.needle.classList.toggle('needle-in-tune', inTune);
  els.needle.classList.toggle('needle-close', !inTune && close);

  document.querySelectorAll('.string-chip').forEach((chip) => {
    const isMatch = Number(chip.dataset.midi) === note.midi;
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
