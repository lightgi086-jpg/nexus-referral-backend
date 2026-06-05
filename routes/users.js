const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authMiddleware } = require('../middleware/auth');

router.get('/dashboard', authMiddleware, async (req, res) => {
