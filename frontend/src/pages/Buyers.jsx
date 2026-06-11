import React, { useState, useEffect, useMemo } from 'react';
import api from '../api';
import { useAuth } from '../AuthContext';
import { useConfirm } from '../components/ConfirmDialog';
import { formatDateTime } from '../utils/dateTime';
import { EditIcon, TrashIcon, EyeIcon } from '../components/Icons';

const Buyers = () => {
  const { user } = useAuth();
  const confirm = useConfirm();
  
  const [buyers, setBuyers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loadsModalOpen, setLoadsModalOpen] = useState(false);
  
  // Selected records
  const [selectedBuyer, setSelectedBuyer] = useState(null);
  const [buyerLoads, setBuyerLoads] = useState([]);
  const [loadsLoading, setLoadsLoading] = useState(false);
  const [sortMode, setSortMode] = useState('date_desc'); // date_desc | date_asc | quantity_desc | value_desc
  
  // Form state
  const [formData, setFormData] = useState({ name: '', phone: '', address: '' });
  
  const canWrite = user?.role === 'super_admin' || user?.accessLevel === 'full_access';

  useEffect(() => {
    fetchBuyers();
  }, []);

  const fetchBuyers = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/buyers');
      setBuyers(data);
    } catch (error) {
      console.error('Error fetching buyers', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBuyerLoads = async (buyer) => {
    setLoadsLoading(true);
    try {
      const { data } = await api.get(`/loads?buyerId=${buyer._id}`);
      setBuyerLoads(data);
    } catch (error) {
      console.error('Error fetching buyer loads', error);
      alert('Error fetching loads');
    } finally {
      setLoadsLoading(false);
    }
  };

  const openLoadsModal = async (buyer) => {
    setSelectedBuyer(buyer);
    setBuyerLoads([]);
    setLoadsModalOpen(true);
    await fetchBuyerLoads(buyer);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'phone') {
      setFormData({ ...formData, phone: value.replace(/\D/g, '').slice(0, 10) });
      return;
    }
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone || formData.phone.length !== 10) {
      alert('Name and a valid 10-digit phone number are required');
      return;
    }
    try {
      if (formData._id) {
        await api.put(`/buyers/${formData._id}`, formData);
      } else {
        await api.post('/buyers', formData);
      }
      setIsModalOpen(false);
      setFormData({ name: '', phone: '', address: '' });
      fetchBuyers();
    } catch (error) {
      console.error('Error saving buyer', error);
      alert(error.response?.data?.message || 'Error saving buyer');
    }
  };

  const handleEdit = (buyer) => {
    setFormData({ ...buyer });
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    const ok = await confirm({
      title: 'Delete Buyer',
      message: 'Are you sure you want to delete this buyer?',
      confirmText: 'Delete',
      tone: 'danger'
    });
    if (ok) {
      try {
        await api.delete(`/buyers/${id}`);
        fetchBuyers();
      } catch (error) {
        console.error('Error deleting buyer', error);
        alert('Error deleting buyer');
      }
    }
  };

  // Filter buyers
  const filteredBuyers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return buyers;
    return buyers.filter(
      (b) =>
        (b.name || '').toLowerCase().includes(term) ||
        (b.phone || '').includes(term)
    );
  }, [buyers, searchTerm]);

  // Sort loads inside loads modal
  const sortedLoads = useMemo(() => {
    const result = [...buyerLoads];
    if (sortMode === 'date_desc') {
      result.sort((a, b) => new Date(b.date) - new Date(a.date));
    } else if (sortMode === 'date_asc') {
      result.sort((a, b) => new Date(a.date) - new Date(b.date));
    } else if (sortMode === 'quantity_desc') {
      result.sort((a, b) => b.quantity - a.quantity);
    } else if (sortMode === 'value_desc') {
      result.sort((a, b) => (b.price * b.quantity) - (a.price * a.quantity));
    }
    return result;
  }, [buyerLoads, sortMode]);

  // Calculated totals for buyer loads
  const loadTotals = useMemo(() => {
    return buyerLoads.reduce(
      (acc, load) => {
        acc.totalValue += Number(load.price || 0) * Number(load.quantity || 0);
        if (load.unitType === 'tons') {
          acc.totalTons += Number(load.quantity || 0);
        } else {
          acc.totalUnits += Number(load.quantity || 0);
        }
        return acc;
      },
      { totalValue: 0, totalTons: 0, totalUnits: 0 }
    );
  }, [buyerLoads]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Buyers</h1>
          <p className="text-slate-500 text-sm mt-1">Manage buyer profiles, addresses, and load history.</p>
        </div>
        {canWrite && (
          <button 
            onClick={() => { setFormData({ name: '', phone: '', address: '' }); setIsModalOpen(true); }}
            className="btn-primary flex items-center shadow-lg hover:shadow-xl w-full sm:w-auto justify-center"
          >
            <span className="mr-2">+</span> Add Buyer
          </button>
        )}
      </div>

      {/* Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-3 rounded-xl shadow-sm border border-slate-200">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search by name or phone number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-sm bg-white"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
        </div>
      </div>

      <div className="card overflow-hidden p-0 border border-slate-200">
        {loading ? (
           <div className="p-8 text-center text-slate-500">Loading buyers...</div>
        ) : filteredBuyers.length === 0 ? (
           <div className="p-8 text-center text-slate-500">
             {searchTerm ? 'No buyers match your search.' : 'No buyers found. Add your first buyer!'}
           </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-sm text-slate-600 uppercase tracking-wider">
                  <th className="p-4 font-semibold">Name</th>
                  <th className="p-4 font-semibold">Phone</th>
                  <th className="p-4 font-semibold">Address</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBuyers.map((b) => (
                  <tr key={b._id} className="hover:bg-slate-50 transition">
                    <td className="p-4 font-medium text-slate-800">{b.name}</td>
                    <td className="p-4 text-slate-600">{b.phone || '-'}</td>
                    <td className="p-4 text-slate-600 truncate max-w-xs">{b.address || '-'}</td>
                    <td className="p-4 text-right space-x-2 whitespace-nowrap">
                      <button 
                        onClick={() => openLoadsModal(b)} 
                        className="text-green-600 hover:text-green-800 hover:bg-green-50 p-2 rounded-lg transition-colors inline-flex items-center" 
                        title="View Loads"
                      >
                        <EyeIcon className="h-5 w-5" />
                      </button>
                      {canWrite && (
                        <>
                          <button 
                            onClick={() => handleEdit(b)} 
                            className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-2 rounded-lg transition-colors inline-flex items-center" 
                            title="Edit Buyer"
                          >
                            <EditIcon className="h-5 w-5" />
                          </button>
                          <button 
                            onClick={() => handleDelete(b._id)} 
                            className="text-red-600 hover:text-red-800 hover:bg-red-50 p-2 rounded-lg transition-colors inline-flex items-center" 
                            title="Delete Buyer"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-800">{formData._id ? 'Edit Buyer' : 'Add New Buyer'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Buyer Name *</label>
                <input 
                  type="text" name="name" required value={formData.name} onChange={handleChange}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  placeholder="e.g. Acme Minerals Ltd"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number * (10 digits)</label>
                <input
                  type="text" name="phone" required value={formData.phone} onChange={handleChange}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  placeholder="9876543210"
                  maxLength={10}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                <textarea 
                  name="address" rows="3" value={formData.address} onChange={handleChange}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  placeholder="Full office address"
                ></textarea>
              </div>
              
              <div className="pt-4 flex justify-end space-x-3 border-t border-slate-100 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition shadow-md">
                  {formData._id ? 'Update Buyer' : 'Save Buyer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Buyer Loads Modal */}
      {loadsModalOpen && selectedBuyer && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Load History for {selectedBuyer.name}</h2>
                <div className="flex items-center gap-3 mt-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Sort Loads By</label>
                    <select 
                      value={sortMode} 
                      onChange={(e) => setSortMode(e.target.value)} 
                      className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium"
                    >
                      <option value="date_desc">Date: Newest First</option>
                      <option value="date_asc">Date: Oldest First</option>
                      <option value="quantity_desc">Quantity: Highest First</option>
                      <option value="value_desc">Total Value: Highest First</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="text-xs font-semibold text-slate-500 uppercase">Total Load Value</div>
                    <div className="font-bold text-slate-800">₹{Number(loadTotals.totalValue || 0).toLocaleString()}</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="text-xs font-semibold text-slate-500 uppercase">Total Tons</div>
                    <div className="font-bold text-slate-800">{Number(loadTotals.totalTons || 0).toLocaleString()} tons</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="text-xs font-semibold text-slate-500 uppercase">Total Units</div>
                    <div className="font-bold text-slate-800">{Number(loadTotals.totalUnits || 0).toLocaleString()} units</div>
                  </div>
                </div>
              </div>
              <button onClick={() => setLoadsModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-auto min-h-0">
              {loadsLoading ? (
                <div className="p-8 text-center text-slate-500">Loading loads...</div>
              ) : sortedLoads.length === 0 ? (
                <div className="p-8 text-center text-slate-500">No loads found for this buyer.</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-sm text-slate-600 uppercase tracking-wider">
                    <tr>
                      <th className="p-4 font-semibold">Date</th>
                      <th className="p-4 font-semibold">Vehicle Type</th>
                      <th className="p-4 font-semibold">Quarry Name</th>
                      <th className="p-4 font-semibold text-right">Price (₹)</th>
                      <th className="p-4 font-semibold text-right">Quantity</th>
                      <th className="p-4 font-semibold text-right">Total Value (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedLoads.map((load) => {
                      const { date } = formatDateTime(load.date);
                      return (
                        <tr key={load._id} className="hover:bg-slate-50">
                          <td className="p-4 text-slate-600 whitespace-nowrap">{date}</td>
                          <td className="p-4 text-slate-800 font-medium">{load.vehicleType}</td>
                          <td className="p-4 text-slate-600">{load.quarryName}</td>
                          <td className="p-4 text-right text-slate-600">₹{load.price.toLocaleString()}</td>
                          <td className="p-4 text-right text-slate-600 font-mono">{load.quantity} <span className="text-xs text-slate-400 font-sans">{load.unitType}</span></td>
                          <td className="p-4 text-right text-slate-800 font-bold">₹{(load.price * load.quantity).toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end">
              <button onClick={() => setLoadsModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg font-medium">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Buyers;
