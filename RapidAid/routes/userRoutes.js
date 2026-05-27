const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const { collection, getDocs, getDoc, doc, query, where, addDoc, orderBy } = require('firebase/firestore');

// Middleware to check if user is logged in and has role 'user'
const requireUser = (req, res, next) => {
    if (!req.session.userId || req.session.role !== 'user') {
        return res.redirect('/login?role=user');
    }
    next();
};

router.use(requireUser);

// User Dashboard
router.get('/dashboard', async (req, res) => {
    try {
        const requestsRef = collection(db, 'emergencyRequests');
        
        // Active Requests
        const activeQ = query(
            requestsRef, 
            where('createdBy', '==', req.session.userId),
            where('status', 'in', ['pending', 'accepted'])
        );
        const activeSnap = await getDocs(activeQ);
        let activeRequests = activeSnap.docs.map(doc => ({ _id: doc.id, ...doc.data() }));
        activeRequests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // History Requests
        const historyQ = query(
            requestsRef, 
            where('createdBy', '==', req.session.userId),
            where('status', 'in', ['completed', 'reached', 'rejected'])
        );
        const historySnap = await getDocs(historyQ);
        let historyRequests = historySnap.docs.map(doc => ({ _id: doc.id, ...doc.data() }));
        historyRequests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.render('user/dashboard', { activeRequests, historyRequests });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Report Accident Page
router.get('/report', (req, res) => {
    res.render('user/report');
});

// Submit Emergency POST
router.post('/report', async (req, res) => {
    try {
        const { patientName, phone, injuredCount, lat, lng } = req.body;
        
        const newRequest = {
            patientName,
            phone,
            injuredCount: parseInt(injuredCount),
            location: {
                lat: parseFloat(lat),
                lng: parseFloat(lng)
            },
            status: 'pending',
            createdBy: req.session.userId,
            createdAt: new Date().toISOString()
        };

        await addDoc(collection(db, 'emergencyRequests'), newRequest);
        res.redirect('/user/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Request Details Page
router.get('/request/:id', async (req, res) => {
    try {
        const docRef = doc(db, 'emergencyRequests', req.params.id);
        const docSnap = await getDoc(docRef);
        
        if (!docSnap.exists() || docSnap.data().createdBy !== req.session.userId) {
            return res.status(404).send('Request not found');
        }
        
        const emergencyRequest = { _id: docSnap.id, ...docSnap.data() };
        res.render('user/requestDetails', { emergencyRequest });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Nova Assistant Interface Redirect
router.get('/nova', (req, res) => {
    res.redirect('/nova/');
});

// Nova Secure AI Chat Proxy (calls Google Gemini API)
router.post('/nova/chat', async (req, res) => {
    try {
        const { messages } = req.body;
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Messages array is required' });
        }

        // Format history for Gemini API
        // Gemini expects: { contents: [ { role: 'user'|'model', parts: [ { text: '...' } ] } ] }
        const contents = messages.map(msg => ({
            role: msg.role === 'nova' ? 'model' : 'user',
            parts: [{ text: msg.text }]
        }));

        const systemInstruction = `You are NOVA, a real-time emergency voice companion from RapidAid. Stay with the user until help (the ambulance) arrives.
Tone: Extremely supportive, empathetic, calm, and reassuring.
Guidelines:
1. Ask only ONE question at a time to avoid overwhelming them.
2. Automatically detect their language (Hindi, Hinglish, Marathi, English) and reply in the same language. Never force English.
3. First Aid Guidance:
   - Heavy bleeding: Apply firm pressure using a clean cloth.
   - Fracture: Do not move the injured area. Keep it stable.
   - Burn: Cool using clean water for 10+ minutes. No ice.
   - Head injury: Keep the person still.
   - Unconscious but breathing: Airway clear, head tilted back slightly.
   - Chest pain: Seated semi-upright, comfortable.
   - Breathing issue: Keep calm, loosen tight clothing.
   - Scared user: "Help is on the way. Stay with me. Take deep breaths."
4. Onboarding: If they haven't submitted a report, tell them to do so first and list the 6 steps (Report Accident, Patient Name, Contact, Injured Count, Location, Submit).
5. Continuous flow: Do not stop after one response. Keep checking in on their condition.`;

        const geminiKey = process.env.VITE_GEMINI_API_KEY;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;

        const payload = {
            contents: contents,
            systemInstruction: {
                parts: [{ text: systemInstruction }]
            },
            generationConfig: {
                maxOutputTokens: 150,
                temperature: 0.7
            }
        };

        const geminiRes = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!geminiRes.ok) {
            const errText = await geminiRes.text();
            console.error('Gemini API Error:', errText);
            throw new Error(`Gemini API responded with status ${geminiRes.status}`);
        }

        const data = await geminiRes.json();
        const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!replyText) {
            throw new Error('Invalid response structure from Gemini API');
        }

        res.json({ reply: replyText.trim() });
    } catch (err) {
        console.error('Gemini Proxy Error:', err.message);
        res.status(500).json({ error: 'Gemini service unavailable. Activating local fallback.' });
    }
});

module.exports = router;

