const mongoose = require('mongoose');

const emergencyRequestSchema = new mongoose.Schema({
    patientName: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true
    },
    injuredCount: {
        type: Number,
        required: true
    },
    location: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true }
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'reached', 'completed', 'rejected'],
        default: 'pending'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    acceptedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    hospitalAdmitted: {
        type: String
    }
}, { timestamps: true });

module.exports = mongoose.model('EmergencyRequest', emergencyRequestSchema);
