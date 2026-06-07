import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import logoUrl from '../assets/dark KBM.png';

const Navbar = ({ onToggleSidebar }) => {
  const { user } = useAuth();

  return (
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
        <div className="h-10 w-10 md:h-12 md:w-12 rounded-full bg-white border border-slate-200 ring-2 ring-blue-600 flex items-center justify-center overflow-hidden shadow-sm">
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
  );
};

export default Navbar;
