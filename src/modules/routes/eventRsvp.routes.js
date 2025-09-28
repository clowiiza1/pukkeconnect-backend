import express from "express";
import prisma from "../../config/prismaClient.js";

const router = express.Router();

// Test route
router.post('/:id/rsvp', (req, res) => {
  res.json({ message: 'Route working!' });
});

// POST /api/events/:id/rsvp (upsert RSVP)
router.post('/:id/rsvp', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { student_number, status } = req.body;

    if (!student_number || !status) {
      return res.status(400).json({ error: 'student_number and status required' });
    }

    const rsvp = await prisma.event_rsvp.upsert({
      where: {
        event_id_student_number: { event_id: eventId, student_number },
      },
      update: { status, updated_at: new Date() },
      create: {
        event_id: eventId,
        student_number,
        status,
      },
    });

    res.json(rsvp);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to RSVP' });
  }
});

export default router;
