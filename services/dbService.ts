import { WordData, DBWordRecord, User, DailyStats } from "../types";
import { INITIAL_WORDS } from "./initialWords";

const DB_NAME = 'StarSpellerDB';
const DB_VERSION = 3; // Upgraded version for Daily Stats support
const WORD_STORE = 'words';
const USER_STORE = 'users';
const DAILY_STATS_STORE = 'daily_stats';

// Default User Configuration
const DEFAULT_USER: User = {
  id: 'user_eva_default',
  username: 'Eva',
  apiKey: process.env.API_KEY || '', // Inherit env key
  isDefault: true,
  hasSeeded: false
};

// Helper to open DB
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Create User Store if not exists
      if (!db.objectStoreNames.contains(USER_STORE)) {
        db.createObjectStore(USER_STORE, { keyPath: 'id' });
      }

      // Handle Word Store Migration or Creation
      if (db.objectStoreNames.contains('words')) {
        // We need to migrate old data which didn't have userId
        // Note: In a real prod environment, we'd read old data and copy it. 
        // For this demo, we assume we can recreate the store to enforce the new compound key.
        // db.deleteObjectStore('words'); // Only if needed, but version 2 already did this.
      }
      
      if (!db.objectStoreNames.contains(WORD_STORE)) {
          const wordStore = db.createObjectStore(WORD_STORE, { keyPath: ['userId', 'word'] });
          wordStore.createIndex('userId', 'userId', { unique: false });
          wordStore.createIndex('dateAdded', 'dateAdded', { unique: false });
      }

      // Create Daily Stats Store
      if (!db.objectStoreNames.contains(DAILY_STATS_STORE)) {
          const statsStore = db.createObjectStore(DAILY_STATS_STORE, { keyPath: ['userId', 'date'] });
          statsStore.createIndex('userId', 'userId', { unique: false });
      }
    };
  });
};

// --- USER MANAGEMENT ---

export const initializeUsers = async (): Promise<User> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(USER_STORE, 'readwrite');
    const store = transaction.objectStore(USER_STORE);
    
    // Check if any user exists
    const countReq = store.count();
    
    countReq.onsuccess = () => {
      if (countReq.result === 0) {
        // Create default Eva user
        store.put(DEFAULT_USER);
        resolve(DEFAULT_USER);
      } else {
        // Get the default user or the first one found
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest).result;
          if (cursor) {
            resolve(cursor.value);
          } else {
            // Fallback
            resolve(DEFAULT_USER);
          }
        };
      }
    };
    countReq.onerror = () => reject(countReq.error);
  });
};

export const getAllUsers = async (): Promise<User[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(USER_STORE, 'readonly');
    const store = transaction.objectStore(USER_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

export const createNewUser = async (username: string): Promise<User> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(USER_STORE, 'readwrite');
    const store = transaction.objectStore(USER_STORE);
    
    const newUser: User = {
      id: `user_${Date.now()}`,
      username: username,
      apiKey: process.env.API_KEY || '', // Share the system key
      isDefault: false,
      hasSeeded: false
    };

    store.put(newUser);
    
    transaction.oncomplete = () => resolve(newUser);
    transaction.onerror = () => reject(transaction.error);
  });
};

// --- WORD MANAGEMENT ---

// Words specifically for Eva
const EVA_SPECIFIC_WORDS: WordData[] = [
  {
    word: "twigs",
    parts: ["twigs"],
    partsPronunciation: ["twigs"],
    root: "Old English 'twigge'",
    phonetic: "/twɪɡz/",
    translation: "细枝",
    sentence: "The bird used twigs to build its nest.",
    imageUrl: "", // Empty to trigger AI generation
    relatedWords: ["branch", "stick", "tree"],
    phrases: ["dry twigs", "small twigs", "gather twigs"]
  },
  {
    word: "forest",
    parts: ["for", "est"],
    partsPronunciation: ["for", "est"],
    root: "Latin 'foris' (outside)",
    phonetic: "/ˈfɔːr.ɪst/",
    translation: "森林",
    sentence: "Bears live in the deep forest.",
    imageUrl: "",
    relatedWords: ["woods", "jungle", "trees"],
    phrases: ["rain forest", "forest fire", "deep forest"]
  },
  {
    word: "coral",
    parts: ["cor", "al"],
    partsPronunciation: ["core", "ul"],
    root: "Greek 'korallion'",
    phonetic: "/ˈkɔːr.əl/",
    translation: "珊瑚",
    sentence: "Fish swim around the colorful coral.",
    imageUrl: "",
    relatedWords: ["reef", "sea", "ocean"],
    phrases: ["coral reef", "pink coral", "coral sea"]
  },
  {
    word: "blossoms",
    parts: ["blos", "soms"],
    partsPronunciation: ["blos", "sumz"],
    root: "Old English 'blostma'",
    phonetic: "/ˈblɑː.səmz/",
    translation: "花朵",
    sentence: "The cherry blossoms look beautiful in spring.",
    imageUrl: "",
    relatedWords: ["flowers", "bloom", "spring"],
    phrases: ["cherry blossoms", "apple blossoms", "in blossom"]
  },
  {
    word: "swampy",
    parts: ["swamp", "y"],
    partsPronunciation: ["swomp", "ee"],
    root: "swamp + y",
    phonetic: "/ˈswɑːm.pi/",
    translation: "沼泽的",
    sentence: "The ground was wet and swampy.",
    imageUrl: "",
    relatedWords: ["wet", "muddy", "marsh"],
    phrases: ["swampy land", "swampy area", "hot and swampy"]
  }
];

