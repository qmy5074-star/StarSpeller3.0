import React, { useState, useEffect } from 'react';
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
  const [wordsMap, setWordsMap] = useState<Record<string, DBWordRecord[]>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const statsMap = React.useMemo(() => {
    const sMap: Record<string, DailyStats> = {};
    allDailyStats.forEach(s => sMap[s.date] = s);
    return sMap;
  }, [allDailyStats]);

  useEffect(() => {
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
              <span>💾</span> Backup Data
          </button>
          <label className="bg-green-100 hover:bg-green-200 text-green-600 px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 cursor-pointer transition-colors">
              <span>📂</span> Import Data
              <input type="file" accept=".json" onChange={onImport} className="hidden" />
          </label>
      </div>

      {renderCalendar()}

      {selectedDate && wordsMap[selectedDate] && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setSelectedDate(null)}>
          <div className="bg-white rounded-2xl p-4 sm:p-6 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4 shrink-0">
              <h3 className="text-xl font-bold">{selectedDate}</h3>
              <button onClick={() => setSelectedDate(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            
            <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6 shrink-0">
              <div className="flex justify-between p-2 sm:p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600 flex items-center gap-2 text-sm sm:text-base"><span>📝</span> Words</span>
                <span className="font-bold text-sm sm:text-base">{wordsMap[selectedDate].length}</span>
              </div>
              <div className="flex justify-between p-2 sm:p-3 bg-yellow-50 rounded-lg text-yellow-800">
                <span className="flex items-center gap-2 text-sm sm:text-base"><span>⭐</span> Stars</span>
                <span className="font-bold text-sm sm:text-base">{statsMap[selectedDate]?.stars || 0}</span>
              </div>
              <div className="flex justify-between p-2 sm:p-3 bg-blue-50 rounded-lg text-blue-800">
                <span className="flex items-center gap-2 text-sm sm:text-base"><span>🏅</span> Badges</span>
                <span className="font-bold text-sm sm:text-base">{statsMap[selectedDate]?.badges || 0}</span>
              </div>
              <div className="flex justify-between p-2 sm:p-3 bg-purple-50 rounded-lg text-purple-800">
                <span className="flex items-center gap-2 text-sm sm:text-base"><span>⚡</span> Highest Speed</span>
                <span className="font-bold text-sm sm:text-base">{statsMap[selectedDate]?.highestBpm || 80} BPM</span>
              </div>
            </div>

            <div className="max-h-32 sm:max-h-40 overflow-y-auto mb-4 sm:mb-6 border rounded p-2 sm:p-3 flex flex-wrap gap-2 bg-gray-50 shrink-0">
                {wordsMap[selectedDate].map(w => (
                    <div key={w.word} className="group relative inline-flex items-center">
                        <button 
                          onClick={() => onWordClick(w.word, selectedDate)}
                          className="inline-block bg-white border border-blue-200 hover:bg-blue-50 text-blue-700 rounded-lg px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-bold transition-colors shadow-sm active:scale-95 pr-6 sm:pr-8"
                        >
                            {w.word}
                        </button>
                        <button
                          onClick={(e) => handleDeleteWord(w.word, e)}
                          className="absolute right-1 sm:right-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full p-0.5 sm:p-1 transition-colors"
                          title="Delete word"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 sm:h-4 sm:w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                    </div>
                ))}
            </div>

            <div className="flex flex-col gap-2 sm:gap-3 shrink-0 mt-auto">
              <button 
                onClick={() => {
                  onStartChallenge(wordsMap[selectedDate].map(w => w.data), 80, selectedDate);
                }}
                className="w-full bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-bold py-2 sm:py-3 rounded-xl shadow-md hover:scale-[1.02] transition-transform flex items-center justify-center gap-2 text-sm sm:text-base"
              >
                <span>🎵</span> Start Challenge (80 BPM)
              </button>
              
              {(statsMap[selectedDate]?.highestBpm || 0) > 80 && (
                <button 
                  onClick={() => {
                    const startBpm = statsMap[selectedDate]?.highestBpm || 80;
                    onStartChallenge(wordsMap[selectedDate].map(w => w.data), startBpm, selectedDate);
                  }}
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold py-2 sm:py-3 rounded-xl shadow-md hover:scale-[1.02] transition-transform flex items-center justify-center gap-2 text-sm sm:text-base"
                >
                  <span>🔥</span> Continue from {statsMap[selectedDate]?.highestBpm} BPM
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