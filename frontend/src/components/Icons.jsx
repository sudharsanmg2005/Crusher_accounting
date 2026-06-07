import React from 'react';

const Icon = ({ children, className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const BarChartIcon = (props) => <Icon {...props}><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 16V9" /><path d="M12 16V6" /><path d="M16 16v-4" /></Icon>;
export const UserShieldIcon = (props) => <Icon {...props}><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" /><path d="M12 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" /><path d="M8.5 16a4 4 0 0 1 7 0" /></Icon>;
export const UsersIcon = (props) => <Icon {...props}><path d="M16 19c0-2.2-1.8-4-4-4s-4 1.8-4 4" /><path d="M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" /><path d="M20 18c0-1.7-1.1-3.1-2.7-3.7" /><path d="M17 5.4a2.5 2.5 0 0 1 0 4.7" /><path d="M4 18c0-1.7 1.1-3.1 2.7-3.7" /><path d="M7 5.4a2.5 2.5 0 0 0 0 4.7" /></Icon>;
export const HardHatIcon = (props) => <Icon {...props}><path d="M4 14a8 8 0 0 1 16 0" /><path d="M3 14h18" /><path d="M7 14V9" /><path d="M17 14V9" /><path d="M9 20h6a4 4 0 0 0 4-4H5a4 4 0 0 0 4 4z" /></Icon>;
export const PackageIcon = (props) => <Icon {...props}><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" /><path d="M4 7.5l8 4.5 8-4.5" /><path d="M12 12v9" /></Icon>;
export const ReceiptIcon = (props) => <Icon {...props}><path d="M7 3h10a2 2 0 0 1 2 2v16l-3-2-2 2-2-2-2 2-2-2-3 2V5a2 2 0 0 1 2-2z" /><path d="M9 8h6" /><path d="M9 12h6" /><path d="M9 16h4" /></Icon>;
export const WalletIcon = (props) => <Icon {...props}><path d="M4 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12" /><path d="M17 13h4" /></Icon>;
export const LineChartIcon = (props) => <Icon {...props}><path d="M4 19V5" /><path d="M4 19h16" /><path d="M7 15l4-4 3 3 5-7" /></Icon>;
export const FolderIcon = (props) => <Icon {...props}><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" /></Icon>;
export const CalendarIcon = (props) => <Icon {...props}><path d="M7 3v4" /><path d="M17 3v4" /><path d="M4 9h16" /><path d="M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1z" /></Icon>;
export const SaveIcon = (props) => <Icon {...props}><path d="M5 3h12l2 2v16H5V3z" /><path d="M8 3v6h8V3" /><path d="M8 21v-7h8v7" /></Icon>;
export const TrashIcon = (props) => <Icon {...props}><path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M6 7l1 14h10l1-14" /><path d="M9 7V4h6v3" /></Icon>;
export const MoneyIcon = (props) => <Icon {...props}><path d="M4 7h16v10H4z" /><path d="M8 12h.01" /><path d="M16 12h.01" /><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" /></Icon>;
export const HistoryIcon = (props) => <Icon {...props}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" /></Icon>;
export const ChevronDownIcon = (props) => <Icon {...props}><path d="M6 9l6 6 6-6" /></Icon>;
export const ChevronRightIcon = (props) => <Icon {...props}><path d="M9 6l6 6-6 6" /></Icon>;
export const DocumentIcon = (props) => <Icon {...props}><path d="M7 3h7l3 3v15H7V3z" /><path d="M14 3v4h4" /><path d="M10 13h6" /><path d="M10 17h6" /></Icon>;
export const ShieldCheckIcon = (props) => <Icon {...props}><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></Icon>;

