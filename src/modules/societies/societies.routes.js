import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../../middleware/authJwt.js';
import { roleCheck } from './societies.middleware.js';
import { validator } from './societies.validator.js';

const prisma = new PrismaClient();
const router = Router();

// Public Routes
router.get('/', async (req, res) => {
  try {
    const societies = await prisma.society.findMany({
      where: { deleted: false },
      orderBy: { createdAt: 'desc' },
    });
    res.json(societies);
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while fetching societies' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const society = await prisma.society.findUnique({
      where: { society_id: BigInt(req.params.id) },
    });
    if (!society) return res.status(404).json({ message: 'Society not found' });
    res.json(society);
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while fetching the society' });
  }
});

// Protected Routes (Requires Authentication and Role Checks)
router.post('/', requireAuth, validator.validateCreate, async (req, res) => {
  const { name, category, description } = req.body;
  try {
    const society = await prisma.society.create({
      data: { name, category, description, created_by: req.user.id },
    });
    res.status(201).json({ society_id: society.society_id });
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while creating the society' });
  }
});

router.put('/:id', requireAuth, roleCheck(['creator', 'university_admin']), validator.validateUpdate, async (req, res) => {
  const { id } = req.params;
  const { name, category, description } = req.body;
  try {
    const updatedSociety = await prisma.society.update({
      where: { society_id: BigInt(id) },
      data: { name, category, description },
    });
    res.json(updatedSociety);
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while updating the society' });
  }
});

router.delete('/:id', requireAuth, roleCheck(['university_admin']), async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.society.delete({ where: { society_id: BigInt(id) } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while deleting the society' });
  }
});

// Interest Management Routes (Public to Certain Users)
router.put('/:society_id/interests', requireAuth, roleCheck(['creator', 'university_admin']), async (req, res) => {
  const { society_id } = req.params;
  const { interest_ids } = req.body;

  if (!Array.isArray(interest_ids)) {
    return res.status(400).json({ message: 'Interest IDs should be an array' });
  }

  try {
    const society = await prisma.society.findUnique({ where: { society_id: BigInt(society_id) } });
    if (!society) return res.status(404).json({ message: 'Society not found' });

    // Remove all existing interests for this society
    await prisma.society_interest.deleteMany({ where: { society_id: BigInt(society_id) } });

    // Add new interests
    const interests = interest_ids.map((interest_id) => ({
      society_id: BigInt(society_id),
      interest_id: BigInt(interest_id),
    }));

    await prisma.society_interest.createMany({ data: interests });

    res.status(200).json({ message: 'Interests updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while updating interests' });
  }
});

router.post('/:society_id/interests/:interest_id', requireAuth, roleCheck(['creator', 'university_admin']), async (req, res) => {
  const { society_id, interest_id } = req.params;

  try {
    const society = await prisma.society.findUnique({ where: { society_id: BigInt(society_id) } });
    if (!society) return res.status(404).json({ message: 'Society not found' });

    const interest = await prisma.interest.findUnique({ where: { interest_id: BigInt(interest_id) } });
    if (!interest) return res.status(404).json({ message: 'Interest not found' });

    // Check if the interest is already attached to the society
    const existingInterest = await prisma.society_interest.findUnique({
      where: {
        society_id_interest_id: {
          society_id: BigInt(society_id),
          interest_id: BigInt(interest_id),
        },
      },
    });

    if (existingInterest) {
      return res.status(400).json({ message: 'Interest already attached to this society' });
    }

    // Attach the interest to the society
    await prisma.society_interest.create({
      data: {
        society_id: BigInt(society_id),
        interest_id: BigInt(interest_id),
      },
    });

    res.status(200).json({ message: 'Interest attached successfully' });
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while attaching interest' });
  }
});

router.delete('/:society_id/interests/:interest_id', requireAuth, roleCheck(['creator', 'university_admin']), async (req, res) => {
  const { society_id, interest_id } = req.params;

  try {
    const society = await prisma.society.findUnique({ where: { society_id: BigInt(society_id) } });
    if (!society) return res.status(404).json({ message: 'Society not found' });

    const existingInterest = await prisma.society_interest.findUnique({
      where: {
        society_id_interest_id: {
          society_id: BigInt(society_id),
          interest_id: BigInt(interest_id),
        },
      },
    });

    if (!existingInterest) {
      return res.status(400).json({ message: 'Interest not attached to this society' });
    }

    await prisma.society_interest.delete({
      where: {
        society_id_interest_id: {
          society_id: BigInt(society_id),
          interest_id: BigInt(interest_id),
        },
      },
    });

    res.status(200).json({ message: 'Interest detached successfully' });
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while detaching interest' });
  }
});

export default router;