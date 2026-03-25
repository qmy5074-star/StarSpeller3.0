import React, { useState, useEffect, useRef } from 'react';
import { WordData, DailyStats, GameStep, DBWordRecord, User } from './types';
import { generateWordData, generateWordImage, validateWordInput } from './services/geminiService';
import { 
  initializeDatabase, 
  initializeUsers,
  saveWordToDB, 
  getTodaysWords, 
  getWordsByDate,
  getWordsForReview, 
  getAllWords, 
  markWordAsReviewed,
  createNewUser,
  getAllUsers,
  exportDatabaseToJson,
  importDatabaseFromJson,
  deleteWordFromDB,
  saveDailyStats,
  getDailyStats,
  getAllDailyStats,
  findWordInAnyUser,
  migrateWordDataSchema,
  deleteUserByUsername,
  updateUserPassword
} from './services/dbService';
import { decrypt, sanitizeJsonString } from './src/utils/encryption';
import { playWinSound, playDissonance, playHarmony, startRhythmBeat, stopRhythmBeat } from './services/audioService';
import MicrophoneButton from './components/MicrophoneButton';
import StatsCard from './components/StatsCard';
import BottomNav from './components/BottomNav';
import TopBar from './components/TopBar';
import { GameButton } from './src/components/GameButton';
import { NoWordsModal } from './src/components/NoWordsModal';
import LibraryPage from './pages/LibraryPage';
import StatsPage from './pages/StatsPage';

// Helper Components
const SpeakerButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button onClick={onClick} className="p-3 bg-white rounded-full shadow-md text-blue-500 hover:scale-110 transition-transform">
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
    </svg>
  </button>
);

const SentenceHighlighter: React.FC<{ sentence: string; wordToHighlight: string }> = ({ sentence, wordToHighlight }) => {
  if (!sentence || !wordToHighlight) return null;
  const parts = sentence.split(new RegExp(`(${wordToHighlight})`, 'gi'));
  return (
    <span>
      {parts.map((part, i) => 
        part.toLowerCase() === wordToHighlight.toLowerCase() ? 
        <span key={i} className="text-blue-600 font-black bg-blue-100 px-1 rounded mx-0.5">{part}</span> : 
        part
      )}
    </span>
  );
};

// --- FUZZY MATCHING UTILITIES ---

// Levenshtein distance algorithm to calculate similarity between two strings
const levenshtein = (a: string, b: string): number => {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

// Robust matching function
const isFuzzyMatch = (input: string, targets: string[]): boolean => {
    const cleanInput = input.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!cleanInput) return false;

    return targets.some(target => {
        const cleanTarget = target.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        // 1. Direct includes (Context match)
        if (cleanInput.includes(cleanTarget)) return true;
        // 2. Input inside target (if input is short but correct, rarely happens with speech but good for safety)
        if (cleanTarget.includes(cleanInput) && cleanInput.length > 3) return true;

        // 3. Levenshtein Fuzzy Match
        const dist = levenshtein(cleanInput, cleanTarget);
        const maxLength = Math.max(cleanInput.length, cleanTarget.length);
        
        // Dynamic tolerance: 1 error for short words, 2 for medium, 3 for long phrases
        let allowedErrors = 1;
        if (maxLength > 5) allowedErrors = 2;
        if (maxLength > 10) allowedErrors = 3;

        return dist <= allowedErrors;
    });
};


// Utilities
const shuffleArray = <T,>(array: T[]): T[] => {
  return [...array].sort(() => Math.random() - 0.5);
};

const isVowel = (char: string) => ['a','e','i','o','u','y'].includes(char.toLowerCase());

const speak = (text: string) => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.8; 
    window.speechSynthesis.speak(utterance);
  }
};

const generateDistractors = (target: string): string[] => {
  const distractors = new Set<string>();
  const vowels = ['a','e','i','o','u'];
  const chars = target.split('');
  let vowelSwapped = false;
  for(let i=0; i<chars.length; i++) {
      if (vowels.includes(chars[i])) {
          const others = vowels.filter(v => v !== chars[i]);
          if (others.length > 0) {
              chars[i] = others[Math.floor(Math.random()*others.length)];
              vowelSwapped = true;
              break;
          }
      }
  }
  const d1 = chars.join('');
  if (d1 !== target && vowelSwapped) distractors.add(d1);
  else distractors.add(target + 's'); 

  if (target.length > 1) {
      distractors.add(target.slice(0, -1));
  } else {
      distractors.add(target + 't');
  }

  const rev = target.split('').reverse().join('');
  if (rev !== target) distractors.add(rev);
  else distractors.add(target + target.charAt(0));

  const result = Array.from(distractors).filter(d => d !== target);
  while(result.length < 3) {
      result.push(target + result.length); 
  }
  return result.slice(0, 3);
};

// Types for Test Step
interface Tile {
  id: string;
  val: string;
}

