import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ConfirmContext = createContext(null);

export const ConfirmProvider = ({ children }) => {
  const [dialog, setDialog] = useState(null);

  const confirm = useCallback((options) => {
    const config = typeof options === 'string' ? { message: options } : options;
    return new Promise((resolve) => {
      setDialog({
        title: config.title || 'Confirm action',
        message: config.message || 'Are you sure?',
        confirmText: config.confirmText || 'Confirm',
        cancelText: config.cancelText || 'Cancel',
        tone: config.tone || 'danger',
        resolve
      });
    });
  }, []);

  const close = (result) => {
    if (dialog?.resolve) dialog.resolve(result);
    setDialog(null);
  };

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {dialog && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[100] animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">{dialog.title}</h2>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">{dialog.message}</p>
            </div>
            <div className="p-4 bg-slate-50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => close(false)}
                className="px-4 py-2 rounded-lg font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition"
              >
                {dialog.cancelText}
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                className={`px-4 py-2 rounded-lg font-semibold text-white shadow-sm transition ${
                  dialog.tone === 'danger'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {dialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx.confirm;
};
