export const formatDateTime = (value) => {
  const d = new Date(value);
  return {
    date: d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  };
};
