const express = require('express');

const session = require('express-session');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// EJS Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session Config
app.use(session({
    secret: process.env.SESSION_SECRET || 'rapidaid_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

// Global variables for views
app.use((req, res, next) => {
    res.locals.user = req.session.userId ? { id: req.session.userId, name: req.session.name, role: req.session.role } : null;
    next();
});

// Firebase Database Connection is initialized in firebase.js
require('./firebase');

// Routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const ambulanceRoutes = require('./routes/ambulanceRoutes');

app.use('/', authRoutes);
app.use('/user', userRoutes);
app.use('/ambulance', ambulanceRoutes);

// Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
