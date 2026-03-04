import React, { useState, useEffect } from 'react';
import { DailyStats } from '../types';
import { getAllDailyStats } from '../services/dbService';

interface StatsPageProps {
  userId: string;
  onBack: () => void;
}

const StatsPage: React.FC<StatsPageProps> = ({ userId, onBack }) => {
  const [totalStars, setTotalStars] = useState(0);
  const [maxBpm, setMaxBpm] = useState(80);

  useEffect(() => {
    loadStats();
  }, [userId]);

  const loadStats = async () => {
    const stats = await getAllDailyStats(userId);
    const total = stats.reduce((acc, curr) => acc + (curr.stars || 0), 0);
    const max = stats.reduce((acc, curr) => Math.max(acc, curr.highestBpm || 0), 80);
    
    setTotalStars(total);
    setMaxBpm(max);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto bg-white rounded-2xl shadow-xl mt-10">
      <div className="flex justify-between items-center mb-8">
        <button onClick={onBack} className="text-gray-500 hover:text-gray-800 transition-colors">
          ← Back
        </button>
        <h1 className="text-3xl font-black text-gray-800">Your Stats</h1>
        <div className="w-8"></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Total Stars Card */}
        <div className="bg-gradient-to-br from-yellow-100 to-orange-100 p-6 rounded-2xl border border-yellow-200 shadow-sm flex flex-col items-center justify-center min-h-[200px]">
          <div className="text-6xl mb-4">⭐</div>
          <div className="text-5xl font-black text-yellow-600 mb-2">{totalStars}</div>
          <div className="text-gray-600 font-medium uppercase tracking-wide text-sm">Total Stars Earned</div>
        </div>

        {/* Max BPM Card */}
        <div className="bg-gradient-to-br from-purple-100 to-indigo-100 p-6 rounded-2xl border border-purple-200 shadow-sm flex flex-col items-center justify-center min-h-[200px]">
          <div className="text-6xl mb-4">⚡</div>
          <div className="text-5xl font-black text-purple-600 mb-2">{maxBpm} <span className="text-2xl text-purple-400">BPM</span></div>
          <div className="text-gray-600 font-medium uppercase tracking-wide text-sm">Highest Rhythm Speed</div>
        </div>
      </div>
      
      <div className="mt-8 p-4 bg-gray-50 rounded-xl text-center text-gray-500 text-sm">
        Keep practicing daily to increase your stats!
      </div>
    </div>
  );
};

export default StatsPage;