const NOTE_NAMES = ['Do', 'Do#', 'Ré', 'Ré#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
const A4_MIDI = 69;
const A4_FREQ = 440;

export function midiToFrequency(midi) {
  return A4_FREQ * Math.pow(2, (midi - A4_MIDI) / 12);
}

export function frequencyToMidi(freq) {
  return A4_MIDI + 12 * Math.log2(freq / A4_FREQ);
}

// Returns nearest note info for a given frequency: name, octave, exact target
// frequency, and deviation in cents (-50..+50, negative = flat, positive = sharp).
export function frequencyToNote(freq) {
  const midiFloat = frequencyToMidi(freq);
  const midi = Math.round(midiFloat);
  const cents = Math.round((midiFloat - midi) * 100);
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  return { midi, name, octave, cents, targetFrequency: midiToFrequency(midi) };
}

export function noteLabel(name, octave) {
  return `${name}${octave}`;
}
