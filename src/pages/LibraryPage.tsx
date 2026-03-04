import React, { useState, useEffect } from 'react';
import { DailyStats, DBWordRecord, WordData } from '../types';
import { getAllDailyStats, getAllWords } from '../services/dbService';

interface LibraryPageProps {
  userId: string;
  onStartChallenge: (words: WordData[], startBpm: number, date: string) => void;
  onBack: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExport: () => void;
}

const LibraryPage: React.FC<LibraryPageProps> = ({ userId, onStartChallenge, onBack, onImport, onExport }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [statsMap, setStatsMap] = useState<Record<string, DailyStats>>({});
  const [wordsMap, setWordsMap] = useState<Record<string, DBWordRecord[]>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    const allStats = await getAllDailyStats(userId);
    const sMap: Record<string, DailyStats> = {};
    allStats.forEach(s => sMap[s.date] = s);
    setStatsMap(sMap);

    const allWords = await getAllWords(userId);
    const wMap: Record<string, DBWordRecord[]> = {};
    allWords.forEach(w => {
      // Normalize date string to match stats (assuming DB stores "Mon Jan 01 2024")
      // We need to ensure consistent date formatting.
      // The DBService uses new Date().toDateString().
      if (!wMap[w.dateAdded]) wMap[w.dateAdded] = [];
      wMap[w.dateAdded].push(w);
    });
    setWordsMap(wMap);
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay(); // 0 = Sunday
    return { days, firstDay };
  };

  const { days, firstDay } = getDaysInMonth(currentDate);
  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const changeMonth = (delta: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + delta);
    setCurrentDate(newDate);
    setSelectedDate(null);
  };

  const handleDayClick = (day: number) => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
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
          if (!day) return <div key={`blank-${index}`} className="h-24"></div>;

          const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
          const dateStr = date.toDateString();
          const hasWords = !!wordsMap[dateStr];
          const stats = statsMap[dateStr];
          const stars = stats?.stars || 0;

          return (
            <div 
              key={day} 
              onClick={() => handleDayClick(day)}
              className={`
                h-24 border rounded-lg p-1 flex flex-col justify-between cursor-pointer transition-all
                ${hasWords ? 'bg-white hover:bg-blue-50 border-blue-200 shadow-sm' : 'bg-gray-50 text-gray-400 border-gray-100'}
                ${selectedDate === dateStr ? 'ring-2 ring-blue-500' : ''}
              `}
            >
              <div className="flex justify-between items-start">
                <span className="font-semibold text-sm">{day}</span>
                {stars > 0 && (
                   <div className="flex items-center text-yellow-500 text-xs font-bold">
                     <span>★</span> {stars}
                   </div>
                )}
              </div>
              
              {hasWords && (
                <div className="text-xs text-center text-blue-600 bg-blue-100 rounded px-1 py-0.5 mt-1">
                  {wordsMap[dateStr].length} words
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
          <h2 className="text-xl font-bold">{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</h2>
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
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">{selectedDate}</h3>
              <button onClick={() => setSelectedDate(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            
            <div className="space-y-4 mb-6">
              <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Words Added</span>
                <span className="font-bold">{wordsMap[selectedDate].length}</span>
              </div>
              <div className="flex justify-between p-3 bg-yellow-50 rounded-lg text-yellow-800">
                <span className="flex items-center gap-2"><span>★</span> Stars Earned</span>
                <span className="font-bold">{statsMap[selectedDate]?.stars || 0}</span>
              </div>
              <div className="flex justify-between p-3 bg-purple-50 rounded-lg text-purple-800">
                <span className="flex items-center gap-2"><span>⚡</span> Highest BPM</span>
                <span className="font-bold">{statsMap[selectedDate]?.highestBpm || 0} BPM</span>
              </div>
            </div>

            <div className="max-h-40 overflow-y-auto mb-6 border rounded p-2">
                {wordsMap[selectedDate].map(w => (
                    <span key={w.word} className="inline-block bg-gray-100 rounded px-2 py-1 text-sm m-1">
                        {w.word}
                    </span>
                ))}
            </div>

            <button 
              onClick={() => {
                const startBpm = statsMap[selectedDate]?.highestBpm || 80;
                onStartChallenge(wordsMap[selectedDate].map(w => w.data), startBpm, selectedDate);
              }}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold py-4 rounded-xl shadow-lg hover:scale-105 transition-transform flex items-center justify-center gap-2"
            >
              <span>🎮</span> Start Rhythm Challenge ({statsMap[selectedDate]?.highestBpm || 80} BPM)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LibraryPage;