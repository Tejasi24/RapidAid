const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const { collection, getDocs, getDoc, doc, updateDoc, query, where } = require('firebase/firestore');

// Haversine distance formula to calculate distance in km
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in km
}

// Middleware to check if user is logged in and has role 'ambulance'
const requireAmbulance = (req, res, next) => {
    if (!req.session.userId || req.session.role !== 'ambulance') {
        return res.redirect('/login?role=ambulance');
    }
    next();
};

router.use(requireAmbulance);

// Ambulance Dashboard
router.get('/dashboard', async (req, res) => {
    try {
        const userDocRef = doc(db, 'users', req.session.userId);
        const userDoc = await getDoc(userDocRef);
        const ambulance = userDoc.data();
        const rejectedRequests = ambulance.rejectedRequests || [];

        const requestsRef = collection(db, 'emergencyRequests');
        
        // Incoming nearby requests (all pending excluding rejected by this ambulance)
        const pendingQ = query(requestsRef, where('status', '==', 'pending'));
        const pendingSnap = await getDocs(pendingQ);
        let incomingRequests = pendingSnap.docs
            .map(d => ({ _id: d.id, ...d.data() }))
            .filter(req => !rejectedRequests.includes(req._id));
            
        // Geolocation filtering
        const providerLocation = req.session.location || ambulance.lastKnownLocation || null;
        if (!req.session.location && ambulance.lastKnownLocation) {
            req.session.location = ambulance.lastKnownLocation;
        }

        if (providerLocation && providerLocation.lat && providerLocation.lng) {
            incomingRequests = incomingRequests.map(request => {
                const distance = getDistance(
                    providerLocation.lat,
                    providerLocation.lng,
                    request.location.lat,
                    request.location.lng
                );
                return { ...request, distance };
            }).filter(request => request.distance <= 30);
            
            // Sort by closest distance
            incomingRequests.sort((a, b) => a.distance - b.distance);
        } else {
            incomingRequests = [];
        }

        // History (accepted or completed by this ambulance)
        const historyQ = query(requestsRef, where('acceptedBy', '==', req.session.userId));
        const historySnap = await getDocs(historyQ);
        let historyRequests = historySnap.docs.map(d => ({ _id: d.id, ...d.data() }));
        historyRequests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.render('ambulance/dashboard', { 
            incomingRequests, 
            historyRequests, 
            providerLocation 
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Update Ambulance Provider Location
router.post('/update-location', async (req, res) => {
    try {
        const { lat, lng } = req.body;
        if (!lat || !lng) {
            return res.status(400).json({ success: false, message: 'Latitude and Longitude are required' });
        }

        const latitude = parseFloat(lat);
        const longitude = parseFloat(lng);

        if (isNaN(latitude) || isNaN(longitude)) {
            return res.status(400).json({ success: false, message: 'Invalid coordinates' });
        }

        const oldLocation = req.session.location;
        let reload = false;

        // If location is not in session, or distance has changed by >= 50 meters
        if (!oldLocation) {
            reload = true;
        } else {
            const distanceMoved = getDistance(oldLocation.lat, oldLocation.lng, latitude, longitude) * 1000; // in meters
            if (distanceMoved >= 50) {
                reload = true;
            }
        }

        // Save in session
        req.session.location = { lat: latitude, lng: longitude };

        // Save in database
        const userDocRef = doc(db, 'users', req.session.userId);
        await updateDoc(userDocRef, {
            lastKnownLocation: { lat: latitude, lng: longitude }
        });

        res.json({ success: true, reload });
    } catch (err) {
        console.error('Error updating location:', err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Accept Request POST
router.post('/accept/:id', async (req, res) => {
    try {
        const reqRef = doc(db, 'emergencyRequests', req.params.id);
        const reqSnap = await getDoc(reqRef);
        
        if (reqSnap.exists() && reqSnap.data().status === 'pending') {
            await updateDoc(reqRef, {
                status: 'accepted',
                acceptedBy: req.session.userId
            });
        }
        res.redirect(`/ambulance/tracking/${req.params.id}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Reject Request POST
router.post('/reject/:id', async (req, res) => {
    try {
        const userDocRef = doc(db, 'users', req.session.userId);
        const userDoc = await getDoc(userDocRef);
        let rejectedRequests = userDoc.data().rejectedRequests || [];
        
        if (!rejectedRequests.includes(req.params.id)) {
            rejectedRequests.push(req.params.id);
            await updateDoc(userDocRef, { rejectedRequests });
        }
        res.redirect('/ambulance/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Helper to fetch real hospitals from Overpass API based on accident coordinates
async function getRealNearbyHospitals(lat, lng) {
    const fallbackHospitals = [
        { name: "City General Hospital", lat: lat + 0.01, lng: lng + 0.01 },
        { name: "Metro Care Center", lat: lat - 0.015, lng: lng + 0.005 },
        { name: "Sunrise Medical", lat: lat + 0.008, lng: lng - 0.012 },
        { name: "Apex Trauma Center", lat: lat - 0.005, lng: lng - 0.015 },
        { name: "St. Mary's Clinic", lat: lat + 0.012, lng: lng - 0.004 }
    ];

    try {
        const query = `[out:json][timeout:15];
(
  node["amenity"="hospital"](around:5000, ${lat}, ${lng});
  way["amenity"="hospital"](around:5000, ${lat}, ${lng});
  relation["amenity"="hospital"](around:5000, ${lat}, ${lng});
);
out center;`;

        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: "data=" + encodeURIComponent(query),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'RapidAidEmergencyAssistant/1.0 (https://rapidaid.org; contact@rapidaid.org)',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Overpass API responded with status ${response.status}`);
        }

        const data = await response.json();
        
        if (data && data.elements && data.elements.length > 0) {
            const hospitals = data.elements
                .map(el => {
                    const name = el.tags.name || el.tags["name:en"] || el.tags.brand || el.tags.operator || "Local Hospital";
                    const hLat = el.lat || (el.center && el.center.lat);
                    const hLng = el.lon || (el.center && el.center.lon);
                    return { name, lat: hLat, lng: hLng };
                })
                .filter(h => h.lat && h.lng && h.name !== "Local Hospital");

            // Filter out duplicate names
            const uniqueHospitals = [];
            const seenNames = new Set();
            for (const h of hospitals) {
                if (!seenNames.has(h.name)) {
                    seenNames.add(h.name);
                    uniqueHospitals.push(h);
                }
            }

            // Calculate simple distance and sort by closest
            const getDistance = (h) => {
                return Math.sqrt(Math.pow(h.lat - lat, 2) + Math.pow(h.lng - lng, 2));
            };
            uniqueHospitals.sort((a, b) => getDistance(a) - getDistance(b));

            if (uniqueHospitals.length > 0) {
                return uniqueHospitals.slice(0, 5);
            }
        }
    } catch (err) {
        console.error("Failed to fetch real-time hospitals from Overpass API:", err.message);
    }
    
    return fallbackHospitals;
}

// Tracking Page
router.get('/tracking/:id', async (req, res) => {
    try {
        const reqRef = doc(db, 'emergencyRequests', req.params.id);
        const reqSnap = await getDoc(reqRef);
        
        if (!reqSnap.exists() || reqSnap.data().acceptedBy !== req.session.userId || !['accepted', 'reached', 'completed'].includes(reqSnap.data().status)) {
            return res.redirect('/ambulance/dashboard');
        }
        
        const emergencyRequest = { _id: reqSnap.id, ...reqSnap.data() };

        // Fetch real nearby hospitals from OSM Overpass API or get fallback
        const nearestHospitals = await getRealNearbyHospitals(emergencyRequest.location.lat, emergencyRequest.location.lng);

        res.render('ambulance/tracking', { emergencyRequest, nearestHospitals });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Reached Patient POST
router.post('/reached/:id', async (req, res) => {
    try {
        const reqRef = doc(db, 'emergencyRequests', req.params.id);
        const reqSnap = await getDoc(reqRef);
        
        if (!reqSnap.exists() || reqSnap.data().acceptedBy !== req.session.userId || reqSnap.data().status !== 'accepted') {
            return res.status(404).json({ success: false, message: 'Request not found or already reached' });
        }
        
        await updateDoc(reqRef, { status: 'reached' });
        res.json({ success: true, status: 'reached' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Complete Emergency POST
router.post('/complete/:id', async (req, res) => {
    try {
        const { hospitalName } = req.body;
        const reqRef = doc(db, 'emergencyRequests', req.params.id);
        const reqSnap = await getDoc(reqRef);
        
        if (reqSnap.exists() && reqSnap.data().acceptedBy === req.session.userId) {
            await updateDoc(reqRef, {
                status: 'completed',
                hospitalAdmitted: hospitalName
            });
        }
        
        res.redirect('/ambulance/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
