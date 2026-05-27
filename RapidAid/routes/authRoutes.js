const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../firebase');
const { collection, getDocs, query, where, addDoc } = require('firebase/firestore');

// Middleware to redirect logged in users
const redirectIfLoggedIn = (req, res, next) => {
    if (req.session.userId) {
        const requestedRole = req.query.role;
        if (requestedRole && requestedRole !== req.session.role) {
            req.session.destroy(() => {
                next();
            });
            return;
        }
        if (req.session.role === 'user') return res.redirect('/user/dashboard');
        if (req.session.role === 'ambulance') return res.redirect('/ambulance/dashboard');
    }
    next();
};

// Landing Page
router.get('/', redirectIfLoggedIn, (req, res) => {
    res.render('index');
});

// Login Page
router.get('/login', redirectIfLoggedIn, (req, res) => {
    const role = req.query.role || 'user';
    res.render('login', { role, error: null });
});

// Login POST
router.post('/login', async (req, res) => {
    const { email, password, role } = req.body;
    try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', email), where('role', '==', role));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            return res.render('login', { role, error: 'Invalid credentials or wrong role selected.' });
        }
        
        const userDoc = querySnapshot.docs[0];
        const user = userDoc.data();
        user._id = userDoc.id;
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.render('login', { role, error: 'Invalid credentials.' });
        }

        // Set session
        req.session.userId = user._id;
        req.session.name = user.name;
        req.session.role = user.role;
        
        if (role === 'user') return res.redirect('/user/dashboard');
        return res.redirect('/ambulance/dashboard');
    } catch (err) {
        console.error(err);
        res.render('login', { role, error: 'Server error. Please try again later.' });
    }
});

// Signup Page
router.get('/signup', redirectIfLoggedIn, (req, res) => {
    const role = req.query.role || 'user';
    res.render('signup', { role, error: null });
});

// Signup POST
router.post('/signup', async (req, res) => {
    const { name, email, password, role } = req.body;
    try {
        if (!name || !email || !password) {
            return res.render('signup', { role, error: 'All fields are required.' });
        }

        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', email));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            return res.render('signup', { role, error: 'Email already exists.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const userData = {
            name,
            email,
            password: hashedPassword,
            role,
            rejectedRequests: [],
            createdAt: new Date().toISOString()
        };

        await addDoc(usersRef, userData);
        res.redirect(`/login?role=${role}`);
    } catch (err) {
        console.error("Signup Error:", err);
        res.render('signup', { role, error: 'Server error. Please try again later.' });
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

module.exports = router;
