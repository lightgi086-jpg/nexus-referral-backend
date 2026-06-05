const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authMiddleware } = require('../middleware/auth');

router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { data: user } = await supabase.from('users').select('id, full_name, email, phone, referral_code, membership_id, rank, is_active, created_at').eq('id', userId).single();
    const { data: wallet } = await supabase.from('wallets').select('*').eq('user_id', userId).single();
    const { count: directCount } = await supabase.from('users').select('id', { count: 'exact' }).eq('level1_referrer', userId).eq('is_active', true);
    const { count: indirectCount } = await supabase.from('users').select('id', { count: 'exact' }).eq('level2_referrer', userId).eq('is_active', true);
    const { data: recentCommissions } = await supabase.from('commissions').select('*, from_user:from_user_id(full_name)').eq('earner_id', userId).order('created_at', { ascending: false }).limit(10);
    const { data: notifications } = await supabase.from('notifications').select('*').eq('user_id', userId).eq('is_read', false).order('created_at', { ascending: false }).limit(5);
    const RANKS = [{ name: 'Starter', min: 0, next: 5 }, { name: 'Bronze', min: 5, next: 15 }, { name: 'Silver', min: 15, next: 30 }, { name: 'Gold', min: 30, next: 50 }, { name: 'Platinum', min: 50, next: null }];
    const currentRankData = RANKS.find(r => r.name === user.rank) || RANKS[0];
    const nextRankData = RANKS.find(r => r.min === currentRankData.next);
    const progress = currentRankData.next ? Math.min(((directCount - currentRankData.min) / (currentRankData.next - currentRankData.min)) * 100, 100) : 100;
    res.json({ user, wallet, referrals: { direct: directCount || 0, indirect: indirectCount || 0, total: (directCount || 0) + (indirectCount || 0) }, rank: { current: user.rank, next: nextRankData?.name || 'MAX', progress: Math.round(progress), directNeededForNext: currentRankData.next ? currentRankData.next - (directCount || 0) : 0 }, recent_commissions: recentCommissions || [], notifications: notifications || [], referral_link: `${process.env.FRONTEND_URL}/register?ref=${user.referral_code}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

router.get('/referral-tree', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { data: level1 } = await supabase.from('users').select('id, full_name, email, rank, is_active, created_at').eq('level1_referrer', userId).order('created_at', { ascending: false });
    const level1Ids = (level1 || []).map(u => u.id);
    let level2 = [];
    if (level1Ids.length > 0) {
      const { data: l2 } = await supabase.from('users').select('id, full_name, email, rank, is_active, created_at, level1_referrer').in('level1_referrer', level1Ids);
      level2 = l2 || [];
    }
    const tree = (level1 || []).map(l1User => ({ ...l1User, children: level2.filter(l2User => l2User.level1_referrer === l1User.id) }));
    res.json({ tree, level1_count: level1?.length || 0, level2_count: level2.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load referral tree' });
  }
});

router.get('/notifications', authMiddleware, async (req, res) => {
  try {
    const { data } = await supabase.from('notifications').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(50);
    res.json({ notifications: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

router.patch('/notifications/read-all', authMiddleware, async (req, res) => {
  try {
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', req.user.id);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

router.get('/leaderboard', async (req, res) => {
  try {
    const { data } = await supabase.from('users').select('id, full_name, rank').eq('is_active', true).eq('is_suspended', false).limit(50);
    res.json({ leaderboard: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

module.exports = router;
