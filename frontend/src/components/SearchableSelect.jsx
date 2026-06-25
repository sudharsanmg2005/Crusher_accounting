import React, { useState, useEffect, useRef } from 'react';

const SearchableSelect = ({ 
  options, 
  value, 
  onChange, 
  placeholder = 'Select...', 
  className = '', 
  required = false 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);

  // Find currently selected option
  const selectedOption = options.find((opt) => opt.value === value);

  // Sync search input with selected value when dropdown is closed
  useEffect(() => {
    if (!isOpen) {
      setSearch(selectedOption ? selectedOption.label : '');
    }
  }, [value, selectedOption, isOpen]);

  // Click outside handler to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputFocus = () => {
    setIsOpen(true);
    setSearch(''); // clear search when user clicks to type
  };

  const handleInputChange = (e) => {
    setSearch(e.target.value);
    setIsOpen(true);
  };

  const handleSelectOption = (opt) => {
    onChange(opt.value);
    setIsOpen(false);
  };

  // Filter options based on search query
  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={search}
          onFocus={handleInputFocus}
          onChange={handleInputChange}
          placeholder={selectedOption ? selectedOption.label : placeholder}
          required={required && !value} // Only required if no value is selected
          className={`w-full border border-slate-300 rounded-lg p-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white text-slate-800 ${className}`}
        />
        {/* Dropdown Arrow Indicator */}
        <div 
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer pointer-events-auto p-1"
        >
          <svg className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl max-h-60 overflow-y-auto z-[999] animate-in fade-in slide-in-from-top-1 duration-150">
          {filteredOptions.length === 0 ? (
            <div className="p-3 text-sm text-slate-400 italic text-center">No results found</div>
          ) : (
            filteredOptions.map((opt) => (
              <div
                key={opt.value}
                onClick={() => handleSelectOption(opt)}
                className={`p-2.5 px-4 text-sm cursor-pointer transition-colors ${
                  opt.value === value
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900'
                }`}
              >
                {opt.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
