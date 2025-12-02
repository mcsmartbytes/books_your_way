'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const categories = [
  'Office Expenses',
  'Software',
  'Marketing',
  'Insurance',
  'Utilities',
  'Rent',
  'Professional Services',
  'Equipment',
  'Travel',
  'Other',
];

export default function NewBillPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    vendor_name: '',
    vendor_email: '',
    bill_number: '',
    bill_date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    category: '',
    amount: '',
    description: '',
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent, status: 'draft' | 'unpaid') => {
    e.preventDefault();
    setLoading(true);

    // In production, save to Supabase
    console.log('Creating bill:', { ...formData, status });

    setTimeout(() => {
      router.push('/dashboard/bills');
    }, 500);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-corporate-dark">New Bill</h1>
          <p className="text-corporate-gray mt-1">Record a new vendor bill</p>
        </div>
        <Link href="/dashboard/bills" className="btn-secondary">
          Cancel
        </Link>
      </div>

      <form onSubmit={(e) => handleSubmit(e, 'unpaid')} className="space-y-6">
        {/* Vendor info */}
        <div className="card">
          <h2 className="text-lg font-semibold text-corporate-dark mb-4">Vendor Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="label">Vendor Name *</label>
              <input
                type="text"
                required
                value={formData.vendor_name}
                onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })}
                className="input-field"
                placeholder="Office Supplies Co"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="label">Vendor Email</label>
              <input
                type="email"
                value={formData.vendor_email}
                onChange={(e) => setFormData({ ...formData, vendor_email: e.target.value })}
                className="input-field"
                placeholder="billing@vendor.com"
              />
            </div>
          </div>
        </div>

        {/* Bill details */}
        <div className="card">
          <h2 className="text-lg font-semibold text-corporate-dark mb-4">Bill Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Bill Number</label>
              <input
                type="text"
                value={formData.bill_number}
                onChange={(e) => setFormData({ ...formData, bill_number: e.target.value })}
                className="input-field"
                placeholder="INV-12345"
              />
            </div>
            <div>
              <label className="label">Category *</label>
              <select
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="input-field"
              >
                <option value="">Select category</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Bill Date *</label>
              <input
                type="date"
                required
                value={formData.bill_date}
                onChange={(e) => setFormData({ ...formData, bill_date: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="label">Due Date *</label>
              <input
                type="date"
                required
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                className="input-field"
              />
            </div>
            <div className="col-span-2">
              <label className="label">Amount *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-corporate-gray">$</span>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="input-field pl-8"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="col-span-2">
              <label className="label">Description</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="input-field"
                placeholder="Brief description of the bill"
              />
            </div>
            <div className="col-span-2">
              <label className="label">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="input-field"
                rows={3}
                placeholder="Any additional notes..."
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            type="button"
            onClick={(e) => handleSubmit(e as unknown as React.FormEvent, 'draft')}
            disabled={loading}
            className="flex-1 btn-secondary disabled:opacity-50"
          >
            Save as Draft
          </button>
          <button
            type="submit"
            disabled={loading || !formData.vendor_name || !formData.category || !formData.amount}
            className="flex-1 btn-primary disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Bill'}
          </button>
        </div>
      </form>
    </div>
  );
}
