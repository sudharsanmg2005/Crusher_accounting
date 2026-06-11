import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import logoUrl from '../assets/dark KBM.png';

const Navbar = ({ onToggleSidebar }) => {
  const { user } = useAuth();
  const [isFullscreenLogoOpen, setIsFullscreenLogoOpen] = useState(false);

  const handleLogoClick = (e) => {
    e.stopPropagation();
    setIsFullscreenLogoOpen(true);
  };

  return (
    <>
    <nav className="bg-slate-800 text-white shadow-md px-4 py-3 flex justify-between items-center sticky top-0 z-40 shrink-0">
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
      <div>
        <div className="flex items-center space-x-2 bg-slate-700 px-3 py-1.5 rounded-full transition-colors">
          <span className="text-xs md:text-sm font-medium">{user ? user.name || user.username : 'Admin'}</span>
        </div>
      </div>
    </nav>
    
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
