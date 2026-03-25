import { WordData } from "../types";

export const INITIAL_WORDS: WordData[] = [
  {
    word: "apple",
    parts: ["ap", "ple"],
    partsPronunciation: ["ap", "pull"],
    root: "Old English 'æppel'",
    phonetic: "/ˈæp.əl/",
    translation: "苹果",
    sentence: "I eat a red apple.",
    imageUrl: "https://picsum.photos/seed/apple/400/400",
    relatedWords: ["pineapple", "applesauce", "apply"],
    phrases: ["red apple", "big apple", "an apple a day"]
  },
  {
    word: "happy",
    parts: ["hap", "py"],
    partsPronunciation: ["hap", "pee"],
    root: "hap (luck) + y",
    phonetic: "/ˈhæp.i/",
    translation: "快乐的",
    sentence: "The boy is very happy.",
    imageUrl: "https://picsum.photos/seed/happy/400/400",
    relatedWords: ["happiness", "unhappy", "happily"],
    phrases: ["happy birthday", "happy face", "be happy"]
  },
  {
    word: "tiger",
    parts: ["ti", "ger"],
    partsPronunciation: ["tie", "grr"],
    root: "Greek 'tigris'",
    phonetic: "/ˈtaɪ.ɡɚ/",
    translation: "老虎",
    sentence: "The tiger has orange stripes.",
    imageUrl: "https://picsum.photos/seed/tiger/400/400",
    relatedWords: ["tigress", "lion", "cat"],
    phrases: ["big tiger", "run like a tiger", "tiger stripes"]
  },
  {
    word: "dolphin",
    parts: ["dol", "phin"],
    partsPronunciation: ["dol", "fin"],
    root: "dol (like doll) + phin (sounds like fin)",
    phonetic: "/ˈdɑːl.fɪn/",
    translation: "海豚",
    sentence: "The dolphin jumped out of the water.",
    imageUrl: "https://picsum.photos/seed/dolphin/400/400",
    relatedWords: ["whale", "ocean", "swim"],
    phrases: ["smart dolphin", "playful dolphin", "sea dolphin"]
  },
  {
    word: "frightened",
    parts: ["fright", "ened"],
    partsPronunciation: ["frite", "und"],
    root: "fright (like light) + ened (sounds like und)",
    phonetic: "/ˈfraɪ.tənd/",
    translation: "受惊的",
    sentence: "The little girl was frightened by the loud noise.",
    imageUrl: "https://picsum.photos/seed/frightened/400/400",
    relatedWords: ["scared", "afraid", "fear"],
    phrases: ["frightened child", "feel frightened", "look frightened"]
  }
];
