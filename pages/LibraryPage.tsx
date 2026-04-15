import * as React from 'react';
import { DailyStats, DBWordRecord, WordData } from '../types';
import { getAllDailyStats, getAllWords, deleteWordFromDB } from '../services/dbService';

interface LibraryPageProps {
  userId: string;
  allDailyStats: DailyStats[];
  viewingMonth: Date;
  onMonthChange: (date: Date) => void;
  onStartChallenge: (words: WordData[], startBpm: number, date: string) => void;
  onBack: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExport: () => void;
  onWordClick: (word: string, date: string) => void;
  onDeleteWord?: (word: string) => void;
}

const LibraryPage: React.FC<LibraryPageProps> = ({ userId, allDailyStats, viewingMonth, onMonthChange, onStartChallenge, onBack, onImport, onExport, onWordClick, onDeleteWord }) => {
  const [wordsMap, setWordsMap] = React.useState<Record<string, DBWordRecord[]>>({});
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
  const clickTimer = React.useRef<NodeJS.Timeout | null>(null);
  const lastClickTime = React.useRef<number>(0);

  const statsMap = React.useMemo(() => {
    const sMap: Record<string, DailyStats> = {};
    allDailyStats.forEach(s => sMap[s.date] = s);
    return sMap;
  }, [allDailyStats]);

  React.useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    const allWords = await getAllWords(userId);
    const wMap: Record<string, DBWordRecord[]> = {};
    allWords.forEach(w => {
      const dates = w.datesAdded && w.datesAdded.length > 0 ? w.datesAdded : [w.dateAdded];
      dates.forEach(d => {
          if (!wMap[d]) wMap[d] = [];
          wMap[d].push(w);
      });
    });
    setWordsMap(wMap);
  };

  const handleDeleteWord = async (word: string, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      
      try {
          await deleteWordFromDB(userId, word);
          await loadData();
          
          if (onDeleteWord) {
              onDeleteWord(word);
          }
          
          // If we just deleted the last word for the selected date, close the modal
          if (selectedDate) {
              const remainingWords = wordsMap[selectedDate]?.filter(w => w.word !== word) || [];
              if (remainingWords.length === 0) {
                  setSelectedDate(null);
              }
          }
      } catch (err) {
          console.error("Failed to delete word:", err);
      }
  };

  const handleWordClickInternal = (word: string, date: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const now = Date.now();
    const DOUBLE_CLICK_DELAY = 300;

    if (now - lastClickTime.current < DOUBLE_CLICK_DELAY) {
      // Double click detected
      if (clickTimer.current) {
        clearTimeout(clickTimer.current);
        clickTimer.current = null;
      }
      handleDeleteWord(word, e);
      lastClickTime.current = 0;
    } else {
      // Single click potential
      lastClickTime.current = now;
      clickTimer.current = setTimeout(() => {
        onWordClick(word, date);
        clickTimer.current = null;
      }, DOUBLE_CLICK_DELAY);
    }
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay(); // 0 = Sunday
    return { days, firstDay };
  };

  const { days, firstDay } = getDaysInMonth(viewingMonth);
  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const changeMonth = (delta: number) => {
    const newDate = new Date(viewingMonth);
    newDate.setMonth(newDate.getMonth() + delta);
    onMonthChange(newDate);
    setSelectedDate(null);
  };

  const handleDayClick = (day: number) => {
    const date = new Date(viewingMonth.getFullYear(), viewingMonth.getMonth(), day);
    const dateStr = date.toDateString();
    if (wordsMap[dateStr]) {
        setSelectedDate(dateStr);
    }
  };

  const renderCalendar = () => {
    const blanks = Array(firstDay).fill(null);
    const dayNumbers = Array.from({ length: days }, (_, i) => i + 1);
    const allCells = [...blanks, ...dayNumbers];

    return (
      <div className="grid grid-cols-7 gap-2 mb-4">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="text-center font-bold text-gray-500 text-sm">{d}</div>
        ))}
        {allCells.map((day, index) => {
          if (!day) return <div key={`blank-${index}`} className="h-16 sm:h-24"></div>;

          const date = new Date(viewingMonth.getFullYear(), viewingMonth.getMonth(), day);
          const dateStr = date.toDateString();
          const hasWords = !!wordsMap[dateStr];
          const stats = statsMap[dateStr];
          const stars = stats?.stars || 0;
          const wordCount = hasWords ? wordsMap[dateStr].length : 0;
          const isCompleted = hasWords && stars >= wordCount;

          return (
            <div 
              key={day} 
              onClick={() => handleDayClick(day)}
              className={`
                h-16 sm:h-24 border rounded-lg p-1 flex flex-col justify-between cursor-pointer transition-all
                ${hasWords 
                  ? (isCompleted ? 'bg-green-50 hover:bg-green-100 border-green-300 shadow-sm' : 'bg-white hover:bg-blue-50 border-blue-200 shadow-sm') 
                  : 'bg-gray-50 text-gray-400 border-gray-100'}
                ${selectedDate === dateStr ? (isCompleted ? 'ring-2 ring-green-500' : 'ring-2 ring-blue-500') : ''}
              `}
            >
              <div className="flex justify-between items-start">
                <span className={`font-semibold text-sm ${isCompleted ? 'text-green-800' : ''}`}>{day}</span>
              </div>
              
              {hasWords && (
                <div className={`text-xs text-center rounded px-1 py-0.5 mt-1 ${isCompleted ? 'text-green-700 bg-green-200' : 'text-blue-600 bg-blue-100'}`}>
                  {wordCount}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <button onClick={onBack} className="text-gray-600 hover:text-gray-900">
          ← Back
        </button>
        <div className="flex items-center gap-4">
          <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-100 rounded-full">◀</button>
          <h2 className="text-xl font-bold">{monthNames[viewingMonth.getMonth()]} {viewingMonth.getFullYear()}</h2>
          <button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-100 rounded-full">▶</button>
        </div>
        <div className="w-16"></div> {/* Spacer */}
      </div>

      <div className="flex gap-4 justify-center mb-6">
          <button 
            onClick={onExport}
            className="bg-blue-100 hover:bg-blue-200 text-blue-600 px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors"
          >
              <span>💾</span> Export Words
          </button>
          <label className="bg-green-100 hover:bg-green-200 text-green-600 px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 cursor-pointer transition-colors">
              <span>📂</span> Import Words
              <input type="file" accept=".json" onChange={onImport} className="hidden" />
          </label>
      </div>

      {renderCalendar()}

      {selectedDate && wordsMap[selectedDate] && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in" onClick={() => setSelectedDate(null)}>
          <div className="bg-white rounded-[2rem] p-5 sm:p-6 max-w-md w-full shadow-2xl max-h-[76vh] flex flex-col animate-slide-up relative overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3 shrink-0">
              <div className="space-y-0">
                <h3 className="text-xl font-black text-slate-800 tracking-tight">{selectedDate}</h3>
                <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">Summary</p>
              </div>
              <button 
                onClick={() => setSelectedDate(null)} 
                className="w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-colors"
              >
                ✕
              </button>
            </div>
            
            <div className="grid grid-cols-4 gap-2 mb-4 shrink-0">
              <div className="p-2 bg-blue-50 rounded-xl border border-blue-100/50 flex flex-col items-center text-center">
                <div className="text-lg">📝</div>
                <div className="text-sm font-black text-blue-600 leading-none">{wordsMap[selectedDate].length}</div>
                <div className="text-[8px] font-black text-blue-400 uppercase tracking-widest mt-1">Words</div>
              </div>
              <div className="p-2 bg-yellow-50 rounded-xl border border-yellow-100/50 flex flex-col items-center text-center">
                <div className="text-lg">⭐</div>
                <div className="text-sm font-black text-yellow-600 leading-none">{statsMap[selectedDate]?.stars || 0}</div>
                <div className="text-[8px] font-black text-yellow-400 uppercase tracking-widest mt-1">Stars</div>
              </div>
              <div className="p-2 bg-orange-50 rounded-xl border border-orange-100/50 flex flex-col items-center text-center">
                <div className="text-lg">🏅</div>
                <div className="text-sm font-black text-orange-600 leading-none">{statsMap[selectedDate]?.badges || 0}</div>
                <div className="text-[8px] font-black text-orange-400 uppercase tracking-widest mt-1">Badges</div>
              </div>
              <div className="p-2 bg-purple-50 rounded-xl border border-purple-100/50 flex flex-col items-center text-center">
                <div className="text-lg">⚡</div>
                <div className="text-sm font-black text-purple-600 leading-none">{statsMap[selectedDate]?.highestBpm || 80}</div>
                <div className="text-[8px] font-black text-purple-400 uppercase tracking-widest mt-1">BPM</div>
              </div>
            </div>

            <div className="overflow-y-auto mb-4 pr-1 custom-scrollbar flex-grow min-h-0 max-h-[40vh]">
              <div className="flex justify-between items-center px-1 mb-2 sticky top-0 bg-white z-10 py-1">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Words</h4>
                <p className="text-[9px] font-bold text-slate-300 italic">Tap: Details • Double: Delete</p>
              </div>
              <div className="flex flex-wrap gap-2 p-0.5">
                  {wordsMap[selectedDate].map(w => (
                      <button 
                        key={w.word}
                        onClick={(e) => handleWordClickInternal(w.word, selectedDate, e)}
                        className="group relative bg-white border border-slate-100 hover:border-blue-200 hover:bg-blue-50 text-slate-700 rounded-lg px-3 py-1.5 text-sm font-black transition-all shadow-sm active:scale-95 flex items-center gap-2"
                      >
                          <span>{w.word}</span>
                          <div className="flex items-center gap-1.5 opacity-40 text-[10px] font-bold">
                              {w.data.partOfSpeech && (
                                  <span className="lowercase">
                                      {w.data.partOfSpeech}
                                  </span>
                              )}
                              {w.data.translation && (
                                  <span>
                                      {w.data.translation}
                                  </span>
                              )}
                          </div>
                      </button>
                  ))}
              </div>
            </div>

            <div className="flex flex-col gap-2 shrink-0 pb-2 sm:pb-0">
              <button 
                onClick={() => {
                  onStartChallenge(wordsMap[selectedDate].map(w => w.data), 80, selectedDate);
                }}
                className="w-full bg-blue-500 text-white font-black py-3.5 rounded-xl shadow-[0_4px_0_rgb(37,99,235)] active:shadow-none active:translate-y-1 transition-all flex items-center justify-center gap-2 text-sm"
              >
                <span>🎵</span> START CHALLENGE
              </button>
              
              {(statsMap[selectedDate]?.highestBpm || 0) > 80 && (
                <button 
                  onClick={() => {
                    const startBpm = statsMap[selectedDate]?.highestBpm || 80;
                    onStartChallenge(wordsMap[selectedDate].map(w => w.data), startBpm, selectedDate);
                  }}
                  className="w-full bg-purple-500 text-white font-black py-3.5 rounded-xl shadow-[0_4px_0_rgb(126,34,206)] active:shadow-none active:translate-y-1 transition-all flex items-center justify-center gap-2 text-sm"
                >
                  <span>🔥</span> CONTINUE SPEED
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LibraryPage;