export default function App() {
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  useEffect(() => {
    const originalAlert = window.alert;
    window.alert = (msg: any) => {
      setAlertMessage(String(msg));
    };
    return () => {
      window.alert = originalAlert;
    };
  }, []);

  // Global App State
  const [step, setStep] = useState<GameStep>(GameStep.HOME);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // User Management State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  const [stats, setStats] = useState<DailyStats>({
    userId: '',
    date: new Date().toDateString(),
    stars: 0,
    badges: 0,
    highestBpm: 0,
    totalAttempts: 0,
    successCount: 0,
    totalTime: 0
  });
  const [allWordsList, setAllWordsList] = useState<DBWordRecord[]>([]);
  const [reviewQueue, setReviewQueue] = useState<DBWordRecord[]>([]);
  const [todaysWordsCount, setTodaysWordsCount] = useState(0);

  const [viewingMonth, setViewingMonth] = useState<Date>(new Date());
  const [practiceDate, setPracticeDate] = useState<string | null>(null);
  const [allDailyStats, setAllDailyStats] = useState<DailyStats[]>([]);
  const [importPending, setImportPending] = useState<{ file: File, data: any, type?: 'words' | 'account' } | null>(null);

  // Current Word Session State
  const [wordData, setWordData] = useState<WordData | null>(null);
  const [wordImage, setWordImage] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  
  // Input Step State
  const [inputTranscript, setInputTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);

  // Step 1 Observe State
  const [activePartHighlight, setActivePartHighlight] = useState<number | null>(null);
  const [shadowingTranscript, setShadowingTranscript] = useState("");
  const [shadowingAttempts, setShadowingAttempts] = useState(0);
  const [hasPassedShadowing, setHasPassedShadowing] = useState(false);

  // Step 2 Listen State
  const [currentRootIndex, setCurrentRootIndex] = useState(0);
  const [step2FailCount, setStep2FailCount] = useState(0);
  const [step2Error, setStep2Error] = useState<string | null>(null);

  // Step 3 Practice State
  const [practicePhase, setPracticePhase] = useState<'CHOICE'|'FILL'|'ORDER'>('CHOICE');
  const [practiceSuccess, setPracticeSuccess] = useState(false);
  const [practiceTargetIndex, setPracticeTargetIndex] = useState(0);
  const [practiceOptions, setPracticeOptions] = useState<string[]>([]);
  const [practiceInput, setPracticeInput] = useState("");
  const [orderedParts, setOrderedParts] = useState<string[]>([]);
  const [jumbledParts, setJumbledParts] = useState<string[]>([]);
  const [usedJumbledIndices, setUsedJumbledIndices] = useState<number[]>([]);

  // Step 4 Test State
  const [testSlots, setTestSlots] = useState<(Tile|null)[]>([]);
  const [testBank, setTestBank] = useState<Tile[]>([]);
  const [isWrongAnimation, setIsWrongAnimation] = useState(false);

  // Rhythm Game State
  const [isDailyChallenge, setIsDailyChallenge] = useState(false);
  const [challengeDate, setChallengeDate] = useState<string | null>(null);
  const [rhythmPhase, setRhythmPhase] = useState<'WAITING'|'PLAYING'|'WORD_COMPLETE'>('WAITING');
  const [rhythmWordIndex, setRhythmWordIndex] = useState(0);
  const [rhythmPartIndex, setRhythmPartIndex] = useState(0);
  const [rhythmCombo, setRhythmCombo] = useState(0);
  const [rhythmQueue, setRhythmQueue] = useState<WordData[]>([]);
  const [rhythmFallingOptions, setRhythmFallingOptions] = useState<string[]>([]);
  const [rhythmShake, setRhythmShake] = useState(false);
  
  const rhythmTimeoutRef = useRef<any | null>(null);
  const recognitionRef = useRef<any>(null);
  const startTimeRef = useRef<number>(0);
  const currentBPMRef = useRef<number>(80);

  // Data Version for forcing re-renders of child pages
  const [dataVersion, setDataVersion] = useState(0);

  // Initialization: Load User -> Then Load DB for that User
  useEffect(() => {
    const initApp = async () => {
      try {
        // 1. Initialize Users (this creates the default user if none exists)
        await initializeUsers();
        
        // 2. Run data migration for old word records
        await migrateWordDataSchema();

        const usersList = await getAllUsers();
        // Do not auto-login, require explicit login
        setAllUsers(usersList);

        // Auto-login if we have a saved userId
        const savedUserId = localStorage.getItem('starSpellerUserId');
        if (savedUserId) {
            const user = usersList.find(u => u.id === savedUserId);
            if (user) {
                setCurrentUser(user);
                setStep(GameStep.INPUT_WORD);
            }
        }
        setIsInitialized(true);
      } catch (err) {
        console.error("Failed to initialize app:", err);
        setIsInitialized(true);
      }
    };
    initApp();

    // Listen for quota errors
    const handleQuota = () => setStep(GameStep.QUOTA_EXCEEDED);
    window.addEventListener('gemini-quota-exceeded', handleQuota);
    return () => window.removeEventListener('gemini-quota-exceeded', handleQuota);
  }, []);

  // Effect: Speak whole word when practice phase succeeds
  useEffect(() => {
      if (practiceSuccess && wordData) {
          setTimeout(() => speak(wordData.word), 500);
      }
  }, [practiceSuccess, wordData]);

  // Screen Wake Lock API to prevent phone sleeping during voice input
  useEffect(() => {
    let wakeLock: any = null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
          console.log('Screen Wake Lock acquired');
        }
      } catch (err) {
        console.log(`Wake Lock error: ${err}`);
      }
    };

    // Request on load
    requestWakeLock();

    // Re-request when tab becomes visible again (e.g. user minimized app)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock) {
        wakeLock.release().then(() => {
           console.log('Screen Wake Lock released');
        });
      }
    };
  }, []);

  // Effect: When User changes, reload all data
  useEffect(() => {
      if (!isInitialized) return;
      if (currentUser) {
          localStorage.setItem('starSpellerUserId', currentUser.id);
          loadUserData(currentUser.id);
          // Reset Game State on user switch
          setStats({
            userId: currentUser.id,
            date: new Date().toDateString(),
            stars: 0,
            badges: 0,
            highestBpm: 0,
            totalAttempts: 0,
            successCount: 0,
            totalTime: 0
          });
      } else {
          localStorage.removeItem('starSpellerUserId');
      }
  }, [currentUser]);

  const [totalStars, setTotalStars] = useState(0);
  const [totalBadges, setTotalBadges] = useState(0);

  const loadUserData = async (userId: string) => {
      await initializeDatabase(userId);
      
      const all = await getAllWords(userId);
      setAllWordsList(all);
      
      const today = await getTodaysWords(userId);
      setTodaysWordsCount(today.length);
      setRhythmQueue(today.map(r => r.data));

      const review = await getWordsForReview(userId);
      setReviewQueue(review);

      const allStats = await getAllDailyStats(userId);
      setAllDailyStats(allStats);

      const todayStats = allStats.find(s => s.date === new Date().toDateString());
      if (todayStats) {
          setStats(todayStats);
      } else {
          setStats({
              userId: userId,
              date: new Date().toDateString(),
              stars: 0,
              badges: 0,
              highestBpm: 0,
              totalAttempts: 0,
              successCount: 0,
              totalTime: 0
          });
      }
  };

  useEffect(() => {
      if (!currentUser || !viewingMonth) return;
      const monthStr = viewingMonth.getMonth();
      const yearStr = viewingMonth.getFullYear();
      let mStars = 0;
      let mBadges = 0;
      allDailyStats.forEach(s => {
          const d = new Date(s.date);
          if (d.getMonth() === monthStr && d.getFullYear() === yearStr) {
              mStars += (s.stars || 0);
              mBadges += (s.badges || 0);
          }
      });
      setTotalStars(mStars);
      setTotalBadges(mBadges);
  }, [allDailyStats, viewingMonth, currentUser]);

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [isManagingUsers, setIsManagingUsers] = useState(false);
  const [showNoWordsModal, setShowNoWordsModal] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [manageUserPasswords, setManageUserPasswords] = useState<Record<string, string>>({});

  const handleCreateUser = async (name: string, password?: string) => {
      const trimmedName = name.trim();
      const trimmedPassword = password?.trim();
      if (!trimmedName || !trimmedPassword) {
          alert("Username and password are required.");
          return;
      }
      if (trimmedName.toLowerCase() === 'eva') {
          alert("The name 'Eva' is reserved for the super member.");
          return;
      }
      try {
          if (rhythmTimeoutRef.current) {
              clearTimeout(rhythmTimeoutRef.current);
              rhythmTimeoutRef.current = null;
          }
          const newUser = await createNewUser(trimmedName, trimmedPassword);
          setAllUsers(await getAllUsers());
          setCurrentUser(newUser); // Switches to new user automatically
          setLoginUsername("");
          setLoginPassword("");
          setInputTranscript("");
          setWordData(null);
          setWordImage("");
          setRhythmQueue([]);
          setRhythmPhase('WAITING');
          setRhythmWordIndex(0);
          setRhythmPartIndex(0);
          setRhythmCombo(0);
          setRhythmFallingOptions([]);
          setRhythmShake(false);
          setStep(GameStep.INPUT_WORD);
      } catch (e: any) {
          alert(e.message || "Failed to create user.");
          throw e;
      }
  };

  const handleSwitchUser = (user: User | null) => {
      if (rhythmTimeoutRef.current) {
          clearTimeout(rhythmTimeoutRef.current);
          rhythmTimeoutRef.current = null;
      }
      setCurrentUser(user);
      setInputTranscript("");
      setWordData(null);
      setWordImage("");
      setRhythmQueue([]);
      setRhythmPhase('WAITING');
      setRhythmWordIndex(0);
      setRhythmPartIndex(0);
      setRhythmCombo(0);
      setRhythmFallingOptions([]);
      setRhythmShake(false);
      setStep(GameStep.HOME);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmedName = loginUsername.trim();
      const trimmedPassword = loginPassword.trim();
      
      if (!trimmedName || !trimmedPassword) {
          alert("Username and password are required.");
          return;
      }

      // Refresh users list from DB to ensure we have the latest passwords
      const usersList = await getAllUsers();
      setAllUsers(usersList);

      const user = usersList.find(u => u.username.toLowerCase() === trimmedName.toLowerCase());
      if (user) {
          // Default all users to '123' if no password is set, to match user expectation
          const expectedPassword = user.password || '123';
          
          if (expectedPassword === trimmedPassword) {
              if (rhythmTimeoutRef.current) {
                  clearTimeout(rhythmTimeoutRef.current);
                  rhythmTimeoutRef.current = null;
              }
              setCurrentUser(user);
              setLoginUsername("");
              setLoginPassword("");
              setInputTranscript("");
              setWordData(null);
              setWordImage("");
              setRhythmQueue([]);
              setRhythmPhase('WAITING');
              setRhythmWordIndex(0);
              setRhythmPartIndex(0);
              setRhythmCombo(0);
              setRhythmFallingOptions([]);
              setRhythmShake(false);
              setStep(GameStep.INPUT_WORD);
          } else {
              alert("Incorrect password.");
          }
      } else {
          alert("User not found.");
      }
  };

  // --- DATA EXPORT / IMPORT ---

  const handleExportWords = async () => {
    if (!currentUser) return;
    try {
        const json = await exportDatabaseToJson(currentUser.id, currentUser.username, 'words');
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        // Filename matches "word_data" requirement
        a.download = `word_data_${new Date().toISOString().split('T')[0]}_${currentUser.username}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error("Export failed", e);
        alert("Backup failed.");
    }
  };

  const handleImportWords = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!currentUser) return;
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
          try {
              const json = event.target?.result as string;
              setImportPending({ file, data: json, type: 'words' });
          } catch (err) {
              console.error(err);
              alert("Failed to read import data.");
          }
      };
      reader.readAsText(file);
      e.target.value = ''; // Reset input
  };

  const handleExportAccount = async () => {
    if (!currentUser) return;
    try {
        const json = await exportDatabaseToJson(currentUser.id, currentUser.username, 'account');
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `account_data_${new Date().toISOString().split('T')[0]}_${currentUser.username}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error("Export account failed", e);
        alert("Account backup failed.");
    }
  };

  const handleImportAccount = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!currentUser) return;
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
          try {
              const json = event.target?.result as string;
              setImportPending({ file, data: json, type: 'account' });
          } catch (err) {
              console.error(err);
              alert("Failed to read import data.");
          }
      };
      reader.readAsText(file);
      e.target.value = ''; // Reset input
  };
  
  const handleDeleteWord = async (word: string, e: React.MouseEvent) => {
      // CRITICAL: Stop propagation immediately to prevent card click
      e.stopPropagation();
      e.preventDefault();

      if (!currentUser) return;
      
      // OPTIMISTIC UPDATE: Remove immediately from all lists without waiting or asking
      const lowerWord = word.toLowerCase();
      const targetDate = practiceDate || new Date().toDateString();
      
      setAllWordsList(prev => {
          return prev.map(w => {
              if (w.word.toLowerCase() === lowerWord) {
                  if (w.datesAdded && w.datesAdded.length > 1) {
                      return { ...w, datesAdded: w.datesAdded.filter(d => d !== targetDate) };
                  }
                  return null;
              }
              return w;
          }).filter(Boolean) as DBWordRecord[];
      });
      
      setReviewQueue(prev => prev.filter(w => w.word.toLowerCase() !== lowerWord));
      
      // Also update rhythm queue and the count
      setRhythmQueue(prev => {
          const newQ = prev.filter(w => w.word.toLowerCase() !== lowerWord);
          if (newQ.length !== prev.length) {
              setTodaysWordsCount(newQ.length);
          }
          return newQ;
      });

      try {
         // Then delete from DB
         await deleteWordFromDB(currentUser.id, word, targetDate);
      } catch (err) {
         console.error("Failed to delete", err);
         alert("Could not delete word.");
         // Rollback if needed
         loadUserData(currentUser.id);
      }
  };

  // --- HELPER: Pronunciation ---
  const getPartPronunciation = (data: WordData, index: number) => {
    // Client-side overrides for known problematic pronunciations
    if (data.word.toLowerCase() === 'kangaroo') {
      const overrides = ['kang', 'guh', 'roo'];
      if (index < overrides.length) return overrides[index];
    }
    if (data.word.toLowerCase() === 'penguin') {
      const overrides = ['pen', 'gwin'];
      if (index < overrides.length) return overrides[index];
    }
    if (data.word.toLowerCase() === 'bird') {
      return 'bird';
    }
    if (data.word.toLowerCase() === 'shirt') {
      return 'shirt';
    }

    if (data.partsPronunciation && data.partsPronunciation[index]) {
      return data.partsPronunciation[index];
    }
    return data.parts[index];
  };

  // --- NAVIGATION & FLOW ---

  const cleanupSession = () => {
    stopRhythmBeat();
    if (rhythmTimeoutRef.current) {
        clearTimeout(rhythmTimeoutRef.current);
        rhythmTimeoutRef.current = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
    }
    setIsListening(false);
  };

  const handleNavigation = (targetStep: GameStep) => {
      if (step === targetStep) return;
      if (!currentUser && targetStep !== GameStep.HOME) {
          alert("Please login first.");
          return;
      }
      cleanupSession();
      if (targetStep === GameStep.HOME) {
          setIsDailyChallenge(false);
          setChallengeDate(null);
          currentBPMRef.current = 80;
          setViewingMonth(new Date());
      } else if (targetStep === GameStep.RHYTHM_INTRO) {
          // Default to Daily Challenge when navigating from bottom nav
          setIsDailyChallenge(true);
          const today = new Date().toDateString();
          setChallengeDate(today);
          currentBPMRef.current = 80;
          if (currentUser) {
              getTodaysWords(currentUser.id).then(words => {
                  setRhythmQueue(words.map(w => w.data));
              });
          }
      }
      setStep(targetStep);
  };

  const handleStartChallenge = (words: WordData[], startBpm: number, date: string) => {
      setRhythmQueue(words);
      currentBPMRef.current = startBpm;
      setChallengeDate(date);
      setIsDailyChallenge(true);
      setStep(GameStep.RHYTHM_INTRO);
  };

  const handleStartRandomRhythm = async () => {
    if (currentUser) {
        const allWords = await getAllWords(currentUser.id);
        const today = new Date().toDateString();
        // Exclude today's new words as requested
        const pastWords = allWords.filter(w => w.dateAdded !== today);
        
        if (pastWords.length > 0) {
            const shuffled = [...pastWords].sort(() => 0.5 - Math.random());
            setRhythmQueue(shuffled.slice(0, 5).map(w => w.data));
            setIsDailyChallenge(false); // Mark as not daily
            currentBPMRef.current = 80; // Reset BPM for new random challenge
            setStep(GameStep.RHYTHM_INTRO);
        } else {
            alert("No past words available to challenge. Try adding some words first!");
        }
    }
  };

  const handleStart = () => {
    setStep(GameStep.INPUT_WORD);
    setInputTranscript("");
    setIsListening(false);
  };

  const handleRestart = () => {
    cleanupSession();
    setIsDailyChallenge(false); 
    setChallengeDate(null);
    currentBPMRef.current = 80; 
    setStep(GameStep.HOME);
  };

  const handleStartReview = () => {
     if (reviewQueue.length > 0) {
       const yesterday = new Date();
       yesterday.setDate(yesterday.getDate() - 1);
       processWordInput(reviewQueue[0].word, yesterday.toDateString());
     }
  };

  // --- SHARED VOICE HELPERS ---

  const handleVoiceStop = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) { }
    }
    setIsListening(false);
  };

  // --- INPUT STEP ---

  const handleInputStart = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert("Speech recognition not supported on this browser. Please use Chrome on desktop.");
      return;
    }
    setInputTranscript("");
    const recognition = new (window as any).webkitSpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'en-US';
    recognition.interimResults = true; 
    recognition.continuous = true; 
    
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const results = event.results;
      const transcript = results[results.length - 1][0].transcript;
      setInputTranscript(transcript);
    };
    recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
            console.error("Speech recognition error", event.error);
        }
        setIsListening(false);
        if (event.error === 'not-allowed') {
            alert("Microphone access denied. Please allow microphone permissions.");
        } else if (event.error === 'no-speech' || event.error === 'aborted') {
            // Ignore no-speech and aborted errors
        } else {
            alert("Voice input error: " + event.error);
        }
    };
    recognition.onend = () => setIsListening(false);
    
    recognition.start();
  };

  const processWordInput = async (word: string, date?: string) => {
    if (!currentUser) return;
    setIsLoading(true);
    setPracticeDate(date || null);
    try {
      // Check local list first (which is already filtered by user)
      const existing = allWordsList.find(w => w.word.toLowerCase() === word.toLowerCase());
      let data: WordData;
      let img: string;

      if (existing) {
        data = existing.data;
        
        // Patch for "cake" if it was previously split incorrectly
        if (data.word.toLowerCase() === 'cake' && data.parts.length > 1) {
            data.parts = ['cake'];
            data.partsPronunciation = ['cake'];
            await saveWordToDB(currentUser.id, currentUser.username, data, !date);
        }

        // Check if image is missing or empty (e.g. from Eva-specific seed)
        if (!data.imageUrl || data.imageUrl === "") {
             try {
                 img = await generateWordImage(word);
                 data.imageUrl = img;
                 // Update DB with new image so we don't generate again next time
                 await saveWordToDB(currentUser.id, currentUser.username, data, !date);
                 
                 // Refresh lists to reflect the update
                 const all = await getAllWords(currentUser.id);
                 setAllWordsList(all);
             } catch (e) {
                 console.warn("Image gen failed", e);
                 img = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'><rect width='400' height='400' fill='%23e0f2fe'/><text x='50%' y='50%' font-family='sans-serif' font-size='80' fill='%237dd3fc' text-anchor='middle' dominant-baseline='middle'>🖼️</text><text x='50%' y='65%' font-family='sans-serif' font-size='20' fill='%237dd3fc' text-anchor='middle' dominant-baseline='middle'>No Image</text></svg>`;
             }
        } else {
             img = data.imageUrl;
             // Even if image exists, we want to update the dateAdded to today if not from calendar
             await saveWordToDB(currentUser.id, currentUser.username, data, !date);
             
             // Refresh lists
             const all = await getAllWords(currentUser.id);
             setAllWordsList(all);
             const today = await getTodaysWords(currentUser.id);
             setTodaysWordsCount(today.length);
             
             if (date) {
                 const targetDateWords = await getWordsByDate(currentUser.id, date);
                 setRhythmQueue(targetDateWords.map(r => r.data));
             } else {
                 setRhythmQueue(today.map(r => r.data));
             }
        }
      } else {
        // Validate word before generating or searching
        const validation = await validateWordInput(word);
        if (!validation.isValid) {
            setValidationError(validation.reason || "Invalid word.");
            setIsLoading(false);
            return;
        }
        
        const wordToProcess = validation.correctedWord || word;

        // Check if ANY user has this word first to save tokens
        const existingInOtherUser = await findWordInAnyUser(wordToProcess);
        
        if (existingInOtherUser && existingInOtherUser.data) {
            console.log("Found existing word data from another user, reusing...", existingInOtherUser.data);
            data = existingInOtherUser.data;
            img = data.imageUrl || "";
            
            // If the reused word has no image, try to generate one now
            if (!img) {
                 try {
                    img = await generateWordImage(wordToProcess);
                    data.imageUrl = img;
                } catch (e) {
                    console.warn("Image gen failed", e);
                    img = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'><rect width='400' height='400' fill='%23e0f2fe'/><text x='50%' y='50%' font-family='sans-serif' font-size='80' fill='%237dd3fc' text-anchor='middle' dominant-baseline='middle'>🖼️</text><text x='50%' y='65%' font-family='sans-serif' font-size='20' fill='%237dd3fc' text-anchor='middle' dominant-baseline='middle'>No Image</text></svg>`;
                }
            }
        } else {
            // Generate fresh from AI
            data = await generateWordData(wordToProcess);
            try {
                img = await generateWordImage(wordToProcess);
            } catch (e) {
                console.warn("Image gen failed", e);
                img = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'><rect width='400' height='400' fill='%23e0f2fe'/><text x='50%' y='50%' font-family='sans-serif' font-size='80' fill='%237dd3fc' text-anchor='middle' dominant-baseline='middle'>🖼️</text><text x='50%' y='65%' font-family='sans-serif' font-size='20' fill='%237dd3fc' text-anchor='middle' dominant-baseline='middle'>No Image</text></svg>`;
            }
            data.imageUrl = img;
        }
        
        // Save using current User ID
        await saveWordToDB(currentUser.id, currentUser.username, data, !date);
        
        // Refresh lists
        const all = await getAllWords(currentUser.id);
        setAllWordsList(all);
        const today = await getTodaysWords(currentUser.id);
        setTodaysWordsCount(today.length);
        
        if (date) {
            const targetDateWords = await getWordsByDate(currentUser.id, date);
            setRhythmQueue(targetDateWords.map(r => r.data));
        } else {
            setRhythmQueue(today.map(r => r.data));
        }
      }

      setPracticeSuccess(false);
      setWordData(data);
      setWordImage(img);
      setStep(GameStep.STEP_1_OBSERVE);
      startTimeRef.current = Date.now(); 
      
      setHasPassedShadowing(false);
      setShadowingAttempts(0);
      setShadowingTranscript("");
      speak(data.word);

    } catch (e: any) {
      console.error(e);
      const errorMessage = e?.message || "Could not load word. Please check your network or API key.";
      setValidationError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // --- STEP 1, 2, 3... (Logic remains mostly same, just checking wordData) ---
  // ... (Snipped for brevity, logic identical to previous version, assuming they use wordData state)

  const handlePartClick = (part: string, i: number) => {
    if (!wordData) return;
    setActivePartHighlight(i);
    const pronounce = getPartPronunciation(wordData, i);
    speak(pronounce);
    setTimeout(() => setActivePartHighlight(null), 1000);
  };
  
  const handleRegenerateImage = async () => {
      if (!wordData || !currentUser) return;
      setIsLoading(true);
      try {
          const img = await generateWordImage(wordData.word);
          const updatedData = { ...wordData, imageUrl: img };
          setWordData(updatedData);
          setWordImage(img);
          await saveWordToDB(currentUser.id, currentUser.username, updatedData);
          
          // Refresh lists
          const all = await getAllWords(currentUser.id);
          setAllWordsList(all);
          const todays = await getTodaysWords(currentUser.id);
          setTodaysWordsCount(todays.length);
      } catch (e) {
          console.error("Failed to regenerate image", e);
          setValidationError("Could not regenerate image. Please try again.");
      } finally {
          setIsLoading(false);
      }
  };

  const handleSaveFlashcard = async () => {
    if (!wordData) return;
    
    try {
        const element = document.getElementById('downloadable-flashcard');
        if (!element) {
            console.error("Flashcard element not found");
            return;
        }

        // Use html2canvas to capture the hidden element
        const canvas = await (window as any).html2canvas(element, {
            useCORS: true, 
            scale: 2, // High resolution
            backgroundColor: null
        });

        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `StarSpeller_${wordData.word}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

    } catch (err) {
        console.error("Download failed", err);
        setValidationError("Could not generate image. Please try again.");
    }
  };

  const handleShadowingStart = () => {
      if (!wordData) return;
      if (!('webkitSpeechRecognition' in window)) {
        setHasPassedShadowing(true); 
        return;
      }
      setShadowingTranscript("");
      const recognition = new (window as any).webkitSpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        const results = event.results;
        const transcript = results[results.length - 1][0].transcript.toLowerCase();
        setShadowingTranscript(transcript);
        
        if (isFuzzyMatch(transcript, [wordData.word])) {
           playWinSound();
           setHasPassedShadowing(true);
           recognition.stop();
        }
      };
      recognition.onerror = (event: any) => {
          if (event.error !== 'no-speech' && event.error !== 'aborted') {
              console.error("Speech recognition error", event.error);
          }
          setIsListening(false);
      };
      recognition.onend = () => {
         setIsListening(false);
         if (!hasPassedShadowing) setShadowingAttempts(prev => prev + 1);
      };
      recognition.start();
  };

  const skipShadowing = () => setHasPassedShadowing(true);

  const startStep2 = () => {
    setStep(GameStep.STEP_2_LISTEN);
    setCurrentRootIndex(0);
    setStep2Error(null);
    setStep2FailCount(0);
    if(wordData) speak(getPartPronunciation(wordData, 0));
  };

  const handleStep2Skip = () => {
     if (!wordData) return;
     const nextIdx = currentRootIndex + 1;
     setCurrentRootIndex(nextIdx);
     setStep2FailCount(0);
     setStep2Error(null);
     
     if (nextIdx >= wordData.parts.length) {
         playWinSound();
     } else {
         speak(getPartPronunciation(wordData, nextIdx));
     }
  };

  const handleListenStart = () => {
    if (!wordData) return;
    const targetPart = wordData.parts[currentRootIndex].toLowerCase();
    // We want the user to spell the letters, so the target is the letters spoken individually
    const targetSpelling = targetPart.split('').join(' ').toLowerCase();

    if (!('webkitSpeechRecognition' in window)) {
       handleStep2Skip();
       return;
    }
    setStep2Error(null);
    const recognition = new (window as any).webkitSpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'en-US';
    recognition.continuous = false; 
    recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript.toLowerCase();
      
      // Clean up the transcript: remove spaces, punctuation, etc. to just get the letters
      const cleanedTranscript = transcript.replace(/[^a-z]/g, '');
      const cleanedTarget = targetPart.replace(/[^a-z]/g, '');
      
      // Also allow if the transcript exactly matches the space-separated letters
      const isMatch = cleanedTranscript === cleanedTarget || isFuzzyMatch(transcript, [targetSpelling]);

      if (isMatch) { 
         const nextIdx = currentRootIndex + 1;
         setCurrentRootIndex(nextIdx);
         setStep2FailCount(0);
         if (nextIdx >= wordData.parts.length) {
             playWinSound();
         } else {
             setTimeout(() => speak(getPartPronunciation(wordData, nextIdx)), 500);
         }
      } else {
         setStep2FailCount(prev => prev + 1);
         setStep2Error(`Heard: "${transcript}". Try spelling: "${targetSpelling}"`);
         playDissonance();
      }
    };
    recognition.onerror = (e: any) => {
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
            console.error("Speech error", e.error);
        }
        setIsListening(false);
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
            setStep2FailCount(prev => prev + 1);
        }
    };
    recognition.onend = () => setIsListening(false);
    
    try {
        recognition.start();
    } catch (e) {
        console.error("Failed to start recognition", e);
    }
  };

  const startStep3 = () => {
      setStep(GameStep.STEP_3_PRACTICE);
      initPracticeRound('CHOICE');
  };
  const initPracticeRound = (phase: 'CHOICE'|'FILL'|'ORDER') => {
      if (!wordData) return;
      setPracticePhase(phase);
      setPracticeSuccess(false);
      if (phase === 'CHOICE') {
          const idx = Math.floor(Math.random() * wordData.parts.length);
          setPracticeTargetIndex(idx);
          const target = wordData.parts[idx];
          const distractors = generateDistractors(target);
          setPracticeOptions(shuffleArray([target, ...distractors]));
      } else if (phase === 'FILL') {
          const idx = Math.floor(Math.random() * wordData.parts.length);
          setPracticeTargetIndex(idx);
          setPracticeInput("");
      } else if (phase === 'ORDER') {
          setOrderedParts([]);
          setJumbledParts(shuffleArray([...wordData.parts]));
          setUsedJumbledIndices([]);
      }
  };
  const handleChoiceSubmit = (opt: string) => {
      if(!wordData) return;
      if (opt.toLowerCase() === wordData.parts[practiceTargetIndex].toLowerCase()) {
          playWinSound();
          setPracticeSuccess(true);
      } else playDissonance();
  };
  const handleFillSubmit = () => {
      if(!wordData) return;
      if (practiceInput.toLowerCase() === wordData.parts[practiceTargetIndex].toLowerCase()) {
          playWinSound();
          setPracticeSuccess(true);
      } else playDissonance();
  };
  const handleOrderClick = (part: string, idx: number) => {
      if (!wordData) return;
      if (usedJumbledIndices.includes(idx)) return;
      const newOrdered = [...orderedParts, part];
      setOrderedParts(newOrdered);
      setUsedJumbledIndices([...usedJumbledIndices, idx]);
      if (newOrdered.length === wordData.parts.length) {
          if (newOrdered.join('').toLowerCase() === wordData.word.toLowerCase()) {
              playWinSound();
              setPracticeSuccess(true);
          } else {
              playDissonance();
              setTimeout(() => {
                  setOrderedParts([]);
                  setUsedJumbledIndices([]);
              }, 1000);
          }
      }
  };
  const handleNextPracticePhase = () => {
      if (practicePhase === 'CHOICE') initPracticeRound('FILL');
      else if (practicePhase === 'FILL') initPracticeRound('ORDER');
      else startStep4();
  };
  const startStep4 = () => {
      setStep(GameStep.STEP_4_TEST);
      if (!wordData) return;
      const parts = wordData.word.split('').map((char, i) => ({ id: `${char}-${i}`, val: char }));
      setTestBank(shuffleArray(parts));
      setTestSlots(new Array(parts.length).fill(null));
      setIsWrongAnimation(false);
  };
  const handleBankTileClick = (tile: Tile) => {
      // Speak the letter
      speak(tile.val);
      
      const firstEmpty = testSlots.indexOf(null);
      if (firstEmpty !== -1) {
          const newSlots = [...testSlots];
          newSlots[firstEmpty] = tile;
          setTestSlots(newSlots);
          setTestBank(prev => prev.filter(t => t.id !== tile.id));
          
          // If this was the last empty slot, speak the whole word
          if (newSlots.indexOf(null) === -1 && wordData) {
              setTimeout(() => {
                  speak(wordData.word);
              }, 500); // Small delay after the letter is spoken
          }
      }
  };
  const handleSlotTileClick = (slot: Tile | null, index: number) => {
      if (!slot) return;
      const newSlots = [...testSlots];
      newSlots[index] = null;
      setTestSlots(newSlots);
      setTestBank(prev => [...prev, slot]);
  };
  const handleTestSubmit = async () => {
      if (!wordData || !currentUser) return;
      const result = testSlots.map(s => s?.val).join('');
      if (result.toLowerCase() === wordData.word.toLowerCase()) {
          playWinSound();
          const timeTaken = (Date.now() - startTimeRef.current) / 1000;
          
          // SAVE PROGRESS with current User ID
          const targetDate = practiceDate || new Date().toDateString();
          await markWordAsReviewed(currentUser.id, wordData.word);
          
          // FIX: Use case-insensitive filtering for review queue
          setReviewQueue(prev => prev.filter(r => r.word.toLowerCase() !== wordData.word.toLowerCase()));
          
          // Refresh list for rhythm game based on the target date
          const targetDateWords = await getWordsByDate(currentUser.id, targetDate);
          
          // Use the words from the target date for the rhythm game
          if (targetDateWords.length > 0) {
              setRhythmQueue(targetDateWords.map(r => r.data));
          } else {
              setRhythmQueue([wordData]);
          }
          
          // Set challenge date to the practice date so badges are awarded to the correct day
          setChallengeDate(targetDate);

          // UPDATE STATS
          let targetStats = await getDailyStats(currentUser.id, targetDate);
          if (!targetStats) {
              targetStats = {
                  userId: currentUser.id,
                  date: targetDate,
                  stars: 0,
                  badges: 0,
                  highestBpm: 0,
                  totalAttempts: 0,
                  successCount: 0,
                  totalTime: 0
              };
          }
          targetStats.successCount = (targetStats.successCount || 0) + 1;
          targetStats.totalTime = (targetStats.totalTime || 0) + timeTaken;
          targetStats.stars = (targetStats.stars || 0) + 1;

          await saveDailyStats(targetStats);

          setAllDailyStats(prev => {
              const idx = prev.findIndex(s => s.date === targetDate);
              if (idx >= 0) {
                  const newArr = [...prev];
                  newArr[idx] = targetStats;
                  return newArr;
              }
              return [...prev, targetStats];
          });

          if (targetDate === new Date().toDateString()) {
              setStats(targetStats);
          }

          setStep(GameStep.SUCCESS);
      } else {
          playDissonance();
          setIsWrongAnimation(true);
          setTimeout(() => setIsWrongAnimation(false), 500);
      }
  };
  const startStep5Daily = async () => {
      // If it's a random challenge and we already have a queue, just start the game
      if (!isDailyChallenge && rhythmQueue.length > 0) {
          startRhythmCommon();
          return;
      }

      setIsDailyChallenge(true);
      const targetDate = challengeDate || new Date().toDateString();
      if (!challengeDate) {
          setChallengeDate(targetDate);
      }
      
      let queue: WordData[] = [];
      if (currentUser) {
          const targetDateWords = await getWordsByDate(currentUser.id, targetDate);
          if (targetDateWords.length > 0) {
              queue = targetDateWords.map(r => r.data);
          } else if (wordData) {
              queue = [wordData];
          }
      }
      
      if (queue.length === 0) {
          setShowNoWordsModal(true);
          return;
      }
      
      setRhythmQueue(queue);
      startRhythmCommon();
  };
  const startRhythmCommon = () => {
      setStep(GameStep.STEP_5_RHYTHM);
      setRhythmPhase('WAITING');
      setRhythmWordIndex(0);
      setRhythmPartIndex(0);
      setRhythmCombo(0);
      speak(`Rhythm Mode! Start at ${currentBPMRef.current} BPM.`);
  };
  const startRhythmGamePlay = () => {
      setRhythmPhase('PLAYING');
      startRhythmBeat(currentBPMRef.current); 
      prepareRhythmRound(0, 0); 
  };
  const handleRhythmFail = () => {
    if (rhythmTimeoutRef.current) {
        clearTimeout(rhythmTimeoutRef.current);
        rhythmTimeoutRef.current = null;
    }
    playDissonance();
    stopRhythmBeat();
    setRhythmShake(true);
    setRhythmCombo(0);
    speak("Too slow or wrong!");
    setTimeout(() => {
       setRhythmShake(false);
       setStep(GameStep.FAIL);
    }, 800);
  };
  const prepareRhythmRound = (wIndex: number, pIndex: number) => {
      if (rhythmTimeoutRef.current) {
          clearTimeout(rhythmTimeoutRef.current);
          rhythmTimeoutRef.current = null;
      }
      if (wIndex >= rhythmQueue.length) {
          setTimeout(async () => {
              stopRhythmBeat();
              playWinSound();
              
              if (currentUser && challengeDate && isDailyChallenge) {
                  try {
                      const currentStats = await getDailyStats(currentUser.id, challengeDate) || {
                          userId: currentUser.id,
                          date: challengeDate,
                          stars: 0,
                          badges: 0,
                          highestBpm: 0
                      };
                      
                      const nextBpm = currentBPMRef.current + 5;
                      const currentHighest = currentStats.highestBpm || 0;
                      if (nextBpm > currentHighest) {
                          currentStats.highestBpm = nextBpm;
                      }
                      
                      currentStats.badges = (currentStats.badges || 0) + 1;
                      await saveDailyStats(currentStats);
                      
                      setAllDailyStats(prev => {
                          const idx = prev.findIndex(s => s.date === challengeDate);
                          if (idx >= 0) {
                              const newArr = [...prev];
                              newArr[idx] = currentStats;
                              return newArr;
                          }
                          return [...prev, currentStats];
                      });

                      // Update local stats if it's today
                      if (challengeDate === new Date().toDateString()) {
                          setStats(prev => ({
                              ...prev,
                              badges: (prev.badges || 0) + 1,
                              highestBpm: Math.max(prev.highestBpm || 0, nextBpm)
                          }));
                      }
                  } catch (e) {
                      console.error("Failed to save stats", e);
                  }
              } else if (currentUser) {
                  // Random Challenge Logic: Update total badges and all-time high rhythm
                  try {
                      const today = new Date().toDateString();
                      const currentStats = await getDailyStats(currentUser.id, today) || {
                          userId: currentUser.id,
                          date: today,
                          stars: 0,
                          badges: 0,
                          highestBpm: 0,
                          totalAttempts: 0,
                          successCount: 0,
                          totalTime: 0
                      };
                      
                      const nextBpm = currentBPMRef.current + 5;
                      const currentHighest = currentStats.highestBpm || 0;
                      if (nextBpm > currentHighest) {
                          currentStats.highestBpm = nextBpm;
                      }
                      
                      currentStats.badges = (currentStats.badges || 0) + 1;
                      await saveDailyStats(currentStats);
                      
                      setAllDailyStats(prev => {
                          const idx = prev.findIndex(s => s.date === today);
                          if (idx >= 0) {
                              const newArr = [...prev];
                              newArr[idx] = currentStats;
                              return newArr;
                          }
                          return [...prev, currentStats];
                      });

                      setStats(currentStats);
                  } catch (e) {
                      console.error("Failed to save random challenge stats", e);
                  }
              }

              currentBPMRef.current += 5;
              speak("Amazing! You earned a Badge!");
              setStep(GameStep.SUCCESS);
          }, 1000);
          return;
      }
      const currentWordData = rhythmQueue[wIndex];
      setRhythmWordIndex(wIndex);
      setRhythmPartIndex(pIndex);
      
      const target = currentWordData.parts[pIndex];
      const distractors = generateDistractors(target);
      const options = shuffleArray([target, ...distractors]);
      setRhythmFallingOptions(options);

      if (pIndex < currentWordData.parts.length) {
         const pronounce = getPartPronunciation(currentWordData, pIndex);
         setTimeout(() => speak(pronounce), 200);
      }

      const bpm = currentBPMRef.current;
      const msPerBeat = 60000 / bpm;
      const graceBeats = 4;
      const timeLimit = msPerBeat * graceBeats;
      rhythmTimeoutRef.current = setTimeout(() => {
          handleRhythmFail();
      }, timeLimit);
  };
  const handleRhythmHit = (selectedPart: string) => {
      if (rhythmTimeoutRef.current) {
          clearTimeout(rhythmTimeoutRef.current);
          rhythmTimeoutRef.current = null;
      }
      const currentWordData = rhythmQueue[rhythmWordIndex];
      const target = currentWordData.parts[rhythmPartIndex];

      if (selectedPart === target) {
          playHarmony(rhythmCombo); 
          setRhythmCombo(prev => prev + 1);
          const nextPartIndex = rhythmPartIndex + 1;
          if (nextPartIndex >= currentWordData.parts.length) {
              setRhythmPartIndex(nextPartIndex);
              setRhythmPhase('WORD_COMPLETE');
              speak(currentWordData.word);
              setTimeout(() => {
                  setRhythmPhase('PLAYING');
                  prepareRhythmRound(rhythmWordIndex + 1, 0);
              }, 2000);
          } else {
              prepareRhythmRound(rhythmWordIndex, nextPartIndex);
          }
      } else {
          handleRhythmFail();
      }
  };

  // --- Renders ---

  const renderHome = () => {
    const hasReviews = reviewQueue.length > 0;
    return (
    <div className="flex flex-col items-center justify-center gap-4 sm:gap-8 p-2 sm:p-6 h-[calc(100dvh-4rem-5rem)]">
      <div className="text-center space-y-1 sm:space-y-2">
         <span className="text-4xl sm:text-6xl animate-bounce inline-block">⭐</span>
         <h1 className="text-3xl sm:text-5xl font-black text-blue-500 tracking-tight drop-shadow-sm lowercase">
           star<br/><span className="text-orange-400">speller</span>
         </h1>
         <p className="text-xs sm:text-base text-gray-400 font-bold lowercase">vocabulary adventure</p>
         {currentUser && (
             <div className={`text-[10px] sm:text-sm font-bold px-2 py-0.5 sm:px-3 sm:py-1 rounded-full inline-block mt-1 sm:mt-2 flex items-center justify-center gap-1 w-max mx-auto ${currentUser.username === 'Eva' ? 'text-orange-500 bg-orange-50' : 'text-blue-300 bg-blue-50'}`}>
                 Hi, {currentUser.username}!
                 {currentUser.username === 'Eva' && <span title="Super Member">👑</span>}
             </div>
         )}
      </div>
      <div className="w-full max-w-[16rem] sm:max-w-sm flex flex-col gap-4">
        {!currentUser ? (
          <div className="w-full bg-gradient-to-b from-blue-400 to-blue-500 rounded-3xl sm:rounded-[2rem] shadow-xl border-b-4 sm:border-b-8 border-blue-700 p-6 sm:p-8 flex flex-col items-center justify-center">
            <form onSubmit={handleLoginSubmit} className="space-y-4 w-full">
              <div>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-transparent focus:border-orange-400 focus:ring-0 outline-none transition-colors font-bold text-gray-800 bg-white/90 focus:bg-white placeholder-gray-400"
                  placeholder="username"
                  autoFocus
                />
              </div>
              <div className="relative">
                <input
                  type={showLoginPassword ? "text" : "password"}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-transparent focus:border-orange-400 focus:ring-0 outline-none transition-colors font-bold text-gray-800 bg-white/90 focus:bg-white placeholder-gray-400"
                  placeholder="password"
                />
                <button 
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                >
                  {showLoginPassword ? "👁️" : "👁️‍🗨️"}
                </button>
              </div>
              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 px-4 rounded-xl font-black text-blue-600 bg-white hover:bg-gray-50 transition-colors lowercase shadow-lg active:translate-y-1 active:shadow-none flex items-center justify-center"
                >
                  <span className="text-xl">➜</span>
                </button>
              </div>
            </form>
          </div>
        ) : hasReviews ? (
           <button onClick={handleStartReview} className="w-full bg-gradient-to-b from-orange-400 to-orange-500 rounded-3xl sm:rounded-[3rem] shadow-xl border-b-4 sm:border-b-8 border-orange-700 active:border-b-0 active:translate-y-1 sm:active:translate-y-2 transition-all flex flex-col items-center justify-center group p-4 sm:p-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-full bg-white opacity-10 animate-pulse"></div>
              <span className="text-3xl sm:text-4xl relative z-10 mb-1 sm:mb-2">📅</span>
              <span className="text-xl sm:text-3xl font-black text-white tracking-wide lowercase relative z-10">Start Review</span>
              <span className="bg-white/30 text-white px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-sm font-bold mt-1 sm:mt-2 relative z-10">{reviewQueue.length} words from yesterday</span>
           </button>
        ) : (
          <button onClick={handleStart} className="w-full h-48 sm:h-auto sm:aspect-square bg-gradient-to-b from-blue-400 to-blue-500 rounded-3xl sm:rounded-[3rem] shadow-xl border-b-4 sm:border-b-8 border-blue-700 active:border-b-0 active:translate-y-1 sm:active:translate-y-2 transition-all flex flex-col items-center justify-center group">
              <div className="w-20 h-20 sm:w-32 sm:h-32 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm group-hover:scale-105 transition duration-300">
                 <svg className="w-10 h-10 sm:w-16 sm:h-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <span className="text-xl sm:text-3xl font-black text-white mt-2 sm:mt-4 tracking-wide lowercase">New Word</span>
          </button>
        )}
      </div>
    </div>
    );
  };

  const renderStatsView = () => {
    if (!currentUser) return null;
    return (
        <StatsPage 
          userId={currentUser.id}
          onBack={() => setStep(GameStep.HOME)}
          onStartRandomRhythm={handleStartRandomRhythm}
        />
    );
  };
  
  const renderAllWords = () => {
    if (!currentUser) return null;
    return (
        <LibraryPage 
          key={dataVersion}
          userId={currentUser.id}
          allDailyStats={allDailyStats}
          viewingMonth={viewingMonth}
          onMonthChange={setViewingMonth}
          onStartChallenge={handleStartChallenge}
          onBack={() => {
              setViewingMonth(new Date());
              setStep(GameStep.HOME);
          }}
          onImport={handleImportWords}
          onExport={handleExportWords}
          onWordClick={(word, date) => processWordInput(word, date)}
          onDeleteWord={(word) => {
              const lowerWord = word.toLowerCase();
              setAllWordsList(prev => prev.filter(w => w.word.toLowerCase() !== lowerWord));
              setReviewQueue(prev => {
                  const newQ = prev.filter(w => w.word.toLowerCase() !== lowerWord);
                  if (newQ.length !== prev.length) {
                      setTodaysWordsCount(newQ.length);
                  }
                  return newQ;
              });
          }}
        />
    );
  };
  
  const renderQuotaExceeded = () => ( <div className="flex flex-col items-center justify-center gap-8 p-6 min-h-[calc(100vh-14rem)] text-center animate-fade-in"><span className="text-8xl relative z-10 block animate-bounce">🔋</span><p>Quota Exceeded</p><button onClick={handleRestart}>Home</button></div> );
  const renderInputWord = () => (
    <div className="flex flex-col items-center justify-center gap-8 p-6 min-h-[calc(100vh-14rem)]">
      <h2 className="text-3xl font-bold text-gray-700 text-center">What word are we learning?</h2>
      <div className="h-20 flex items-center justify-center w-full max-w-md">
        <input
          type="text"
          value={inputTranscript}
          onChange={(e) => setInputTranscript(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && inputTranscript && !isLoading) {
              processWordInput(inputTranscript);
            }
          }}
          placeholder="...type here..."
          className="text-4xl font-black text-center text-blue-500 border-b-4 border-blue-200 px-4 py-2 bg-transparent outline-none w-full placeholder:text-gray-300 placeholder:text-2xl placeholder:font-bold"
          autoFocus
        />
      </div>
      <div className="flex flex-col items-center gap-6">
        <MicrophoneButton isListening={isListening} onStart={handleInputStart} onStop={handleVoiceStop} label="hold to speak" />
        {inputTranscript && !isListening && (
          <GameButton onClick={() => processWordInput(inputTranscript)} color="green" className="animate-pulse">
            Let's Go! &rarr;
          </GameButton>
        )}
        {isLoading && <p className="text-blue-500 font-bold animate-pulse">Creating your lesson...</p>}
      </div>
      <button onClick={handleRestart} className="mt-8 text-gray-400 font-bold">cancel</button>
    </div>
  );
  const renderObserve = () => {
    if (!wordData) return null;
    return (
      <div className="flex flex-col items-center gap-6 pb-20">
        {/* --- HIDDEN FLASHCARD FOR CAPTURE --- */}
        <div
          id="downloadable-flashcard"
          style={{
            position: 'fixed',
            top: '-9999px',
            left: '-9999px',
            width: '320px',
            backgroundColor: 'white',
            borderRadius: '24px',
            border: '4px solid #eff6ff',
            paddingBottom: '20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            fontFamily: "'Fredoka', sans-serif"
          }}
        >
          {/* Image Area */}
          <div style={{ width: '100%', height: '320px', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc', overflow: 'hidden', borderBottom: '4px solid #eff6ff' }}>
            <img src={wordImage} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt={wordData.word} crossOrigin="anonymous" />
          </div>
          {/* Content */}
          <div style={{ padding: '20px', textAlign: 'center', width: '100%' }}>
            {/* Syllables with red vowels */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '2px', flexWrap: 'wrap', marginBottom: '8px' }}>
              {wordData.parts.map((p, i) => (
                <span key={i} style={{ fontSize: '32px', fontWeight: 700, color: '#2563eb' }}>
                  {p.split('').map((c, ci) => <span key={ci} style={{ color: isVowel(c) ? '#ef4444' : 'inherit' }}>{c}</span>)}
                  {i < wordData.parts.length - 1 && <span style={{ color: '#bfdbfe', fontWeight: 400, margin: '0 4px' }}>·</span>}
                </span>
              ))}
            </div>
            {/* Phonetic & Translation */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
              <span style={{ background: '#f1f5f9', color: '#64748b', padding: '2px 10px', borderRadius: '12px', fontFamily: 'monospace', fontWeight: 600 }}>{wordData.phonetic}</span>
              {wordData.partOfSpeech && (
                <span style={{ fontSize: '14px', color: '#60a5fa', fontWeight: 600 }}>{wordData.partOfSpeech}</span>
              )}
              <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 500 }}>{wordData.translation}</span>
            </div>
            {/* Phrases */}
            {wordData.phrases && wordData.phrases.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center', marginBottom: '8px' }}>
                {wordData.phrases.map((ph, idx) => <span key={idx} style={{ fontSize: '11px', background: '#fce7f3', color: '#db2777', padding: '3px 8px', borderRadius: '8px', fontWeight: 700, border: '1px solid #fbcfe8' }}>{ph}</span>)}
              </div>
            )}
            {/* Sentence */}
            <div style={{ background: '#fefce8', border: '2px dashed #fef08a', borderRadius: '12px', padding: '12px', color: '#854d0e', fontStyle: 'italic', fontSize: '15px' }}>
              {wordData.sentence}
            </div>
            {/* Root */}
            <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, marginTop: '8px' }}>
              {wordData.root}
            </div>
          </div>
          <div style={{ width: '100%', background: '#eff6ff', color: '#bfdbfe', textAlign: 'center', fontSize: '10px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', padding: '6px 0' }}>StarSpeller</div>
        </div>

        {/* --- ACTUAL UI --- */}
        <div className="w-full bg-white rounded-3xl shadow-xl overflow-hidden border-b-8 border-gray-100 relative">
          <div className="relative aspect-square w-full bg-gray-100 flex items-center justify-center">
            {wordImage ? (
              <img src={wordImage} alt={wordData.word} className="w-full h-full object-contain" />
            ) : (
              <span className="text-4xl">🖼️</span>
            )}
            <button
              onClick={handleSaveFlashcard}
              className="absolute top-4 left-4 w-10 h-10 bg-white/80 hover:bg-white rounded-full shadow-sm flex items-center justify-center text-gray-500 hover:text-blue-500 transition-all backdrop-blur-sm z-10"
              title="Download Flashcard"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            <button
              onClick={handleRegenerateImage}
              className="absolute top-4 left-16 w-10 h-10 bg-white/80 hover:bg-white rounded-full shadow-sm flex items-center justify-center text-gray-500 hover:text-blue-500 transition-all backdrop-blur-sm z-10"
              title="Regenerate Image"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="animate-spin">↻</span>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
            </button>
            <div className="absolute top-4 right-4 z-10">
              <SpeakerButton onClick={() => speak(wordData.word)} />
            </div>
          </div>

          <div className="p-8 flex flex-col items-center gap-6">
            <div className="flex flex-wrap justify-center gap-2">
              {wordData.parts.map((part, i) => (
                <button
                  key={i}
                  onClick={() => handlePartClick(part, i)}
                  className={`text-4xl font-black px-3 py-1 rounded-xl transition-all flex gap-0.5 ${activePartHighlight === i ? 'bg-blue-500 text-white scale-110' : 'bg-blue-50 text-blue-500 hover:bg-blue-100'}`}
                >
                  {part.split('').map((char, charIdx) => (
                    <span key={charIdx} className={isVowel(char) && activePartHighlight !== i ? 'text-red-500' : 'text-inherit'}>
                      {char}
                    </span>
                  ))}
                </button>
              ))}
            </div>

            <div className="flex flex-col items-center gap-1">
              <div className="flex gap-4 text-sm font-bold text-gray-400 uppercase tracking-wider items-center">
                <span>{wordData.phonetic}</span>
                {wordData.partOfSpeech && (
                  <>
                    <span>•</span>
                    <span className="text-blue-400 lowercase">{wordData.partOfSpeech}</span>
                  </>
                )}
                {wordData.translation && (
                  <span className="text-gray-300 text-xs normal-case font-medium">{wordData.translation}</span>
                )}
              </div>
            </div>

            {wordData.phrases && wordData.phrases.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 w-full">
                {wordData.phrases.map((phrase, i) => (
                  <button
                    key={i}
                    onClick={() => speak(phrase)}
                    className="bg-pink-50 text-pink-500 border border-pink-100 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-pink-100 transition-colors"
                  >
                    {phrase}
                  </button>
                ))}
              </div>
            )}

            <div className="bg-yellow-50 p-4 rounded-xl w-full text-center border border-yellow-100">
              <p className="text-lg text-gray-700 leading-relaxed">
                <SentenceHighlighter sentence={wordData.sentence} wordToHighlight={wordData.word} />
              </p>
              <div className="mt-2 flex justify-center">
                <button onClick={() => speak(wordData.sentence)} className="text-yellow-600 hover:text-yellow-700">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="text-center group cursor-pointer" onClick={() => speak(wordData.root)}>
              <div className="flex items-center justify-center gap-1">
                <span className="text-xs font-black text-blue-300 uppercase tracking-widest">Memory Aid</span>
                <svg className="w-3 h-3 text-blue-300 opacity-0 group-hover:opacity-100 transition-opacity" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" />
                </svg>
              </div>
              <p className="text-gray-600 font-medium mt-1 group-hover:text-blue-500 transition-colors">{wordData.root}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 w-full">
          {!hasPassedShadowing ? (
            <>
              <p className="font-bold text-gray-400 uppercase tracking-widest text-xs">Read Aloud to Continue</p>
              <MicrophoneButton isListening={isListening} onStart={handleShadowingStart} onStop={handleVoiceStop} size="lg" label="hold to speak" />
              <div className="h-8 text-center">
                {shadowingTranscript && <p className="text-blue-500 font-bold">{shadowingTranscript}</p>}
              </div>
              {shadowingAttempts > 2 && (
                <button onClick={skipShadowing} className="text-gray-400 text-sm font-bold underline">skip for now</button>
              )}
            </>
          ) : (
            <div className="w-full animate-fade-in-up">
              <GameButton onClick={startStep2} fullWidth color="green" className="text-xl py-4">Start Practice &rarr;</GameButton>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderListen = () => {
    if (!wordData) return null;
    const isComplete = currentRootIndex >= wordData.parts.length;
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 w-full">
        <div className="text-center space-y-2 mb-4">
          <h2 className="text-2xl font-black text-gray-700">Listen & Spell</h2>
          <p className="text-gray-400 font-medium">
            {isComplete ? "All done! Tap parts to hear spelling." : "Spell each part letters to unlock."}
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3 mb-4 w-full px-2">
          {wordData.parts.map((part, index) => {
            const isDone = index < currentRootIndex;
            const isCurrent = index === currentRootIndex;
            return (
              <button
                key={index}
                disabled={!isDone && !isComplete && !isCurrent}
                onClick={() => {
                  if (isComplete) {
                    speak(part.split('').join(' '));
                  } else {
                    const p = getPartPronunciation(wordData, index);
                    speak(p);
                  }
                }}
                className={`relative flex items-center justify-center px-4 py-3 rounded-2xl border-b-4 transition-all duration-300 ${
                  isDone
                    ? 'bg-green-100 border-green-300 text-green-700 scale-100'
                    : isCurrent
                    ? 'bg-white border-blue-400 text-blue-600 scale-110 shadow-lg ring-4 ring-blue-100'
                    : 'bg-gray-100 border-gray-200 text-gray-300 grayscale'
                }`}
              >
                {isDone ? (
                  <div className="flex items-center gap-1 font-black text-xl">
                    <span>{part}</span>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : isCurrent ? (
                  <div className="flex flex-col items-center">
                    <span className="text-2xl font-black animate-pulse">?</span>
                    <span className="text-[10px] uppercase font-bold tracking-widest">Listen</span>
                  </div>
                ) : (
                  <span className="text-xl font-bold opacity-50">???</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col items-center gap-4 min-h-[160px] justify-center">
          {isComplete ? (
            <div className="flex flex-col items-center gap-4 animate-fade-in-up">
              <p className="text-green-500 font-black text-2xl animate-bounce">Complete!</p>
              <GameButton onClick={() => startStep3()} color="green" className="text-lg shadow-xl">
                Start Games &rarr;
              </GameButton>
            </div>
          ) : (
            <>
              <div
                className="bg-white p-4 rounded-full shadow-md cursor-pointer hover:bg-gray-50 active:scale-95 transition-all"
                onClick={() => {
                  const p = getPartPronunciation(wordData, currentRootIndex);
                  speak(p);
                }}
              >
                <svg className="w-10 h-10 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              </div>
              <MicrophoneButton isListening={isListening} onStart={handleListenStart} onStop={handleVoiceStop} label="hold to spell" />
            </>
          )}
          {step2FailCount > 2 && (
            <div className="animate-fade-in">
              <button onClick={handleStep2Skip} className="bg-gray-200 text-gray-600 px-4 py-2 rounded-lg font-bold hover:bg-gray-300 transition-colors shadow-sm">
                I said it! (Skip)
              </button>
            </div>
          )}
          {step2Error && (
            <div className="bg-red-50 text-red-500 px-4 py-2 rounded-lg font-bold animate-shake text-center">
              {step2Error}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderPractice = () => {
    if (!wordData) return null;
    if (practiceSuccess) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 p-4 animate-fade-in-up">
          <div className="text-center">
            <h2 className="text-4xl font-black text-green-500 mb-2">Awesome!</h2>
            <p className="text-gray-400 font-medium">Click parts to hear pronunciation</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {wordData.parts.map((part, i) => (
              <button
                key={i}
                onClick={() => speak(getPartPronunciation(wordData, i))}
                className="text-4xl font-black text-blue-600 bg-white px-4 py-2 rounded-xl shadow-md border-b-4 border-blue-200 hover:scale-105 active:scale-95 transition-all"
              >
                {part}
              </button>
            ))}
          </div>
          <GameButton onClick={handleNextPracticePhase} color="green" className="text-xl py-4 shadow-xl mt-8">
            Next Challenge &rarr;
          </GameButton>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 p-4">
        <div className="text-center mb-4">
          <h2 className="text-2xl font-black text-gray-700">
            {practicePhase === 'CHOICE' && "Find the Missing Part"}
            {practicePhase === 'FILL' && "Type the Missing Part"}
            {practicePhase === 'ORDER' && "Construct the Word"}
          </h2>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mb-8 min-h-[80px]">
          {practicePhase === 'ORDER' ? (
            <div className="flex items-center gap-1 bg-gray-200/50 p-3 rounded-2xl min-w-[200px] justify-center border-2 border-gray-200 border-dashed">
              {orderedParts.length === 0 && <span className="text-gray-400 font-bold opacity-50">tap blocks below</span>}
              {orderedParts.map((p, i) => (
                <span key={i} className="text-3xl font-black text-white bg-blue-400 px-3 py-1 rounded-lg border-b-4 border-blue-600 shadow-sm animate-fade-in-up">
                  {p}
                </span>
              ))}
            </div>
          ) : (
            wordData.parts.map((part, i) => {
              const isTarget = i === practiceTargetIndex;
              if (isTarget) return <span key={i} className="w-20 h-14 bg-gray-100 rounded-lg border-4 border-dashed border-gray-300 animate-pulse"></span>;
              return <span key={i} className="text-3xl font-black text-gray-400 opacity-50">{part}</span>;
            })
          )}
        </div>

        {practicePhase === 'CHOICE' && (
          <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
            {practiceOptions.map((opt, i) => (
              <GameButton key={i} onClick={() => handleChoiceSubmit(opt)} color="yellow" className="text-xl py-6">
                {opt}
              </GameButton>
            ))}
          </div>
        )}

        {practicePhase === 'FILL' && (
          <div className="flex flex-col gap-4 w-full max-w-xs">
            <input
              type="text"
              value={practiceInput}
              onChange={(e) => setPracticeInput(e.target.value)}
              className="w-full text-center text-3xl font-bold py-4 rounded-2xl border-4 border-blue-200 focus:border-blue-500 outline-none shadow-sm text-gray-700 placeholder-gray-300"
              placeholder="..."
              autoFocus
            />
            <GameButton onClick={handleFillSubmit} color="green" fullWidth>
              Check
            </GameButton>
          </div>
        )}

        {practicePhase === 'ORDER' && (
          <div className="flex flex-wrap justify-center gap-3 w-full max-w-sm">
            {jumbledParts.map((part, i) => {
              const isUsed = usedJumbledIndices.includes(i);
              if (isUsed) return <div key={i} className="w-24 h-12 bg-gray-100 rounded-xl opacity-20 border-2 border-gray-200"></div>;
              return (
                <GameButton key={i} onClick={() => handleOrderClick(part, i)} color="purple" className="animate-fade-in">
                  {part}
                </GameButton>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderTest = () => {
    if (!wordData) return null;
    const isCheckDisabled = testSlots.some(slot => slot === null);
    return (
      <div className="flex flex-col items-center justify-between min-h-[calc(100vh-10rem)] p-2 max-w-md mx-auto">
        <div className="w-full flex flex-col items-center gap-3 mt-2">
          <div className="text-center">
            <h2 className="text-2xl font-black text-gray-700 mb-1">Final Check</h2>
            <p className="text-sm text-gray-400">Assemble the word!</p>
          </div>
          <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-2xl overflow-hidden shadow-lg border-2 border-white">
            {wordImage && <img src={wordImage} alt="clue" className="w-full h-full object-contain" />}
          </div>
          <div className={`flex flex-wrap justify-center gap-1.5 min-h-[70px] w-full p-3 rounded-3xl transition-colors ${isWrongAnimation ? 'bg-red-50 animate-shake' : 'bg-blue-50/50'}`}>
            {testSlots.map((slot, index) => (
              <button
                key={index}
                onClick={() => handleSlotTileClick(slot, index)}
                className={`min-w-[50px] h-14 rounded-xl border-b-4 flex items-center justify-center text-2xl font-black transition-all duration-200 ${
                  slot ? 'bg-white border-blue-200 text-blue-600 shadow-sm active:translate-y-1 active:border-b-0 hover:-translate-y-1' : 'bg-gray-200/50 border-gray-300/50 border-dashed border-2 shadow-inner text-transparent'
                }`}
              >
                {slot ? slot.val : '_'}
              </button>
            ))}
          </div>
        </div>

        <div className="w-full flex flex-col gap-4 mb-2 mt-2">
          <div className="flex flex-wrap justify-center gap-2 min-h-[80px]">
            {testBank.map((tile) => (
              <button
                key={tile.id}
                onClick={() => handleBankTileClick(tile)}
                className="bg-white text-gray-700 font-bold text-xl px-4 py-2 rounded-2xl shadow-[0_4px_0_#e5e7eb] border-2 border-gray-100 active:shadow-none active:translate-y-[4px] transition-all hover:-translate-y-1 hover:border-blue-200"
              >
                {tile.val}
              </button>
            ))}
          </div>
          <GameButton onClick={handleTestSubmit} color={isCheckDisabled ? 'white' : 'green'} disabled={isCheckDisabled} fullWidth className="text-xl py-3 shadow-lg transition-all">
            {isCheckDisabled ? 'Fill all slots...' : 'Check Answer ✨'}
          </GameButton>
        </div>
      </div>
    );
  };

  const renderRhythmIntro = () => {
      const targetDate = challengeDate || new Date().toDateString();
      const isToday = targetDate === new Date().toDateString();
      const wordCount = rhythmQueue.length;
      
      return (
         <div className="flex flex-col items-center justify-center min-h-[calc(100vh-14rem)] gap-8 p-6 animate-fade-in text-center">
             <div className="space-y-4">
                 <div className="text-8xl animate-bounce">🥁</div>
                 <h1 className="text-4xl font-black text-purple-600">{isDailyChallenge ? "Daily Challenge" : "Random Mix"}</h1>
                 <p className="text-gray-500 font-bold">
                     {isDailyChallenge ? (
                         wordCount > 0 
                             ? `You learned ${wordCount} words ${isToday ? 'today' : 'on this day'}.` 
                             : "Let's practice the word you just learned!"
                     ) : (
                         `Reviewing ${wordCount} random words from your library.`
                     )}
                 </p>
             </div>
             <div className="space-y-4">
                 <div className="bg-white p-6 rounded-2xl shadow-lg border-2 border-purple-100 w-full max-w-xs mx-auto">
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Base Tempo</p>
                    <p className="text-3xl font-black text-purple-600">{currentBPMRef.current} BPM</p>
                    <p className="text-xs text-gray-400 font-bold mt-1">Speeds up as you go!</p>
                 </div>
                 <GameButton onClick={startStep5Daily} color="purple" fullWidth className="text-xl py-4 shadow-xl">Start Mix 🎵</GameButton>
             </div>
         </div>
      );
  };
  const renderRhythmGame = () => {
      if (rhythmQueue.length === 0) return null;
      const currentWord = rhythmQueue[rhythmWordIndex];
      const isWordComplete = rhythmPhase === 'WORD_COMPLETE';
      if (rhythmPhase === 'WAITING') {
          return (
              <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 p-6 bg-slate-900 rounded-[3rem] shadow-2xl border-4 border-slate-800 animate-fade-in text-white relative overflow-hidden">
                  <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                  <div className="z-10 text-center space-y-4">
                      <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-violet-500 animate-pulse">{isDailyChallenge ? "DAILY MIX" : "RHYTHM MIX"}</h2>
                      <p className="text-slate-300 text-xl font-medium max-w-xs mx-auto">Listen & Tap on beat!<br/><span className="text-sm opacity-70">Starts at {currentBPMRef.current} BPM</span></p>
                  </div>
                  <button onClick={startRhythmGamePlay} className="z-10 group relative px-8 py-6 bg-violet-600 rounded-full font-black text-2xl shadow-[0_0_40px_-10px_rgba(139,92,246,0.5)] hover:scale-105 transition-all active:scale-95"><span className="relative z-10 flex items-center gap-2"><span>🎵</span> START <span>🎵</span></span><div className="absolute inset-0 rounded-full bg-violet-400 blur-xl opacity-50 group-hover:opacity-100 transition-opacity animate-pulse"></div></button>
              </div>
          );
      }
      return (
          <div className="flex flex-col items-center min-h-[70vh] w-full max-w-md mx-auto relative bg-slate-900 rounded-[2rem] overflow-hidden border-4 border-slate-800 shadow-2xl">
              <div className="absolute top-0 w-full h-32 bg-gradient-to-b from-violet-900/50 to-transparent pointer-events-none"></div>
              <div className="w-full flex justify-between items-center p-4 z-10 text-white">
                  <div className="font-black text-slate-500 uppercase tracking-widest text-sm">Word {rhythmWordIndex + 1}/{rhythmQueue.length}</div>
                  <div className={`font-black text-2xl ${rhythmCombo > 1 ? 'text-yellow-400 animate-bounce' : 'text-slate-600'}`}>{rhythmCombo > 0 ? `${rhythmCombo} COMBO` : 'GROOVE'}</div>
              </div>
              <div className={`flex-1 w-full flex flex-col justify-center items-center gap-8 p-4 z-10 ${rhythmShake ? 'animate-shake' : ''}`}>
                  <div className="text-center w-full">
                       {isWordComplete && <p className="text-green-400 font-bold mb-2 animate-bounce">Perfect!</p>}
                       <div className={`text-4xl font-black tracking-widest uppercase break-words px-4 flex flex-wrap justify-center gap-1 ${isWordComplete ? 'scale-110 transition-transform duration-500' : ''}`}>{currentWord.parts.map((part, index) => { let colorClass = "text-slate-600"; if (isWordComplete) colorClass = "text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.5)]"; else if (index < rhythmPartIndex) colorClass = "text-green-500"; else if (index === rhythmPartIndex) colorClass = "text-white scale-110"; return (<span key={index} className={`transition-all duration-300 ${colorClass}`}>{part}</span>); })}</div>
                  </div>
                  <div className={`w-24 h-24 rounded-full bg-slate-800 border-4 border-violet-500 flex items-center justify-center shadow-[0_0_30px_rgba(139,92,246,0.4)] transition-all ${isWordComplete ? 'scale-125 bg-green-900 border-green-500' : 'animate-pulse'}`}><span className="text-4xl">{isWordComplete ? '✅' : '🔊'}</span></div>
                  <div className="w-full flex-1 min-h-[16rem] relative flex flex-col justify-end">
                    {isWordComplete ? (
                        <div className="absolute inset-0 flex items-center justify-center animate-fade-in-up z-20">
                            <div className="bg-slate-900/90 backdrop-blur-xl px-10 py-8 rounded-3xl border-2 border-slate-600/50 text-center shadow-[0_0_50px_rgba(0,0,0,0.6)] transform scale-105">
                                {rhythmWordIndex + 1 < rhythmQueue.length ? (<><p className="text-violet-400 font-bold uppercase text-xs tracking-widest mb-3">Up Next</p><div className="text-5xl font-black text-white mb-6 tracking-tight drop-shadow-lg">{rhythmQueue[rhythmWordIndex + 1].word}</div><div className="flex items-center justify-center gap-2"><div className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '0ms' }}></div><div className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '150ms' }}></div><div className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '300ms' }}></div></div></>) : (<div className="text-3xl font-black text-green-400 animate-bounce">Set Finished!</div>)}
                            </div>
                        </div>
                    ) : (<div className="grid grid-cols-2 gap-4 w-full">{rhythmFallingOptions.map((opt, i) => (<button key={i + opt} onClick={() => handleRhythmHit(opt)} className="relative w-full py-4 rounded-xl font-black text-2xl bg-slate-800 text-white border-b-4 border-slate-950 hover:bg-slate-700 hover:border-violet-500 hover:text-violet-300 active:border-b-0 active:translate-y-2 transition-all duration-100 shadow-xl overflow-hidden animate-fade-in-up" style={{ animationDelay: `${i * 100}ms` }}>{opt}<div className="absolute top-0 left-0 w-full h-1/2 bg-white/5"></div></button>))}</div>)}
                  </div>
              </div>
              <div className="w-full h-4 bg-gradient-to-r from-pink-500 via-violet-500 to-cyan-500 animate-pulse"></div>
          </div>
      );
  };
  const renderSuccess = () => {
    const isRhythm = rhythmQueue.length > 0;
    
    if (isRhythm) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-14rem)] gap-8 p-6 text-center animate-fade-in-up">
            <h1 className="text-6xl animate-bounce">🏆</h1>
            <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-violet-500">
              Challenge Level Up!
            </h2>
            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border-4 border-violet-100 w-full max-w-sm space-y-4">
                <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Rhythm Mastery</p>
                <div className="text-6xl font-black text-violet-600">{currentBPMRef.current} <span className="text-2xl">BPM</span></div>
                <div className="h-1 w-12 bg-violet-200 mx-auto rounded-full"></div>
                <p className="text-slate-500 font-bold">
                  You're getting faster! Ready for the next speed?
                </p>
            </div>
            <div className="flex flex-col gap-4 w-full max-w-xs">
                <GameButton 
                  onClick={() => startRhythmCommon()} 
                  color="purple" 
                  fullWidth
                  className="text-xl py-4"
                >
                  Next Level 🚀
                </GameButton>
                
                <button 
                  onClick={handleRestart}
                  className="text-slate-400 font-bold hover:text-slate-600 transition-colors underline decoration-2 underline-offset-4"
                >
                  Back to Home
                </button>
            </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-14rem)] gap-8 p-6 text-center animate-fade-in-up">
          <h1 className="text-6xl animate-bounce">🎉</h1>
          <h2 className="text-4xl font-black text-green-500">Amazing Job!</h2>
          <div className="bg-white p-6 rounded-2xl shadow-lg border-2 border-green-100 w-full max-w-sm">
              <h3 className="text-3xl font-black text-blue-600 mb-1">{wordData?.word}</h3>
              <div className="flex justify-center items-center gap-2 mb-2">
                  {wordData?.partOfSpeech && (
                      <span className="text-blue-400 text-xs font-bold lowercase">{wordData.partOfSpeech}</span>
                  )}
                  {wordData?.translation && (
                      <span className="text-gray-400 text-xs font-medium">{wordData.translation}</span>
                  )}
              </div>
          </div>
          <p className="text-gray-400 font-bold">You mastered it!</p>
          <div className="flex flex-col gap-4 w-full max-w-xs">
              <GameButton onClick={handleRestart} color="blue" fullWidth>Learn New Word</GameButton>
              <GameButton 
                  onClick={() => handleStartChallenge(rhythmQueue, isDailyChallenge ? currentBPMRef.current : 80, practiceDate || new Date().toDateString())} 
                  color="purple" 
                  fullWidth
              >
                  Daily Challenge (Start at {isDailyChallenge ? currentBPMRef.current : 80} BPM)
              </GameButton>
          </div>
      </div>
    );
  };
  const renderFail = () => {
    const isRhythm = isDailyChallenge || rhythmQueue.length > 0;
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-14rem)] gap-8 p-6 text-center animate-shake">
        <h1 className="text-6xl">😵</h1>
        <h2 className="text-4xl font-black text-red-500">Oops!</h2>
        <p className="text-gray-400 font-bold">Keep practicing, you can do it!</p>
        <GameButton 
          onClick={() => isRhythm ? startRhythmCommon() : handleRestart()} 
          color="blue"
        >
          Try Again
        </GameButton>
        {isRhythm && (
          <button onClick={handleRestart} className="mt-4 text-gray-400 font-bold underline">
            Quit to Home
          </button>
        )}
      </div>
    );
  };
  const isDarkMode = step === GameStep.STEP_5_RHYTHM;

  return (
    <div className={`min-h-screen font-sans selection:bg-blue-200 pb-28 transition-colors duration-500 ${isDarkMode ? 'bg-slate-950' : 'bg-[#F0F4F8]'}`}>
      {alertMessage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-fade-in-up text-center">
            <p className="text-gray-800 font-bold mb-6 text-lg">{alertMessage}</p>
            <button 
              onClick={() => setAlertMessage(null)}
              className="bg-blue-500 text-white font-bold py-3 px-6 rounded-xl hover:bg-blue-600 transition-colors w-full"
            >
              OK
            </button>
          </div>
        </div>
      )}
      {isManagingUsers && currentUser?.username === 'Eva' && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-md rounded-3xl p-6 shadow-2xl ${isDarkMode ? 'bg-slate-800 text-white' : 'bg-white text-gray-800'}`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black">Manage Users</h2>
              <div className="flex gap-2 items-center">
                <button 
                  onClick={() => {
                    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(allUsers, null, 2));
                    const downloadAnchorNode = document.createElement('a');
                    downloadAnchorNode.setAttribute("href", dataStr);
                    downloadAnchorNode.setAttribute("download", "users_credentials.json");
                    document.body.appendChild(downloadAnchorNode);
                    downloadAnchorNode.click();
                    downloadAnchorNode.remove();
                  }}
                  className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl text-xs transition-colors"
                >
                  📥 Export Users
                </button>
                <button onClick={() => setIsManagingUsers(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
              </div>
            </div>
            <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-2">
              {allUsers.map(u => (
                <div key={u.id} className={`p-4 rounded-2xl border-2 flex flex-col gap-3 ${isDarkMode ? 'border-slate-700 bg-slate-900/50' : 'border-gray-100 bg-gray-50'}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col">
                      <span className="font-bold text-lg">{u.username} {u.username === 'Eva' && '👑'}</span>
                      <span className={`text-[10px] font-mono opacity-50 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>ID: {u.id}</span>
                      <span className={`text-[10px] font-mono opacity-50 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Current Password: {u.password || (u.username.toLowerCase() === 'eva' ? '123' : '(none)')}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="New Password"
                      value={manageUserPasswords[u.id] || ''}
                      onChange={(e) => setManageUserPasswords(prev => ({...prev, [u.id]: e.target.value}))}
                      className={`flex-1 px-3 py-2 rounded-xl text-sm border outline-none ${isDarkMode ? 'bg-slate-800 border-slate-600 focus:border-blue-500' : 'bg-white border-gray-200 focus:border-blue-400'}`}
                    />
                    <button 
                      onClick={async () => {
                        const newPass = manageUserPasswords[u.id]?.trim();
                        if (!newPass) {
                          alert("Please enter a new password");
                          return;
                        }
                        try {
                          await updateUserPassword(u.id, newPass);
                          alert(`Password for ${u.username} updated successfully!`);
                          setManageUserPasswords(prev => ({...prev, [u.id]: ''}));
                          // Refresh users list
                          const users = await getAllUsers();
                          setAllUsers(users);
                        } catch (e) {
                          alert("Failed to update password");
                        }
                      }}
                      className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl text-sm transition-colors"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <button 
                onClick={() => setIsManagingUsers(false)}
                className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-2xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <TopBar 
        stats={stats} 
        totalStars={totalStars}
        totalBadges={totalBadges}
        darkMode={isDarkMode} 
        currentUser={currentUser}
        allUsers={allUsers}
        onSwitchUser={handleSwitchUser}
        onCreateUser={handleCreateUser}
        onManageUsers={() => setIsManagingUsers(true)}
        onExportAccount={handleExportAccount}
        onImportAccount={handleImportAccount}
      />
      <main className={`container mx-auto max-w-3xl px-4 ${step === GameStep.HOME ? 'pt-16 md:pt-20' : 'pt-24 md:pt-28'}`}>
        {step === GameStep.HOME && renderHome()}
        {step === GameStep.INPUT_WORD && renderInputWord()}
        {step === GameStep.STEP_1_OBSERVE && renderObserve()}
        {step === GameStep.STEP_2_LISTEN && renderListen()}
        {step === GameStep.STEP_3_PRACTICE && renderPractice()}
        {step === GameStep.STEP_4_TEST && renderTest()}
        {step === GameStep.SUCCESS && renderSuccess()}
        {step === GameStep.FAIL && renderFail()}
        {step === GameStep.STATS && renderStatsView()}
        {step === GameStep.ALL_WORDS && renderAllWords()}
        {step === GameStep.QUOTA_EXCEEDED && renderQuotaExceeded()}
        {step === GameStep.RHYTHM_INTRO && renderRhythmIntro()}
        {step === GameStep.STEP_5_RHYTHM && renderRhythmGame()}
      </main>
      
      {importPending && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-4 text-gray-800">
                {importPending.type === 'account' ? 'Confirm Account Import' : 'Confirm Words Import'}
            </h3>
            
            {(() => {
              let username = 'Unknown';
              let dateStr = 'Unknown';
              let isAccountExport = false;
              let isWordsExport = false;
              try {
                let rawData = importPending.data.replace(/^\uFEFF/, '').trim();
                let data;
                if (rawData.startsWith('{')) {
                    const sanitized = sanitizeJsonString(rawData);
                    data = JSON.parse(sanitized);
                } else {
                    const decrypted = decrypt(rawData);
                    const sanitized = sanitizeJsonString(decrypted);
                    data = JSON.parse(sanitized);
                }
                username = data?.username || data?.users?.[0]?.username || data?.exportUsername || (data?.words ? 'Words Backup' : 'Unknown');
                isAccountExport = data?.exportType === 'account';
                isWordsExport = data?.exportType === 'words' || !data?.exportType;
                if (data?.exportDate) {
                  dateStr = new Date(data.exportDate).toLocaleDateString();
                } else {
                  // Fallback to filename regex or file last modified date
                  dateStr = importPending.file.name.match(/\d{4}-\d{2}-\d{2}/)?.[0] || 
                            new Date(importPending.file.lastModified).toLocaleDateString();
                }
              } catch (e) {
                console.error("Parse failed in modal:", e);
                dateStr = importPending.file.name.match(/\d{4}-\d{2}-\d{2}/)?.[0] || 
                          new Date(importPending.file.lastModified).toLocaleDateString();
              }
              
              return (
                <div className="space-y-2 mb-6">
                  <div className="flex justify-between items-center border-b pb-2">
                    <span className="text-gray-500">Account</span>
                    <span className="font-bold text-blue-600 text-lg">{username}</span>
                  </div>
                  <div className="flex justify-between items-center border-b pb-2">
                    <span className="text-gray-500">Date</span>
                    <span className="font-bold text-gray-800">{dateStr}</span>
                  </div>
                  <div className="flex justify-between items-center border-b pb-2">
                    <span className="text-gray-500">Contents</span>
                    <span className="font-bold text-gray-800">
                        {isAccountExport ? 'Account & Stats' : 'Words'}
                    </span>
                  </div>
                  <div className="mt-4 p-3 bg-yellow-50 text-yellow-800 rounded-lg text-sm">
                    ⚠️ Warning: This will overwrite your current {importPending.type === 'account' ? 'account stats' : 'words'}. This action cannot be undone.
                  </div>
                </div>
              );
            })()}

            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setImportPending(null)}
                className="px-4 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  try {
                    const count = await importDatabaseFromJson(currentUser!.id, currentUser!.username, importPending.data, true, importPending.type || 'words');
                    setImportPending(null);
                    alert(`Successfully imported ${importPending.type === 'account' ? 'account data' : count + ' words'}!`);
                    // Reload current user data
                    const users = await getAllUsers();
                    setAllUsers(users);
                    loadUserData(currentUser!.id);
                    setDataVersion(prev => prev + 1);
                  } catch (err: any) {
                    console.error("Import failed", err);
                    alert(err?.message || err || "Failed to import data.");
                  }
                }}
                className="px-4 py-2 bg-blue-500 text-white font-bold rounded-lg hover:bg-blue-600 transition-colors shadow-md"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}

      {showNoWordsModal && (
        <NoWordsModal 
          onClose={() => setShowNoWordsModal(false)}
          onInputWord={() => {
            setShowNoWordsModal(false);
            setStep(GameStep.INPUT_WORD);
          }}
          onRandomChallenge={async () => {
            setShowNoWordsModal(false);
            handleStartRandomRhythm();
          }}
        />
      )}

      {validationError && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-6 z-[60] animate-fade-in">
          <div className="bg-white border-4 border-blue-200 rounded-[2rem] p-8 max-w-sm w-full shadow-2xl text-center space-y-6 animate-scale-in">
            <div className="text-6xl mb-4">🤔</div>
            <h3 className="text-2xl font-bold text-gray-800">Oops!</h3>
            <p className="text-lg text-gray-600 font-medium">
              {validationError}
            </p>
            <GameButton 
              onClick={() => {
                setValidationError(null);
                setInputTranscript("");
              }} 
              color="blue" 
              className="w-full"
            >
              Try Again
            </GameButton>
          </div>
        </div>
      )}

      <BottomNav currentStep={step} onNavigate={handleNavigation} />
    </div>
  );
}