'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/utils/supabase';

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
  balance: number;
  created_at: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  status: string;
  issue_date: string;
  due_date: string;
  total: number;
}

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Customer>>({});

  useEffect(() => {
    loadCustomer();
  }, [params.id]);

  const loadCustomer = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Load customer
    const { data: customerData, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', session.user.id)
      .single();

    if (error || !customerData) {
      router.push('/dashboard/customers');
      return;
    }

    setCustomer(customerData);
    setFormData(customerData);

    // Load invoices for this customer
    const { data: invoicesData } = await supabase
      .from('invoices')
      .select('*')
      .eq('customer_id', params.id)
      .order('issue_date', { ascending: false });

    setInvoices(invoicesData || []);
    setLoading(false);
  };

  const handleSave = async () => {
    const { error } = await supabase
      .from('customers')
      .update(formData)
      .eq('id', params.id);

    if (!error) {
      setCustomer({ ...customer, ...formData } as Customer);
      setEditing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this customer? This cannot be undone.')) return;

    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', params.id);

    if (!error) {
      router.push('/dashboard/customers');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-700',
      sent: 'bg-blue-100 text-blue-700',
      paid: 'bg-green-100 text-green-700',
      overdue: 'bg-red-100 text-red-700',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.draft}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!customer) return null;

  const totalInvoiced = invoices.reduce((sum, i) => sum + (i.total || 0), 0);
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + (i.total || 0), 0);
  const outstanding = invoices.filter(i => i.status !== 'paid' && i.status !== 'draft').reduce((sum, i) => sum + (i.total || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/customers" className="p-2 hover:bg-gray-100 rounded-lg">
            <svg className="w-5 h-5 text-corporate-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 bg-primary-100 rounded-full flex items-center justify-center">
              <span className="text-primary-600 font-bold text-xl">{customer.name.charAt(0)}</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-corporate-dark">{customer.name}</h1>
              <p className="text-corporate-gray">{customer.company || customer.email}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/dashboard/invoices/new?customer=${customer.id}`}
            className="btn-primary flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Invoice
          </Link>
          <button
            onClick={() => setEditing(!editing)}
            className="btn-secondary"
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="stat-card">
          <p className="text-sm text-corporate-gray">Total Invoiced</p>
          <p className="text-xl font-bold text-corporate-dark">{formatCurrency(totalInvoiced)}</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-corporate-gray">Total Paid</p>
          <p className="text-xl font-bold text-green-600">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-corporate-gray">Outstanding</p>
          <p className="text-xl font-bold text-amber-600">{formatCurrency(outstanding)}</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-corporate-gray">Invoices</p>
          <p className="text-xl font-bold text-corporate-dark">{invoices.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer Details */}
        <div className="card">
          <h2 className="text-lg font-semibold text-corporate-dark mb-4">Contact Information</h2>
          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="label">Name</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label">Company</label>
                <input
                  type="text"
                  value={formData.company || ''}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label">Phone</label>
                <input
                  type="tel"
                  value={formData.phone || ''}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label">Address</label>
                <input
                  type="text"
                  value={formData.address || ''}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="input-field"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="City"
                  value={formData.city || ''}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="input-field"
                />
                <input
                  type="text"
                  placeholder="State"
                  value={formData.state || ''}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="input-field"
                />
                <input
                  type="text"
                  placeholder="ZIP"
                  value={formData.zip || ''}
                  onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                  className="input-field"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={handleSave} className="btn-primary flex-1">Save</button>
                <button onClick={handleDelete} className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg">Delete</button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {customer.email && (
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-corporate-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <a href={`mailto:${customer.email}`} className="text-primary-600 hover:underline">{customer.email}</a>
                </div>
              )}
              {customer.phone && (
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-corporate-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <a href={`tel:${customer.phone}`} className="text-corporate-slate">{customer.phone}</a>
                </div>
              )}
              {(customer.address || customer.city) && (
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-corporate-gray mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <div className="text-corporate-slate">
                    {customer.address && <p>{customer.address}</p>}
                    <p>{[customer.city, customer.state, customer.zip].filter(Boolean).join(', ')}</p>
                  </div>
                </div>
              )}
              <div className="pt-2 text-xs text-corporate-gray">
                Customer since {new Date(customer.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </div>
            </div>
          )}
        </div>

        {/* Invoice History */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-corporate-dark">Invoice History</h2>
            <Link href={`/dashboard/invoices/new?customer=${customer.id}`} className="text-primary-600 hover:text-primary-700 text-sm font-medium">
              + New Invoice
            </Link>
          </div>
          {invoices.length === 0 ? (
            <p className="text-corporate-gray text-center py-8">No invoices yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>
                        <Link href={`/dashboard/invoices/${invoice.id}`} className="text-primary-600 hover:underline font-medium">
                          {invoice.invoice_number}
                        </Link>
                      </td>
                      <td className="text-corporate-slate">{new Date(invoice.issue_date).toLocaleDateString()}</td>
                      <td className="text-corporate-slate">{new Date(invoice.due_date).toLocaleDateString()}</td>
                      <td>{getStatusBadge(invoice.status)}</td>
                      <td className="text-right font-semibold">{formatCurrency(invoice.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
