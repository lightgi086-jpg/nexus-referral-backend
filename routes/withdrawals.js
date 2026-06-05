const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authMiddleware } = require('../middleware/auth');

router.post('/request', authMiddleware, async (req, res) => {
  try {
    const { amount, bank_name, account_number, account_name } = req.body;
    const userId = req.user.id;
    if (!amount || !bank_name || !account_number || !account_name) return res.status(400).json({ error: 'All fields are required' });
    if (amount < 5) return res.status(400).json({ error: 'Minimum withdrawal is $5' });
    const { data: wallet } = await supabase.from('wallets').select('balance').eq('user_id', userId).single();
    if (!wallet || wallet.balance < amount) return res.status(400).json({ error: 'Insufficient balance' });
    await supabase.from('wallets').update({ balance: wallet.balance - amount }).eq('user_id', userId);
    const { data: withdrawal } = await supabase.from('withdrawals').insert({ user_id: userId, amount, bank_name, account_number, account_name }).select().single();
    await supabase.from('notifications').insert({ user_id: userId, title: 'Withdrawal Requested', message: `Your withdrawal of $${amount} is under review.`, type: 'withdrawal' });
    res.status(201).json({ message: 'Withdrawal request submitted', withdrawal });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit withdrawal' });
  }
});

router.get('/my-withdrawals', authMiddleware, async (req, res) => {
  try {
    const { data } = await supabase.from('withdrawals').select('*').eq('user_id', req.user.id).order('requested_at', { ascending: false });
    res.json({ withdrawals: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch withdrawals' });
  }
});

module.exports = router;
