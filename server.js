require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const paymentRoutes = require('./routes/payments');
const withdrawalRoutes = require('./routes/withdrawals');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', platform: 'Nexus Referral API' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/admin', adminRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
