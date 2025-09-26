// routes/eventRsvp.routes.js
import express from "express";
import { createOrUpdateRsvp, getEventRsvps } from "../controllers/eventRsvp.controller.js";
// import authMiddleware from "../middleware/auth.js"; // if you have one

const router = express.Router();

// RSVP to an event
router.post("/:eventId/rsvp", /* authMiddleware, */ createOrUpdateRsvp);

// Get all RSVPs for an event
router.get("/:eventId/rsvp", getEventRsvps);

export default router;
