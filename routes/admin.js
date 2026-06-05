const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { adminMiddleware } = require('../middleware/auth');

router.get('/stats', adminMiddleware, async (req, res) => {
  try {
    const { count: totalUsers } = await supabase.from('users').select('id', { count: 'exact' });
    const { count: activeUsers } = await supabase.from('users').select('id', { count: 'exact' }).eq('is_active', true);
    const { count: pendingWithdrawals } = await supabase.from('withdrawals').select('id', { count: 'exact' }).eq('status', 'pending');
    const { data: commissionSum } = await supabase.from('commissions').select('amount');
    const totalCommissions = (commissionSum || []).reduce((s, c) => s + parseFloat(c.amount), 0);
    const { data: paymentSum } = await supabase.from('payments').select('amount').eq('status', 'completed');
    const totalRevenue = (paymentSum || []).reduce((s, p) => s + parseFloat(p.amount), 0);
    res.json({ total_users: totalUsers, active_users: activeUsers, pending_withdrawals: pendingWithdrawals, total_commissions_paid: totalCommissions.toFixed(2), total_revenue: totalRevenue.toFixed(2) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

router.get('/users', adminMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    let query = supabase.from('users').select('id, full_name, email, phone, membership_id, rank, is_active, is_suspended, referral_code, created_at', { count: 'exact' }).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,membership_id.ilike.%${search}%`);
    const { data, count } = await query;
    res.json({ users: data, total: count, page, limit });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.patch('/users/:id/activate', adminMiddleware, async (req, res) => {
  try {
    await supabase.from('users').update({ is_active: true }).eq('id', req.params.id);
    res.json({ message: 'User activated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to activate user' });
  }
});

router.patch('/users/:id/suspend', adminMiddleware, async (req, res) => {
  try {
    await supabase.from('users').update({ is_suspended: !!req.body.suspend }).eq('id', req.params.id);
    res.json({ message: 'User updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.get('/withdrawals', adminMiddleware, async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const { data } = await supabase.from('withdrawals').select('*, user:user_id(full_name, email, membership_id)').eq('status', status).order('requested_at', { ascending: false });
    res.json({ withdrawals: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch withdrawals' });
  }
});

router.patch('/withdrawals/:id/approve', adminMiddleware, async (req, res) => {
  try {
    const { data: withdrawal } = await supabase.from('withdrawals').select('*').eq('id', req.params.id).single();
    if (!withdrawal || withdrawal.status !== 'pending') return res.status(400).json({ error: 'Not found or already processed' });
    await supabase.from('withdrawals').update({ status: 'approved', processed_at: new Date().toISOString() }).eq('id', req.params.id);
    await supabase.from('notifications').insert({ user_id: withdrawal.user_id, title: 'Withdrawal Approved!', message: `Your withdrawal of $${withdrawal.amount} has been approved.`, type: 'withdrawal' });
    res.json({ message: 'Withdrawal approved' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve withdrawal' });
  }
});

router.patch('/withdrawals/:id/reject', adminMiddleware, async (req, res) => {
  try {
    const { data: withdrawal } = await supabase.from('withdrawals').select('*').eq('id', req.params.id).single();
    if (!withdrawal || withdrawal.status !== 'pending') return res.status(400).json({ error: 'Not found or already processed' });
    const { data: wallet } = await supabase.from('wallets').select('balance').eq('user_id', withdrawal.user_id).single();
    await supabase.from('wallets').update({ balance: wallet.balance + withdrawal.amount }).eq('user_id', withdrawal.user_id);
    await supabase.from('withdrawals').update({ status: 'rejected', processed_at: new Date().toISOString(), admin_note: req.body.note || 'Rejected' }).eq('id', req.params.id);
    await supabase.from('notifications').insert({ user_id: withdrawal.user_id, title: 'Withdrawal Rejected', message: `Your withdrawal of $${withdrawal.amount} was rejected. Funds returned.`, type: 'withdrawal' });
    res.json({ message: 'Withdrawal rejected' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject withdrawal' });
  }
});

module.exports = router;
