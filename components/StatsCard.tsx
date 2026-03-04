import React from 'react';
import { DailyStats } from '../types';

interface StatsCardProps {
  stats: DailyStats;
}

const StatsCard: React.FC<StatsCardProps> = ({ stats }) => {
  // Only calculate speed for successful challenges to encourage quality over rush
  const avgSpeed = stats.successCount > 0
    ? (stats.totalTime / stats.successCount).toFixed(1)
    : '0';

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
                  x{stats.successCount}
                </div>
             </div>
             <p className="mt-8 text-yellow-600 font-black tracking-widest uppercase text-xs">Stars Collected</p>
          </div>

          {/* Secondary Metric: Speed */}
          <div className="w-full bg-slate-50 rounded-2xl p-4 border-2 border-slate-100 flex items-center justify-between hover:bg-slate-100 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-500 shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex flex-col text-left">
                 <span className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Avg Speed</span>
                 <span className="text-indigo-900 font-bold text-xs">per successful word</span>
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-indigo-500">{avgSpeed}</span>
              <span className="text-gray-400 font-bold text-sm">s</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default StatsCard;