export const initializeDatabase = async (userId: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([WORD_STORE, USER_STORE], 'readwrite');
    const wordStore = transaction.objectStore(WORD_STORE);
    const userStore = transaction.objectStore(USER_STORE);
    
    const userReq = userStore.get(userId);

    userReq.onsuccess = () => {
        const user = userReq.result as User;
        if (!user) {
            resolve();
            return;
        }

        // If already seeded, do nothing (even if word count is 0)
        if (user.hasSeeded) {
            resolve();
            return;
        }

        const index = wordStore.index('userId');
        const countReq = index.count(userId);

        countReq.onsuccess = () => {
            if (countReq.result > 0) {
                // User already has words (maybe from import or manual add), mark as seeded so we don't overwrite
                user.hasSeeded = true;
                userStore.put(user);
                resolve();
            } else {
                // Seed initial words
                console.log(`Seeding initial words for user: ${userId}`);
                
                let wordsToSeed = [...INITIAL_WORDS];
                
                // Add Eva-specific words if the user is Eva
                if (userId === 'user_eva_default' || userId.includes('eva')) {
                    wordsToSeed = [...wordsToSeed, ...EVA_SPECIFIC_WORDS];
                }

                wordsToSeed.forEach(w => {
                   const record: DBWordRecord = {
                     userId: userId,
                     word: w.word.toLowerCase(),
                     data: w,
                     dateAdded: new Date().toDateString(),
                     lastReviewed: new Date().toDateString(),
                     bestTime: undefined
                   };
                   wordStore.put(record);
                });

                // Mark as seeded
                user.hasSeeded = true;
                userStore.put(user);
                resolve();
            }
        };
        countReq.onerror = () => reject(countReq.error);
    };
    userReq.onerror = () => reject(userReq.error);
  });
};

export const saveWordToDB = async (userId: string, wordData: WordData): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(WORD_STORE, 'readwrite');
    const store = transaction.objectStore(WORD_STORE);

    // Get specific user's record
    const getRequest = store.get([userId, wordData.word.toLowerCase()]);

    getRequest.onsuccess = () => {
        const existing = getRequest.result as DBWordRecord | undefined;
        
        const record: DBWordRecord = {
          userId: userId,
          word: wordData.word.toLowerCase(),
          data: wordData,
          dateAdded: existing?.dateAdded || new Date().toDateString(),
          lastReviewed: new Date().toDateString(),
          bestTime: existing?.bestTime
        };

        const putRequest = store.put(record);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
    };
    
    getRequest.onerror = () => reject(getRequest.error);
  });
};

