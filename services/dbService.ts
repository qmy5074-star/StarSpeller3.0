import { WordData, DBWordRecord, User, DailyStats } from "../types";
import { INITIAL_WORDS } from "./initialWords";
import { encrypt, decrypt, sanitizeJsonString } from "../src/utils/encryption";

const DB_NAME = 'StarSpellerDB';
const DB_VERSION = 3; // Upgraded version for Daily Stats support
const WORD_STORE = 'words';
const USER_STORE = 'users';
const DAILY_STATS_STORE = 'daily_stats';

// Default User Configuration
const DEFAULT_USER: User = {
  id: 'user_eva_default',
  username: 'Eva',
  password: '123', // Default password for Eva
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

// --- MIGRATION ---

export const migrateWordDataSchema = async (): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(WORD_STORE, 'readwrite');
        const store = transaction.objectStore(WORD_STORE);
        const request = store.openCursor();

        request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest).result;
            if (cursor) {
                const record = cursor.value as DBWordRecord;
                const data = record.data as any;
                let changed = false;

                if (data) {
                    // Case 1: Old schema where translation was English and chineseTranslation was Chinese
                    // We want: translation = Chinese
                    if (data.chineseTranslation) {
                        const oldChinese = data.chineseTranslation; // Chinese
                        
                        data.translation = oldChinese;
                        delete data.chineseTranslation;
                        changed = true;
                    } 
                    // Case 2: translation is likely English (contains ASCII only)
                    else if (data.translation) {
                        const isLikelyEnglish = /^[a-zA-Z0-9\s.,!?'"()-]+$/.test(data.translation);
                        if (isLikelyEnglish) {
                            data.translation = ""; // Mark as missing Chinese so it can be fixed later or ignored
                            changed = true;
                        }
                    }
                }

                if (changed) {
                    cursor.update(record);
                }
                cursor.continue();
            } else {
                resolve();
            }
        };
        request.onerror = () => reject(request.error);
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

export const createNewUser = async (username: string, password?: string): Promise<User> => {
  const users = await getAllUsers();
  if (users.some(u => u.username?.toLowerCase() === username?.toLowerCase())) {
    throw new Error("Username already exists");
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(USER_STORE, 'readwrite');
    const store = transaction.objectStore(USER_STORE);
    
    const newUser: User = {
      id: `user_${Date.now()}`,
      username: username,
      password: password || '',
      apiKey: process.env.API_KEY || '', // Share the system key
      isDefault: false,
      hasSeeded: false
    };

    const req = store.put(newUser);
    
    transaction.oncomplete = () => resolve(newUser);
    transaction.onerror = () => reject(transaction.error);
  });
};

export const deleteUserByUsername = async (username: string): Promise<void> => {
  const users = await getAllUsers();
  const userToDelete = users.find(u => u.username?.toLowerCase() === username?.toLowerCase());
  if (!userToDelete) return;

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const stores = [USER_STORE, WORD_STORE];
    if (db.objectStoreNames.contains(DAILY_STATS_STORE)) {
        stores.push(DAILY_STATS_STORE);
    }
    const tx = db.transaction(stores, 'readwrite');
    const userStore = tx.objectStore(USER_STORE);
    const wordStore = tx.objectStore(WORD_STORE);
    const statsStore = stores.includes(DAILY_STATS_STORE) ? tx.objectStore(DAILY_STATS_STORE) : null;

    userStore.delete(userToDelete.id);

    const wordIndex = wordStore.index('userId');
    const wordKeysReq = wordIndex.getAllKeys(userToDelete.id);
    wordKeysReq.onsuccess = () => {
        wordKeysReq.result.forEach(key => wordStore.delete(key));
        
        if (statsStore) {
            const statsIndex = statsStore.index('userId');
            const statsKeysReq = statsIndex.getAllKeys(userToDelete.id);
            statsKeysReq.onsuccess = () => {
                statsKeysReq.result.forEach(key => statsStore.delete(key));
            };
        }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const updateUserPassword = async (userId: string, newPassword: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(USER_STORE, 'readwrite');
    const store = transaction.objectStore(USER_STORE);
    const getReq = store.get(userId);
    getReq.onsuccess = () => {
      const user = getReq.result as User;
      if (user) {
        user.password = newPassword;
        const putReq = store.put(user);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      } else {
        reject(new Error("User not found"));
      }
    };
    getReq.onerror = () => reject(getReq.error);
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
  },
  {
    word: "dolphin",
    parts: ["dol", "phin"],
    partsPronunciation: ["dol", "fin"],
    root: "dol (like doll) + phin (sounds like fin)",
    phonetic: "/ˈdɑːl.fɪn/",
    translation: "海豚",
    sentence: "The dolphin jumped out of the water.",
    imageUrl: "",
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
    imageUrl: "",
    relatedWords: ["scared", "afraid", "fear"],
    phrases: ["frightened child", "feel frightened", "look frightened"]
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

export const findWordInAnyUser = async (word: string): Promise<DBWordRecord | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([WORD_STORE], 'readonly');
    const store = transaction.objectStore(WORD_STORE);
    // We need to scan all words because the primary key is [userId, word] or just word depending on schema.
    // But our schema is just 'word' as key path? No, let's check openDB.
    // Actually, looking at previous code, we might need to iterate.
    // Let's assume we can iterate all records.
    const request = store.openCursor();
    
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        const record = cursor.value as DBWordRecord;
        if (record.word.toLowerCase() === word.toLowerCase() && record.data) {
           resolve(record);
           return;
        }
        cursor.continue();
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);
  });
};

