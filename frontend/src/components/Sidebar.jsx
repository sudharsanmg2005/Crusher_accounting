import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import logoUrl from '../assets/dark KBM.png';
import {
  BarChartIcon,
  UserShieldIcon,
  HardHatIcon,
  UsersIcon,
  PackageIcon,
  ReceiptIcon,
  WalletIcon,
  ShieldCheckIcon,
  CargoIcon
} from './Icons';

const Sidebar = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [isFullscreenLogoOpen, setIsFullscreenLogoOpen] = useState(false);

  const handleLogoClick = (e) => {
    e.stopPropagation();
    setIsFullscreenLogoOpen(true);
  };

  const onLogout = () => {
    logout();
    if (onClose) onClose();
    navigate('/login', { replace: true });
  };

  const linkStyles = ({ isActive }) =>
    `flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors font-medium ${
      isActive
        ? 'bg-blue-600 text-white shadow-md'
        : 'text-slate-600 hover:bg-blue-50 hover:text-blue-800'
    }`;

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: BarChartIcon },
    ...(user?.role === 'super_admin' ? [{ name: 'Super Admin', path: '/super-admin', icon: ShieldCheckIcon }] : []),
    { name: 'Employees', path: '/employees', icon: HardHatIcon },
    { name: 'Customers', path: '/customers', icon: UsersIcon },
    { name: 'Bills', path: '/bills', icon: ReceiptIcon },
    { name: 'Buyers', path: '/buyers', icon: UserShieldIcon },
    { name: 'Loads', path: '/loads', icon: CargoIcon },
    { name: 'Expenses', path: '/expenses', icon: WalletIcon },
    { name: 'Materials', path: '/materials', icon: PackageIcon },
  ];
 
  return (
    <>
      {/* Mobile Sidebar Overlay/Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 md:hidden transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      {/* Sidebar Content */}
      <aside
        className={`bg-white border-r border-slate-200 shadow-sm flex flex-col transition-all duration-300 z-50
          fixed md:sticky top-16 md:top-16 left-0 h-[calc(100vh-4rem)] md:h-[calc(100vh-4rem)] w-64
          ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
        `}
      >
        {/* Mobile Header (only shown inside drawer on mobile) */}
        <div className="px-4 pt-6 pb-3 flex justify-between items-center md:block">
          <div className="flex items-center gap-3">
            <div 
              onClick={handleLogoClick}
              className="h-14 w-14 md:h-16 md:w-16 rounded-full bg-white border border-slate-200 ring-2 ring-blue-600 flex items-center justify-center overflow-hidden shadow-sm shrink-0 cursor-pointer hover:scale-105 transition-transform duration-200"
              title="Zoom Logo"
            >
              <img src={logoUrl} alt="Krishna Blue Metals" className="h-full w-full object-contain" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-extrabold text-slate-800 tracking-wide">KRISHNA BLUE METALS</div>
              <div className="text-xs font-medium text-slate-500">{user?.role ? `${user.role.toUpperCase()}` : 'ADMIN'}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="md:hidden text-slate-400 hover:text-slate-600 text-2xl font-bold leading-none p-2"
          >
            &times;
          </button>
        </div>

        <div className="px-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-2 mb-1">Menu</h3>
        </div>

        <div className="flex-1 px-4 space-y-2 overflow-y-auto w-full pb-3">
          {navItems.map((item) => {
            const ItemIcon = item.icon;
            return (
            <NavLink
              key={item.name}
              to={item.path}
              className={linkStyles}
              onClick={() => {
                if (onClose) onClose();
              }}
            >
              <span className="w-6 flex justify-center items-center"><ItemIcon className="h-5 w-5" /></span>
              <span>{item.name}</span>
            </NavLink>
          );
          })}
        </div>

        <div className="px-4 pb-6 pt-2 mt-auto">
          <button
            type="button"
            onClick={onLogout}
            className="w-full bg-slate-800 text-white border border-slate-800 hover:bg-slate-700 rounded-lg font-semibold py-2.5 transition shadow-sm"
          >
            Logout
          </button>
        </div>
      </aside>

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

export default Sidebar;
