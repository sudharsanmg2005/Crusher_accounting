import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useTheme } from '../ThemeContext';
import logoUrl from '../assets/dark KBM.png';

const Navbar = ({ onToggleSidebar }) => {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isFullscreenLogoOpen, setIsFullscreenLogoOpen] = useState(false);
  const [isNavHidden, setIsNavHidden] = useState(false);

  const handleLogoClick = (e) => {
    e.stopPropagation();
    setIsFullscreenLogoOpen(true);
  };

  return (
    <>
    {isNavHidden ? (
      <div className="sticky top-0 z-40 bg-slate-800/90 dark:bg-slate-900/90 backdrop-blur-sm text-white px-3 py-1 flex items-center justify-between shadow-sm shrink-0 transition-all duration-200">
        <div className="flex items-center space-x-2">
          <button
            onClick={onToggleSidebar}
            className="md:hidden text-white hover:text-blue-300 p-1 text-xl leading-none"
            title="Open menu"
          >
            ☰
          </button>
          <span className="text-xs font-extrabold tracking-wide text-slate-200">Krishna Blue Metals</span>
        </div>
        <button
          onClick={() => setIsNavHidden(false)}
          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center gap-1 shadow-sm transition-transform active:scale-95"
          title="Restore full Navbar"
        >
          <span>Show Nav</span>
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    ) : (
      <nav className="bg-slate-800 dark:bg-slate-900 text-white dark:text-slate-100 shadow-md px-4 py-3 md:py-2 flex justify-between items-center sticky top-0 z-40 md:z-50 shrink-0 transition-colors duration-200 landscape-compact-nav">
        <div className="flex items-center space-x-3">
          {/* Hamburger Menu Icon */}
          <button
            onClick={onToggleSidebar}
            className="md:hidden text-white hover:text-blue-300 focus:outline-none mr-1 p-1 text-2xl"
            title="Open menu"
          >
            ☰
          </button>
          <div 
            onClick={handleLogoClick}
            className="h-10 w-10 md:h-12 md:w-12 rounded-full bg-white border border-slate-200 ring-2 ring-blue-600 flex items-center justify-center overflow-hidden shadow-sm cursor-pointer hover:scale-105 transition-transform duration-200"
            title="Zoom Logo"
          >
            <img src={logoUrl} alt="Krishna Blue Metals logo" className="h-full w-full object-contain" />
          </div>
          <Link to="/dashboard" className="text-lg md:text-xl font-bold tracking-wider hover:text-blue-300 transition-colors">
            Krishna Blue Metals
          </Link>
        </div>
        <div className="flex items-center space-x-2 md:space-x-3">
          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-full hover:bg-slate-700 dark:hover:bg-slate-800 transition-colors text-white focus:outline-none"
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          >
            {theme === 'light' ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            ) : (
              <svg className="h-5 w-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M14.25 12a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
            )}
          </button>

          <div className="flex items-center space-x-2 bg-slate-700 dark:bg-slate-800 px-3 py-1.5 rounded-full transition-colors">
            <span className="text-xs md:text-sm font-medium">{user ? user.name || user.username : 'Admin'}</span>
          </div>

          {/* Hide Navbar Toggle Button */}
          <button
            onClick={() => setIsNavHidden(true)}
            className="px-2 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold flex items-center gap-1 transition-colors border border-slate-600"
            title="Hide Navbar to maximize display space"
          >
            <span className="hidden sm:inline">Hide Nav</span>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
            </svg>
          </button>
        </div>
      </nav>
    )}
    
    {isFullscreenLogoOpen && (
      <div 
        className="fixed inset-0 bg-slate-950/95 z-[9999] flex flex-col items-center justify-center p-4 backdrop-blur-md cursor-pointer animate-in fade-in duration-300"
        onClick={() => setIsFullscreenLogoOpen(false)}
      >
        <div className="absolute top-6 right-6 text-white hover:text-slate-300 text-3xl font-bold p-2 cursor-pointer transition-colors" onClick={() => setIsFullscreenLogoOpen(false)}>
          &times;
        </div>
        <div className="max-w-md w-full aspect-square bg-white rounded-full p-8 shadow-2xl flex items-center justify-center ring-8 ring-blue-600 animate-in zoom-in duration-300">
          <img src={logoUrl} alt="Krishna Blue Metals" className="h-full w-full object-contain" />
        </div>
        <h2 className="text-white text-3xl font-extrabold tracking-wider mt-8 text-center drop-shadow-md">KRISHNA BLUE METALS</h2>
        <p className="text-slate-400 text-sm mt-2 text-center uppercase tracking-widest">{user?.role || 'Admin'} Panel</p>
        <p className="text-slate-500 text-xs mt-8">Click anywhere to dismiss</p>
      </div>
    )}
    </>
  );
};

export default Navbar;
