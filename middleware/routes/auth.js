const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');

function generateReferralCode(name) {
  const prefix = name.replace(/\s+/g, '').substring(0, 4).toUpperCase();
  const suffix = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `${prefix}${suffix}`;
}

function generateMembershipId() {
  return `NX${Math.floor(10000000 + Math.random() * 90000000)}`;
}

router.post('/register', async (req, res) => {
  try {
    const { full_name, email, phone, password, referral_code } = req.body;
    if (!full_name || !email || !phone || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const { data: existing } = await supabase.from('users').select('id').eq('email', email.toLowerCase()).single();
    if (existing) return res.status(400).json({ error: 'Email already registered' });
    let level1Referrer = null, level2Referrer = null;
    if (referral_code) {
      const { data: referrer } = await supabase.from('users').select('id, level1_referrer').eq('referral_code', referral_code.toUpperCase()).single();
      if (referrer) { level1Referrer = referrer.id; level2Referrer = referrer.level1_referrer || null; }
    }
    const password_hash = await bcrypt.hash(password, 12);
    const { data: newUser, error } = await supabase.from('users').insert({ full_name, email: email.toLowerCase(), phone, password_hash, referral_code: generateReferralCode(full_name), referred_by: level1Referrer, level1_referrer: level1Referrer, level2_referrer: level2Referrer, membership_id: generateMembershipId(), is_active: false }).select('id, full_name, email, referral_code, membership_id, rank, is_active').single();
    if (error) throw error;
    const token = jwt.sign({ id: newUser.id, email: newUser.email, is_admin: false }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ message: 'Registration successful', user: newUser, token });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const { data: user } = await supabase.from('users').select('*').eq('email', email.toLowerCase()).single();
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.is_suspended) return res.status(403).json({ error: 'Account suspended' });
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, email: user.email, is_admin: user.is_admin }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Login successful', token, user: { id: user.id, full_name: user.full_name, email: user.email, referral_code: user.referral_code, membership_id: user.membership_id, rank: user.rank, is_active: user.is_active, is_admin: user.is_admin } });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;
