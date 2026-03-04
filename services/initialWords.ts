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
  }
];