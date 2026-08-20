export const formatDateDDMMYYYY = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

export const formatDateTime = (value) => {
  if (!value) return { date: '—', time: '—' };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { date: '—', time: '—' };
  const dateStr = formatDateDDMMYYYY(value);
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const timeStr = `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;

  return {
    date: dateStr,
    time: timeStr
  };
};
