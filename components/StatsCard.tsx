import React from 'react';
import { DailyStats } from '../types';

interface StatsCardProps {
  stats: DailyStats;
}

const StatsCard: React.FC<StatsCardProps> = ({ stats }) => {
  return (
    <div className="w-full max-w-sm mx-auto transform hover:scale-105 transition-transform duration-300">
      {/* Main Card Container */}
      <div className="bg-white rounded-[2.5rem] shadow-2xl border-4 border-white overflow-hidden relative">
        
        {/* Background Decorative Blob */}
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-blue-50 to-transparent z-0"></div>

        <div className="relative z-10 p-8 flex flex-col items-center gap-8">
          
          {/* Header */}
          <div className="text-center">
            <h2 className="text-2xl font-black text-gray-700 tracking-tight">Today's Progress</h2>
            <p className="text-gray-400 text-sm font-bold">Keep shining!</p>
          </div>

          {/* Primary Metric: Stars */}
          <div className="flex flex-col items-center">
             <div className="relative group">
                <div className="absolute inset-0 bg-yellow-300 blur-3xl opacity-20 group-hover:opacity-40 transition-opacity rounded-full"></div>
                <div className="text-9xl filter drop-shadow-xl transform group-hover:rotate-12 transition-transform duration-300 cursor-default animate-pulse-slow">
                  ⭐
                </div>
                <div className="absolute -bottom-2 -right-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-black text-2xl px-5 py-2 rounded-2xl border-4 border-white shadow-lg">
                  x{stats.stars || 0}
                </div>
             </div>
             <p className="mt-8 text-yellow-600 font-black tracking-widest uppercase text-xs">Stars Collected</p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default StatsCard;