const A4_MIDI = 69;
const A4_FREQ = 440;

export function midiToFrequency(midi) {
  return A4_FREQ * Math.pow(2, (midi - A4_MIDI) / 12);
}
