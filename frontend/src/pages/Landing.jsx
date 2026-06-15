import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import logoUrl from '../assets/dark KBM.png';

const Landing = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, navigate]);

  const goToLogin = () => {
    if (loading) return;
    navigate('/login', { replace: true });
  };

  if (user) {
    return null;
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 px-4 cursor-pointer"
      onClick={goToLogin}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          goToLogin();
        }
      }}
      aria-label="Continue to login"
    >
      <div className="flex flex-col items-center text-center animate-fade-in">
        <div className="h-44 w-44 sm:h-52 sm:w-52 md:h-60 md:w-60 rounded-full bg-white border-4 border-white/20 ring-4 ring-blue-500 shadow-2xl flex items-center justify-center overflow-hidden mb-8">
          <img src={logoUrl} alt="Krishna Blue Metals" className="h-full w-full object-contain p-2" />
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-wide mb-2">
          KRISHNA BLUE METALS
        </h1>
        <p className="text-blue-200 text-sm sm:text-base font-medium mb-10">Crusher Accounting System</p>

        <div className="flex flex-col items-center gap-3">
          {loading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400" />
              <p className="text-blue-300 text-xs mt-1 animate-pulse">Connecting to system, please wait...</p>
            </div>
          ) : (
            <>
              <div className="h-1 w-24 rounded-full bg-blue-500/40 overflow-hidden">
                <div className="h-full bg-blue-400 rounded-full animate-loading-bar" />
              </div>
              <p className="text-slate-400 text-sm">Tap anywhere to continue</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Landing;