export const deleteWordFromDB = async (userId: string, word: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(WORD_STORE, 'readwrite');
    const store = transaction.objectStore(WORD_STORE);
    // Compound key: [userId, word]
    const request = store.delete([userId, word.toLowerCase()]);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const markWordAsReviewed = async (userId: string, word: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(WORD_STORE, 'readwrite');
    const store = transaction.objectStore(WORD_STORE);
    
    const getRequest = store.get([userId, word.toLowerCase()]);

    getRequest.onsuccess = () => {
      const record = getRequest.result as DBWordRecord;
      if (record) {
        record.lastReviewed = new Date().toDateString();
        store.put(record);
        resolve();
      } else {
        resolve(); 
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
};

// --- DATA RETRIEVAL (User Scoped) ---

export const getWordsForReview = async (userId: string): Promise<DBWordRecord[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(WORD_STORE, 'readonly');
    const store = transaction.objectStore(WORD_STORE);
    const index = store.index('userId');
    const request = index.getAll(userId);

    request.onsuccess = () => {
      const allRecords = request.result as DBWordRecord[];
      const today = new Date().toDateString();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toDateString();

      const reviewList = allRecords.filter(record => {
        const addedYesterday = record.dateAdded === yesterdayStr;
        const notReviewedToday = record.lastReviewed !== today;
        return addedYesterday && notReviewedToday;
      });

      resolve(reviewList);
    };
    request.onerror = () => reject(request.error);
  });
};

export const getTodaysWords = async (userId: string): Promise<DBWordRecord[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(WORD_STORE, 'readonly');
    const store = transaction.objectStore(WORD_STORE);
    const index = store.index('userId');
    const request = index.getAll(userId);

    request.onsuccess = () => {
      const allRecords = request.result as DBWordRecord[];
      const today = new Date().toDateString();
      const todaysWords = allRecords.filter(r => r.lastReviewed === today);
      resolve(todaysWords);
    };
    request.onerror = () => reject(request.error);
  });
};

export const getAllWords = async (userId: string): Promise<DBWordRecord[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
      const transaction = db.transaction(WORD_STORE, 'readonly');
      const store = transaction.objectStore(WORD_STORE);
      const index = store.index('userId');
      const request = index.getAll(userId);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
  });
};

// --- DAILY STATS MANAGEMENT ---

export const saveDailyStats = async (stats: DailyStats): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DAILY_STATS_STORE, 'readwrite');
    const store = transaction.objectStore(DAILY_STATS_STORE);
    const request = store.put(stats);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getDailyStats = async (userId: string, date: string): Promise<DailyStats | undefined> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DAILY_STATS_STORE, 'readonly');
    const store = transaction.objectStore(DAILY_STATS_STORE);
    const request = store.get([userId, date]);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const getAllDailyStats = async (userId: string): Promise<DailyStats[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DAILY_STATS_STORE, 'readonly');
    const store = transaction.objectStore(DAILY_STATS_STORE);
    const index = store.index('userId');
    const request = index.getAll(userId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// --- IMPORT / EXPORT SYSTEM ---

export const exportDatabaseToJson = async (): Promise<string> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        // We export everything (users, words, stats) to allow full restoration
        const tx = db.transaction([USER_STORE, WORD_STORE, DAILY_STATS_STORE], 'readonly');
        const userReq = tx.objectStore(USER_STORE).getAll();
        const wordReq = tx.objectStore(WORD_STORE).getAll();
        const statsReq = tx.objectStore(DAILY_STATS_STORE).getAll();
        
        const data: any = {};

        userReq.onsuccess = () => {
             data.users = userReq.result;
             checkDone();
        };
        wordReq.onsuccess = () => {
             data.words = wordReq.result;
             checkDone();
        };
        statsReq.onsuccess = () => {
             data.stats = statsReq.result;
             checkDone();
        };

        const checkDone = () => {
            if (data.users && data.words && data.stats) {
                resolve(JSON.stringify(data, null, 2));
            }
        };

        tx.onerror = () => reject(tx.error);
    });
};

export const importDatabaseFromJson = async (jsonString: string): Promise<number> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        let data: { users: User[], words: DBWordRecord[], stats?: DailyStats[] } | null = null;
        try {
            data = JSON.parse(jsonString);
            if (!data || !data.users || !data.words) throw new Error("Invalid file structure");
        } catch (e) {
            reject("Invalid JSON file");
            return;
        }

        const stores = [USER_STORE, WORD_STORE];
        if (db.objectStoreNames.contains(DAILY_STATS_STORE)) {
            stores.push(DAILY_STATS_STORE);
        }

        const tx = db.transaction(stores, 'readwrite');
        const userStore = tx.objectStore(USER_STORE);
        const wordStore = tx.objectStore(WORD_STORE);
        
        let count = 0;

        // Import Users (Merge/Overwrite)
        data.users.forEach(u => userStore.put(u));

        // Import Words (Merge/Overwrite)
        data.words.forEach(w => {
            wordStore.put(w);
            count++;
        });

        // Import Stats (Merge/Overwrite)
        if (data.stats && stores.includes(DAILY_STATS_STORE)) {
            const statsStore = tx.objectStore(DAILY_STATS_STORE);
            data.stats.forEach(s => statsStore.put(s));
        }

        tx.oncomplete = () => resolve(count);
        tx.onerror = () => reject(tx.error);
    });
};