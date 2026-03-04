import React, { useState } from 'react';
import { DailyStats, User } from '../types';

interface TopBarProps {
  stats: DailyStats;
  totalStars: number;
  totalBadges: number;
  darkMode?: boolean;
  currentUser: User | null;
  allUsers: User[];
  onSwitchUser: (user: User) => void;
  onCreateUser: (name: string) => void;
}

const TopBar: React.FC<TopBarProps> = ({ stats, totalStars, totalBadges, darkMode = false, currentUser, allUsers, onSwitchUser, onCreateUser }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newUserName, setNewUserName] = useState("");

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if(newUserName.trim()) {
      onCreateUser(newUserName.trim());
      setNewUserName("");
      setIsCreating(false);
      setIsMenuOpen(false);
    }
  };

  return (
    <div 
      className={`fixed top-0 left-0 w-full z-40 transition-all duration-300 border-b backdrop-blur-xl ${
        darkMode 
          ? 'bg-slate-900/90 border-slate-800 text-white' 
          : 'bg-white/80 border-blue-50 text-gray-700'
      }`}
    >
      <div className="container max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
        
        {/* Brand Logo & User Switcher */}
        <div className="flex items-center gap-4">
           {/* Logo */}
           <div className="flex items-center gap-2 select-none cursor-pointer group">
             <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xl shadow-sm transition-transform group-hover:scale-110 ${
               darkMode ? 'bg-slate-800 text-purple-400' : 'bg-gradient-to-br from-blue-400 to-blue-500 text-white'
             }`}>
               🚀
             </div>
             <span className={`font-black text-xl tracking-tight hidden sm:block ${darkMode ? 'text-white' : 'text-gray-700'}`}>
               Star<span className={darkMode ? 'text-purple-400' : 'text-blue-500'}>Speller</span>
             </span>
           </div>

           {/* User Dropdown Trigger */}
           <div className="relative">
              <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border-2 transition-all active:scale-95 ${
                  darkMode ? 'border-slate-700 bg-slate-800 hover:bg-slate-700' : 'border-blue-100 bg-blue-50 hover:bg-blue-100'
                }`}
              >
                <span className="text-sm font-bold">👤 {currentUser?.username || "Guest"}</span>
                <span className="text-xs opacity-50">▼</span>
              </button>

              {/* Dropdown Menu */}
              {isMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => { setIsMenuOpen(false); setIsCreating(false); }}></div>
                  <div className={`absolute top-full left-0 mt-2 w-56 rounded-2xl shadow-2xl p-2 z-20 flex flex-col gap-1 border-2 ${
                     darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-blue-100 text-gray-700'
                  }`}>
                     <div className="px-3 py-2 text-xs font-black uppercase opacity-50 tracking-widest">Switch Account</div>
                     
                     {allUsers.map(user => (
                       <button 
                         key={user.id}
                         onClick={() => { onSwitchUser(user); setIsMenuOpen(false); }}
                         className={`text-left px-3 py-2 rounded-xl text-sm font-bold transition-colors flex justify-between items-center ${
                           currentUser?.id === user.id 
                             ? (darkMode ? 'bg-purple-900/50 text-purple-300' : 'bg-blue-100 text-blue-600') 
                             : (darkMode ? 'hover:bg-slate-800' : 'hover:bg-gray-50')
                         }`}
                       >
                         {user.username}
                         {currentUser?.id === user.id && <span>✓</span>}
                       </button>
                     ))}

                     <div className="h-px bg-gray-200/20 my-1"></div>

                     {!isCreating ? (
                       <button 
                         onClick={() => setIsCreating(true)}
                         className={`text-left px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-2 ${
                            darkMode ? 'text-green-400 hover:bg-slate-800' : 'text-green-600 hover:bg-green-50'
                         }`}
                       >
                         <span>+</span> New Account
                       </button>
                     ) : (
                       <form onSubmit={handleCreateSubmit} className="p-1 flex flex-col gap-2">
                          <input 
                            autoFocus
                            placeholder="Name" 
                            className={`w-full px-2 py-1 rounded-lg text-sm border-2 outline-none ${
                               darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-blue-200'
                            }`}
                            value={newUserName}
                            onChange={(e) => setNewUserName(e.target.value)}
                          />
                          <button type="submit" className="bg-green-500 text-white text-xs font-bold py-1 rounded-lg">Create</button>
                       </form>
                     )}
                  </div>
                </>
              )}
           </div>
        </div>

        {/* Stats Counters */}
        <div className="flex items-center gap-3">
          
          {/* Badges Counter */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border-2 transition-colors ${
            darkMode 
              ? 'bg-slate-800 border-slate-700 shadow-[0_0_10px_rgba(168,85,247,0.2)]' 
              : 'bg-purple-50 border-purple-100'
          }`}>
             <span className="text-lg">🏅</span>
             <div className="flex flex-col leading-none">
               <span className={`font-black text-sm ${darkMode ? 'text-purple-200' : 'text-purple-600'}`}>
                 {totalBadges}
               </span>
             </div>
          </div>

          {/* Stars Counter */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border-2 transition-colors ${
            darkMode 
              ? 'bg-slate-800 border-slate-700 shadow-[0_0_10px_rgba(234,179,8,0.2)]' 
              : 'bg-yellow-50 border-yellow-100'
          }`}>
             <span className="text-lg animate-pulse">⭐</span>
             <div className="flex flex-col leading-none">
               <span className={`font-black text-sm ${darkMode ? 'text-yellow-200' : 'text-yellow-600'}`}>
                 {totalStars}
               </span>
             </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default TopBar;