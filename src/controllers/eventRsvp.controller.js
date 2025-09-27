// controllers/eventRsvp.controller.js
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// POST /api/events/:eventId/rsvp
export const createOrUpdateRsvp = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { status } = req.body;
    const studentId = req.user?.user_id; // make sure auth middleware adds user

    if (!status) {
      return res.status(400).json({ error: "RSVP status is required" });
    }

    const rsvp = await prisma.event_rsvp.upsert({
      where: {
        student_id_event_id: {
          student_id: studentId,
          event_id: Number(eventId),
        },
      },
      update: { status, updated_at: new Date() },
      create: {
        student_id: studentId,
        event_id: Number(eventId),
        status,
      },
    });

    return res.json(rsvp);
  } catch (error) {
    console.error("RSVP error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// GET /api/events/:eventId/rsvp
export const getEventRsvps = async (req, res) => {
  try {
    const { eventId } = req.params;

    const rsvps = await prisma.event_rsvp.findMany({
      where: { event_id: Number(eventId) },
      include: {
        student_profile: {
          select: {
            student_id: true,
            study_field: true,
            interests: true,
          },
        },
      },
    });

    return res.json(rsvps);
  } catch (error) {
    console.error("Get RSVPs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
