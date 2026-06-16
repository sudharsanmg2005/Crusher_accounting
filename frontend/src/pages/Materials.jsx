import React, { useState, useEffect } from 'react';
import api from '../api';
import { useConfirm } from '../components/ConfirmDialog';
import { EditIcon, TrashIcon } from '../components/Icons';

const Materials = () => {
  const confirm = useConfirm();
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [formData, setFormData] = useState({ name: '', currentPrice: '', pricePerTon: '' });

  useEffect(() => {
    fetchMaterials();
  }, []);

  const fetchMaterials = async () => {
    try {
      const { data } = await api.get('/materials');
      setMaterials(data);
    } catch (error) {
      console.error('Error fetching materials', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (formData._id) {
        await api.put(`/materials/${formData._id}/price`, { currentPrice: Number(formData.currentPrice), pricePerTon: Number(formData.pricePerTon || formData.currentPrice) });
      } else {
        await api.post('/materials', { name: formData.name, currentPrice: Number(formData.currentPrice), pricePerTon: Number(formData.pricePerTon || formData.currentPrice) });
      }
      setIsModalOpen(false);
      setFormData({ name: '', currentPrice: '', pricePerTon: '' });
      fetchMaterials();
    } catch (error) {
      console.error('Error saving material', error);
      alert('Error saving material');
    }
  };

  const handleEdit = (material) => {
    setFormData({ ...material, currentPrice: material.currentPrice, pricePerTon: material.pricePerTon ?? material.currentPrice });
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    const ok = await confirm({
      title: 'Delete material',
      message: 'Are you sure you want to delete this material?',
      confirmText: 'Delete',
      tone: 'danger'
    });
    if (ok) {
      try {
        await api.delete(`/materials/${id}`);
        fetchMaterials();
      } catch (error) {
        console.error('Error deleting material', error);
        alert('Error deleting material');
      }
    }
  };

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Materials</h1>
          <p className="text-slate-500 text-sm mt-1">Manage crusher materials and unit pricing.</p>
        </div>
        <button 
          onClick={() => { setFormData({ name: '', currentPrice: '', pricePerTon: '' }); setIsModalOpen(true); }}
          className="btn-primary flex items-center shadow-lg hover:shadow-xl w-full sm:w-auto justify-center"
        >
          <span className="mr-2">+</span> Add Material
        </button>
      </div>

      <div className="card overflow-hidden p-0 border border-slate-200 flex-1 flex flex-col min-h-0 min-w-0">
        {loading ? (
           <div className="p-8 text-center text-slate-500">Loading materials...</div>
        ) : materials.length === 0 ? (
           <div className="p-8 text-center text-slate-500 border-t border-slate-100 italic">No materials found. Add your first material!</div>
        ) : (
          <div className="overflow-auto flex-1 min-h-0 min-w-0">
            <table className="data-table">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 shadow-sm z-10 w-full min-w-max">
                <tr className="border-b border-slate-200 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  <th className="p-4 font-semibold w-1/2">Material Name</th>
                  <th className="p-4 font-semibold whitespace-nowrap">Price / Unit (₹)</th>
                  <th className="p-4 font-semibold whitespace-nowrap">Price / Ton (₹)</th>
                  <th className="p-4 font-semibold text-right w-1/4">Actions</th>
                </tr>
              </thead>
              <tbody className="whitespace-nowrap">
                {materials.map((m) => (
                  <tr key={m._id}>
                    <td className="p-4 font-medium text-slate-800">{m.name}</td>
                    <td className="p-4 text-slate-600 font-semibold">₹{m.currentPrice}</td>
                    <td className="p-4 text-slate-600 font-semibold">₹{m.pricePerTon ?? m.currentPrice}</td>
                    <td className="p-4 text-right space-x-2 whitespace-nowrap">
                      <button 
                        onClick={() => handleEdit(m)} 
                        className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-2 rounded-lg transition-colors inline-flex items-center" 
                        title="Edit Price"
                      >
                        <EditIcon className="h-5 w-5" />
                      </button>
                      <button 
                        onClick={() => handleDelete(m._id)} 
                        className="text-red-600 hover:text-red-800 hover:bg-red-50 p-2 rounded-lg transition-colors inline-flex items-center" 
                        title="Delete Material"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold text-slate-800">{formData._id ? 'Update Material Price' : 'Add New Material'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Material Name *</label>
                <input 
                  type="text" name="name" required value={formData.name} onChange={handleChange}
                  disabled={formData._id} // Name cannot be changed once created (based on backend unique constraint usually)
                  className={`w-full border rounded-lg p-2.5 outline-none transition ${formData._id ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed' : 'border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'}`}
                  placeholder="e.g. 20mm Aggregate"
                />
                {formData._id && <p className="text-xs text-slate-500 mt-1">Material name cannot be changed.</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Current Price (per unit) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                  <input 
                    type="number" name="currentPrice" required value={formData.currentPrice} onChange={handleChange} min="0" step="0.01"
                    className="w-full border border-slate-300 rounded-lg p-2.5 pl-8 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                    placeholder="e.g. 500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Price per Ton (₹) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                  <input
                    type="number" name="pricePerTon" required value={formData.pricePerTon} onChange={handleChange} min="0" step="0.01"
                    className="w-full border border-slate-300 rounded-lg p-2.5 pl-8 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                    placeholder="e.g. 1200"
                  />
                </div>
              </div>
              
              <div className="pt-4 flex justify-end space-x-3 border-t border-slate-100 mt-6 shrink-0">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition shadow-md cursor-pointer">
                  {formData._id ? 'Update' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Materials;