export const saveWordToDB = async (userId: string, currentUsername: string, wordData: WordData, updateDateAdded: boolean = false): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([USER_STORE, WORD_STORE], 'readwrite');
    const userStore = transaction.objectStore(USER_STORE);
    const wordStore = transaction.objectStore(WORD_STORE);

    const userReq = userStore.get(userId);
    userReq.onsuccess = () => {
        const user = userReq.result as User | undefined;
        if (!user || user.username.toLowerCase() !== currentUsername.toLowerCase()) {
            reject(new Error("Account name mismatch. Insertion failed."));
            return;
        }

        // Get specific user's record
        const getRequest = wordStore.get([userId, wordData.word.toLowerCase()]);

        getRequest.onsuccess = () => {
            const existing = getRequest.result as DBWordRecord | undefined;
            const today = new Date().toDateString();
            
            let newDatesAdded = existing?.datesAdded || (existing ? [existing.dateAdded] : [today]);
            if (updateDateAdded && !newDatesAdded.includes(today)) {
                newDatesAdded.push(today);
            }
            
            const record: DBWordRecord = {
              userId: userId,
              word: wordData.word.toLowerCase(),
              data: wordData,
              dateAdded: existing ? existing.dateAdded : today, // keep original dateAdded for backward compatibility
              datesAdded: newDatesAdded,
              lastReviewed: existing ? existing.lastReviewed : today,
              bestTime: existing?.bestTime
            };

            const putRequest = wordStore.put(record);
            putRequest.onsuccess = () => resolve();
            putRequest.onerror = () => reject(putRequest.error);
        };
        
        getRequest.onerror = () => reject(getRequest.error);
    };
    userReq.onerror = () => reject(userReq.error);
  });
};

export const deleteWordFromDB = async (userId: string, word: string, targetDate: string = new Date().toDateString()): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(WORD_STORE, 'readwrite');
    const store = transaction.objectStore(WORD_STORE);
    
    const getRequest = store.get([userId, word.toLowerCase()]);

    getRequest.onsuccess = () => {
      const record = getRequest.result as DBWordRecord;
      if (record) {
        if (record.datesAdded && record.datesAdded.length > 1) {
          // If the word exists in multiple dates, just remove the target date
          record.datesAdded = record.datesAdded.filter(date => date !== targetDate);
          const putRequest = store.put(record);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          // If it only exists in one date (or no datesAdded array), delete the whole record
          const deleteRequest = store.delete([userId, word.toLowerCase()]);
          deleteRequest.onsuccess = () => resolve();
          deleteRequest.onerror = () => reject(deleteRequest.error);
        }
      } else {
        resolve(); // Record doesn't exist, nothing to delete
      }
    };
    
    getRequest.onerror = () => reject(getRequest.error);
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
        const dates = record.datesAdded && record.datesAdded.length > 0 ? record.datesAdded : [record.dateAdded];
        const addedYesterday = dates.includes(yesterdayStr);
        const addedToday = dates.includes(today);
        const notReviewedToday = record.lastReviewed !== today;
        return addedYesterday && notReviewedToday && !addedToday;
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
      const todaysWords = allRecords.filter(r => {
          const dates = r.datesAdded && r.datesAdded.length > 0 ? r.datesAdded : [r.dateAdded];
          return dates.includes(today);
      });
      resolve(todaysWords);
    };
    request.onerror = () => reject(request.error);
  });
};

export const getWordsByDate = async (userId: string, targetDate: string): Promise<DBWordRecord[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(WORD_STORE, 'readonly');
    const store = transaction.objectStore(WORD_STORE);
    const index = store.index('userId');
    const request = index.getAll(userId);

    request.onsuccess = () => {
      const allRecords = request.result as DBWordRecord[];
      const targetWords = allRecords.filter(r => {
          const dates = r.datesAdded && r.datesAdded.length > 0 ? r.datesAdded : [r.dateAdded];
          return dates.includes(targetDate);
      });
      resolve(targetWords);
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

export const exportDatabaseToJson = async (userId: string, currentUsername: string, exportType: 'words' | 'account' = 'words'): Promise<string> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([USER_STORE, WORD_STORE, DAILY_STATS_STORE], 'readonly');
        
        const userReq = tx.objectStore(USER_STORE).get(userId);
        
        const wordIndex = tx.objectStore(WORD_STORE).index('userId');
        const wordReq = wordIndex.getAll(userId);
        
        const statsIndex = tx.objectStore(DAILY_STATS_STORE).index('userId');
        const statsReq = statsIndex.getAll(userId);
        
        const data: any = {
            exportDate: new Date().toISOString(),
            exportType: exportType,
            username: currentUsername
        };

        let completed = 0;

        const checkDone = () => {
            completed++;
            if (completed === 3) {
                let json = JSON.stringify(data, null, 2);
                if (currentUsername.toLowerCase() !== 'eva') {
                    json = encrypt(json);
                }
                resolve(json);
            }
        };

        userReq.onsuccess = () => {
             if (exportType === 'account') {
                 data.users = userReq.result ? [userReq.result] : [];
             }
             checkDone();
        };
        wordReq.onsuccess = () => {
             if (exportType === 'words') {
                 data.words = wordReq.result || [];
             }
             checkDone();
        };
        statsReq.onsuccess = () => {
             if (exportType === 'account') {
                 data.stats = statsReq.result || [];
             }
             checkDone();
        };
        userReq.onerror = wordReq.onerror = statsReq.onerror = () => reject("Export failed");

        tx.onerror = () => reject(tx.error);
    });
};

