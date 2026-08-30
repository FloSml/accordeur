import { midiToFrequency, noteLabel } from './notes.js';

function makeString(name, midi) {
  return { label: noteLabel(name, Math.floor(midi / 12) - 1), midi, frequency: midiToFrequency(midi) };
}

export const INSTRUMENTS = {
  guitar: {
    name: 'Guitare',
    tuning: 'Standard (Mi La Ré Sol Si Mi)',
    strings: [
      makeString('Mi', 40), // E2
      makeString('La', 45), // A2
      makeString('Ré', 50), // D3
      makeString('Sol', 55), // G3
      makeString('Si', 59), // B3
      makeString('Mi', 64), // E4
    ],
  },
  ukulele: {
    name: 'Ukulélé',
    tuning: 'Standard soprano/concert (Sol Do Mi La)',
    strings: [
      makeString('Sol', 67), // G4
      makeString('Do', 60), // C4
      makeString('Mi', 64), // E4
      makeString('La', 69), // A4
    ],
  },
};
