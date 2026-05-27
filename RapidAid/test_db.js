const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://delta-student:OC3LinDJBDNNJA8s@cluster0.ncgu6rc.mongodb.net/?appName=Cluster0')
    .then(() => {
        console.log("Connection successful");
        process.exit(0);
    })
    .catch(err => {
        console.error("Connection failed:", err);
        process.exit(1);
    });
