declare module 'nspell' {
  export interface NSpellDictionary {
    aff: string | Uint8Array;
    dic: string | Uint8Array;
  }

  export default class NSpell {
    constructor(dictionary: NSpellDictionary);
    /** True when the word is in the dictionary. */
    correct(word: string): boolean;
    /** Suggested corrections for a misspelled word. */
    suggest(word: string): string[];
    /** Add a word to the in-memory dictionary. */
    add(word: string): void;
  }
}
