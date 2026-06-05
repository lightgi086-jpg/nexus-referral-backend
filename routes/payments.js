const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authMiddleware } = require('../middleware/auth');

const MEMBERSHIP_FEE = parseFloat(process.env.MEMBERSHIP_FEE || 15);
const LEVEL1_COMMISSION = parseFloat(process.env.LEVEL1_COMMISSION || 2);
const LEVEL2_COMMISSION = parseFloat(process.env.LEVEL2_COMMISSION || 1);

const RANKS = [{ name: 'Starter', min: 0 }, { name: 'Bronze', min: 5 }, { name: 'Silver', min: 15 }, { name: 'Gold', min: 30 }, { name: 'Platinum', min: 50 }];

function getRank(directReferrals) {
  let rank = 'Starter';
  for (const r of RANKS) { if (directReferrals >= r.min) rank = r.name; }
  return rank;
}

async function distributeCommissions(newUserId) {
  const { data: newUser } = await supabase.from('users').select('id, level1_referrer, level2_referrer').eq('id', newUserId).single();
  if (newUser.level1_referrer) {
    const referrerId = newUser.level1_referrer;
    const { data: wallet } = await supabase.from('wallets').select('balance, total_earnings, direct_referral_earnings').eq('user_id', referrerId).single();
    await supabase.from('wallets').update({ balance: wallet.balance + LEVEL1_COMMISSION, total_earnings: wallet.total_earnings + LEVEL1_COMMISSION, direct_referral_earnings: wallet.direct_referral_earnings + LEVEL1_COMMISSION }).eq('user_id', referrerId);
    await supabase.from('commissions').insert({ earner_id: referrerId, from_user_id: newUserId, level: 1, amount: LEVEL1_COMMISSION });
    await supabase.from('notifications').insert({ user_id: referrerId, title: 'Commission Earned!', message: `You earned $${LEVEL1_COMMISSION} from a direct referral.`, type: 'commission' });
    const { count: directCount } = await supabase.from('users').select('id', { count: 'exact' }).eq('level1_referrer', referrerId).eq('is_active', true);
    const { data: referrerUser } = await supabase.from('users').select('rank').eq('id', referrerId).single();
    const newRank = getRank(directCount || 0);
    if (newRank !== referrerUser.rank) {
      await supabase.from('users').update({ rank: newRank }).eq('id', referrerId);
      await supabase.from('rank_history').insert({ user_id: referrerId, old_rank: referrerUser.rank, new_rank: newRank });
      await supabase.from('notifications').insert({ user_id: referrerId, title: 'Rank Upgrade!', message: `You have been upgraded to ${newRank}!`, type: 'rank_upgrade' });
    }
  }
  if (newUser.level2_referrer) {
    const referrer2Id = newUser.level2_referrer;
    const { data: wallet2 } = await supabase.from('wallets').select('balance, total_earnings, indirect_referral_earnings').eq('user_id', referrer2Id).single();
    await supabase.from('wallets').update({ balance: wallet2.balance + LEVEL2_COMMISSION, total_earnings: wallet2.total_earnings + LEVEL2_COMMISSION, indirect_referral_earnings: wallet2.indirect_referral_earnings + LEVEL2_COMMISSION }).eq('user_id', referrer2Id);
    await supabase.from('commissions').insert({ earner_id: referrer2Id, from_user_id: newUserId, level: 2, amount: LEVEL2_COMMISSION });
    await supabase.from('notifications').insert({ user_id: referrer2Id, title: 'Indirect Commission!', message: `You earned $${LEVEL2_COMMISSION} from an indirect referral.`, type: 'commission' });
  }
}

router.post('/confirm', authMiddleware, async (req, res) => {
  try {
    const { user_id } = req.body;
    const targetUserId = user_id || req.user.id;
    await supabase.from('payments').insert({ user_id: targetUserId, amount: MEMBERSHIP_FEE, payment_type: 'membership', payment_reference: `MANUAL-${Date.now()}`, payment_gateway: 'manual', status: 'completed' });
    await supabase.from('users').update({ is_active: true }).eq('id', targetUserId);
    await distributeCommissions(targetUserId);
    await supabase.from('notifications').insert({ user_id: targetUserId, title: 'Account Activated!', message: 'Your payment has been confirmed and your account is now active.', type: 'commission' });
    res.json({ message: 'Payment confirmed and account activated' });
  } catch (err) {
    res.status(500).json({ error: 'Payment confirmation failed' });
  }
});

router.get('/my-payments', authMiddleware, async (req, res) => {
  try {
    const { data } = await supabase.from('payments').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
    res.json({ payments: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

module.exports = router;