export const importDatabaseFromJson = async (userId: string, currentUsername: string, jsonString: string, overwrite: boolean = false, importType: 'words' | 'account' = 'words'): Promise<number> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        let data: { users?: User[], words?: DBWordRecord[], stats?: DailyStats[], exportType?: string } | null = null;
        try {
            let processedJson = jsonString;
            
            // Try parsing directly
            try {
                console.log("Attempting direct JSON parse");
                // Sanitize control characters and invalid escapes
                const sanitized = sanitizeJsonString(processedJson);
                data = JSON.parse(sanitized);
            } catch (e) {
                console.log("Direct JSON parse failed, trying decrypt");
                // If parsing fails, try decrypting
                const decrypted = decrypt(jsonString);
                console.log("Decrypted result length:", decrypted.length);
                // Sanitize decrypted data
                const sanitizedDecrypted = sanitizeJsonString(decrypted);
                data = JSON.parse(sanitizedDecrypted);
                console.log("Parsed decrypted JSON successfully");
            }

            if (!data) throw new Error("Invalid file structure");
            
            if (importType === 'account' && data.exportType === 'words') {
                throw new Error("Invalid file type: Expected an account backup file, but got a words backup file.");
            }
            if (importType === 'words' && data.exportType === 'account') {
                throw new Error("Invalid file type: Expected a words backup file, but got an account backup file.");
            }

            if (importType === 'account' && data.users && data.users.length > 0) {
                const importedUser = data.users[0];
                if (importedUser && importedUser.username.toLowerCase() !== currentUsername.toLowerCase()) {
                    throw new Error(`Cannot import account data from '${importedUser.username}' into account '${currentUsername}'.`);
                }
            }
        } catch (e: any) {
            reject(e.message || "Invalid JSON file");
            return;
        }

        const stores = [USER_STORE, WORD_STORE];
        if (db.objectStoreNames.contains(DAILY_STATS_STORE)) {
            stores.push(DAILY_STATS_STORE);
        }

        const tx = db.transaction(stores, 'readwrite');
        const userStore = tx.objectStore(USER_STORE);
        const wordStore = tx.objectStore(WORD_STORE);
        const statsStore = stores.includes(DAILY_STATS_STORE) ? tx.objectStore(DAILY_STATS_STORE) : null;
        
        let count = 0;

        const doImport = () => {
            // Import Users (Merge/Overwrite) - only if account export
            if (importType === 'account' && data!.users && data!.users.length > 0) {
                const importedUser = data!.users.find(u => u.id === userId) || data!.users[0];
                if (importedUser) {
                    importedUser.id = userId; // Force it to current user
                    userStore.put(importedUser);
                }
            }

            // Import Words
            if (data!.words) {
                data!.words.forEach(w => {
                    w.userId = userId; // Force it to current user
                    if (overwrite) {
                        wordStore.put(w);
                        count++;
                    } else {
                        const getReq = wordStore.get([userId, w.word.toLowerCase()]);
                        getReq.onsuccess = () => {
                            if (!getReq.result) {
                                wordStore.put(w);
                                count++;
                            }
                        };
                    }
                });
            }

            // Import Stats
            if (importType === 'account' && data!.stats && statsStore) {
                data!.stats.forEach(s => {
                    s.userId = userId; // Force it to current user
                    if (overwrite) {
                        statsStore.put(s);
                    } else {
                        const getReq = statsStore.get([userId, s.date]);
                        getReq.onsuccess = () => {
                            if (!getReq.result) {
                                statsStore.put(s);
                            }
                        };
                    }
                });
            }
        };

        doImport();

        tx.oncomplete = () => resolve(count);
        tx.onerror = () => reject(tx.error);
    });
};

export const initializeEvaVocabulary = async (userId: string): Promise<number> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(WORD_STORE, 'readwrite');
        const wordStore = transaction.objectStore(WORD_STORE);
        
        let count = 0;
        INITIAL_WORDS.forEach(w => {
            const record: DBWordRecord = {
                userId: userId,
                word: w.word,
                data: w,
                dateAdded: new Date().toDateString(),
                lastReviewed: new Date().toDateString()
            };
            wordStore.put(record);
            count++;
        });

        transaction.oncomplete = () => resolve(count);
        transaction.onerror = () => reject(transaction.error);
    });
};