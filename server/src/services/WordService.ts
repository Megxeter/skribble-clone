import fs from 'fs';
import path from 'path';

export class WordService {
  private static instance: WordService | null = null;
  private wordBank: string[] = [];

  private constructor() {
    this.loadWords();
  }

  public static getInstance(): WordService {
    if (!WordService.instance) {
      WordService.instance = new WordService();
    }
    return WordService.instance;
  }

  private loadWords(): void {
    try {
      const filePath = path.resolve(__dirname, '../data/words.json');
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed: string[] = JSON.parse(raw);
      this.wordBank = parsed.map((w) => w.trim().toUpperCase());
      console.log(`[WordService] Loaded ${this.wordBank.length} words into dictionary`);
    } catch (err) {
      console.warn('[WordService] Failed to load words.json, using fallback words:', err);
      this.wordBank = [
        'APPLE', 'BANANA', 'CASTLE', 'DOLPHIN', 'ELEPHANT',
        'GUITAR', 'HOUSE', 'ISLAND', 'KITE', 'PENGUIN',
        'ROCKET', 'SUNFLOWER', 'TURTLE', 'VOLCANO', 'ZEBRA'
      ];
    }
  }

  public getRandomWords(count: number = 3): string[] {
    const shuffled = [...this.wordBank].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, this.wordBank.length));
  }

  public generateMask(word: string, revealedIndices: Set<number>): string {
    const chars: string[] = [];
    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      if (char === ' ') {
        chars.push(' ');
      } else if (revealedIndices.has(i)) {
        chars.push(char);
      } else {
        chars.push('_');
      }
    }
    return chars.join(' ');
  }

  public getNextHintIndex(word: string, revealedIndices: Set<number>): number | null {
    const maxReveals = Math.floor(word.length / 2);
    if (revealedIndices.size >= maxReveals) {
      return null;
    }

    const availableIndices: number[] = [];
    for (let i = 0; i < word.length; i++) {
      if (word[i] !== ' ' && !revealedIndices.has(i)) {
        availableIndices.push(i);
      }
    }

    if (availableIndices.length === 0) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * availableIndices.length);
    return availableIndices[randomIndex];
  }
}
