import express from 'express';
import bcrypt from 'bcryptjs';

export function createManufacturersRouter(prisma) {
  const router = express.Router();

  // GET /manufacturers - List all manufacturers
  router.get('/', async (req, res) => {
    try {
      const manufacturers = await prisma.manufacturer.findMany({
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              isActive: true,
              lastLogin: true
            }
          },
          _count: {
            select: {
              orderItems: true
            }
          }
        },
        orderBy: {
          name: 'asc'
        }
      });

      res.json(manufacturers);
    } catch (error) {
      console.error('Error fetching manufacturers:', error);
      res.status(500).json({ error: 'Failed to fetch manufacturers' });
    }
  });

  // GET /manufacturers/active - List only active manufacturers (for dropdowns)
  router.get('/active', async (req, res) => {
    try {
      const manufacturers = await prisma.manufacturer.findMany({
        where: {
          isActive: true
        },
        select: {
          id: true,
          name: true
        },
        orderBy: {
          name: 'asc'
        }
      });

      res.json(manufacturers);
    } catch (error) {
      console.error('Error fetching active manufacturers:', error);
      res.status(500).json({ error: 'Failed to fetch active manufacturers' });
    }
  });

  // GET /manufacturers/:id - Get single manufacturer
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const manufacturer = await prisma.manufacturer.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              isActive: true,
              lastLogin: true
            }
          },
          _count: {
            select: {
              orderItems: true
            }
          }
        }
      });

      if (!manufacturer) {
        return res.status(404).json({ error: 'Manufacturer not found' });
      }

      res.json(manufacturer);
    } catch (error) {
      console.error('Error fetching manufacturer:', error);
      res.status(500).json({ error: 'Failed to fetch manufacturer' });
    }
  });

  // POST /manufacturers - Create new manufacturer
  router.post('/', async (req, res) => {
    try {
      const { name, contactInfo, notes, createUserAccount, email, password } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Manufacturer name is required' });
      }

      // Check if manufacturer name already exists
      const existing = await prisma.manufacturer.findUnique({
        where: { name: name.trim() }
      });

      if (existing) {
        return res.status(400).json({ error: 'A manufacturer with this name already exists' });
      }

      let userId = null;

      // If creating user account, validate and create user
      if (createUserAccount) {
        if (!email || !email.trim()) {
          return res.status(400).json({ error: 'Email is required when creating a user account' });
        }
        if (!password || password.length < 8) {
          return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        // Check if email already exists
        const existingUser = await prisma.user.findUnique({
          where: { email: email.trim().toLowerCase() }
        });

        if (existingUser) {
          return res.status(400).json({ error: 'A user with this email already exists' });
        }

        // Create user account
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
          data: {
            email: email.trim().toLowerCase(),
            password: hashedPassword,
            name: name.trim(),
            role: 'MANUFACTURER',
            isActive: true,
            canBeSalesRep: false
          }
        });

        userId = user.id;
      }

      // Create manufacturer
      const manufacturer = await prisma.manufacturer.create({
        data: {
          name: name.trim(),
          contactInfo: contactInfo?.trim() || null,
          notes: notes?.trim() || null,
          userId: userId,
          isActive: true
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              isActive: true
            }
          }
        }
      });

      // Log audit trail
      await prisma.auditLog.create({
        data: {
          entityType: 'Manufacturer',
          entityId: manufacturer.id,
          action: 'CREATED',
          performedByUserId: req.user?.id,
          performedByName: req.user?.name,
          metadata: JSON.stringify({
            manufacturerName: manufacturer.name,
            hasUserAccount: !!userId
          })
        }
      });

      res.status(201).json(manufacturer);
    } catch (error) {
      console.error('Error creating manufacturer:', error);
      res.status(500).json({ error: 'Failed to create manufacturer' });
    }
  });

  // PATCH /manufacturers/:id - Update manufacturer
  router.patch('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, contactInfo, notes, isActive } = req.body;

      const existing = await prisma.manufacturer.findUnique({
        where: { id }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Manufacturer not found' });
      }

      // If name is being changed, check for duplicates
      if (name && name.trim() !== existing.name) {
        const duplicate = await prisma.manufacturer.findUnique({
          where: { name: name.trim() }
        });

        if (duplicate) {
          return res.status(400).json({ error: 'A manufacturer with this name already exists' });
        }
      }

      const updates = {};
      if (name !== undefined) updates.name = name.trim();
      if (contactInfo !== undefined) updates.contactInfo = contactInfo?.trim() || null;
      if (notes !== undefined) updates.notes = notes?.trim() || null;
      if (isActive !== undefined) updates.isActive = isActive;

      const manufacturer = await prisma.manufacturer.update({
        where: { id },
        data: updates,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              isActive: true
            }
          }
        }
      });

      // If manufacturer is being deactivated and has a user account, deactivate that too
      if (isActive === false && manufacturer.userId) {
        await prisma.user.update({
          where: { id: manufacturer.userId },
          data: { isActive: false }
        });
      }

      // Log audit trail
      await prisma.auditLog.create({
        data: {
          entityType: 'Manufacturer',
          entityId: id,
          action: 'UPDATED',
          performedByUserId: req.user?.id,
          performedByName: req.user?.name,
          changes: JSON.stringify(updates)
        }
      });

      res.json(manufacturer);
    } catch (error) {
      console.error('Error updating manufacturer:', error);
      res.status(500).json({ error: 'Failed to update manufacturer' });
    }
  });

  // DELETE /manufacturers/:id - Delete manufacturer (soft delete - just deactivate)
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const manufacturer = await prisma.manufacturer.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              orderItems: true
            }
          }
        }
      });

      if (!manufacturer) {
        return res.status(404).json({ error: 'Manufacturer not found' });
      }

      // Check if manufacturer has any items assigned
      if (manufacturer._count.orderItems > 0) {
        return res.status(400).json({ 
          error: `Cannot delete manufacturer. ${manufacturer._count.orderItems} order item(s) are assigned to this manufacturer. Please reassign or remove items first.` 
        });
      }

      // Soft delete - just deactivate
      await prisma.manufacturer.update({
        where: { id },
        data: { isActive: false }
      });

      // If manufacturer has a user account, deactivate that too
      if (manufacturer.userId) {
        await prisma.user.update({
          where: { id: manufacturer.userId },
          data: { isActive: false }
        });
      }

      // Log audit trail
      await prisma.auditLog.create({
        data: {
          entityType: 'Manufacturer',
          entityId: id,
          action: 'DELETED',
          performedByUserId: req.user?.id,
          performedByName: req.user?.name,
          metadata: JSON.stringify({
            manufacturerName: manufacturer.name
          })
        }
      });

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting manufacturer:', error);
      res.status(500).json({ error: 'Failed to delete manufacturer' });
    }
  });

  return router;
}
