import express from 'express';
import bcrypt from 'bcryptjs';

export function createManufacturersRouter(prisma) {
  const router = express.Router();

  // GET /manufacturers
  router.get('/', async (req, res) => {
    try {
      const manufacturers = await prisma.manufacturer.findMany({
        include: {
          user: { select: { id: true, email: true, name: true, isActive: true, lastLogin: true } },
          _count: { select: { orderItems: true } }
        },
        orderBy: { name: 'asc' }
      });
      res.json(manufacturers);
    } catch (error) {
      console.error('Error fetching manufacturers:', error);
      res.status(500).json({ error: 'Failed to fetch manufacturers', details: error.message });
    }
  });

  // GET /manufacturers/active
  router.get('/active', async (req, res) => {
    try {
      const manufacturers = await prisma.manufacturer.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' }
      });
      res.json(manufacturers);
    } catch (error) {
      console.error('Error fetching active manufacturers:', error);
      res.status(500).json({ error: 'Failed to fetch active manufacturers', details: error.message });
    }
  });

  // GET /manufacturers/:id
  router.get('/:id', async (req, res) => {
    try {
      const manufacturer = await prisma.manufacturer.findUnique({
        where: { id: req.params.id },
        include: {
          user: { select: { id: true, email: true, name: true, isActive: true, lastLogin: true } },
          _count: { select: { orderItems: true } }
        }
      });
      if (!manufacturer) return res.status(404).json({ error: 'Manufacturer not found' });
      res.json(manufacturer);
    } catch (error) {
      console.error('Error fetching manufacturer:', error);
      res.status(500).json({ error: 'Failed to fetch manufacturer', details: error.message });
    }
  });

  // POST /manufacturers
  router.post('/', async (req, res) => {
    try {
      const { name, contactInfo, notes, createUserAccount, email, password } = req.body;

      if (!name?.trim()) return res.status(400).json({ error: 'Manufacturer name is required' });

      const existing = await prisma.manufacturer.findUnique({ where: { name: name.trim() } });
      if (existing) return res.status(400).json({ error: 'A manufacturer with this name already exists' });

      let userId = null;

      if (createUserAccount) {
        if (!email?.trim())          return res.status(400).json({ error: 'Email is required when creating a user account' });
        if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

        const existingUser = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
        if (existingUser) return res.status(400).json({ error: 'A user with this email already exists' });

        const user = await prisma.user.create({
          data: {
            email: email.trim().toLowerCase(),
            password: await bcrypt.hash(password, 10),
            name: name.trim(),
            role: 'MANUFACTURER',
            isActive: true,
            showInSalesRepDropdown: false,
          }
        });
        userId = user.id;
      }

      const manufacturer = await prisma.manufacturer.create({
        data: {
          name: name.trim(),
          contactInfo: contactInfo?.trim() || null,
          notes: notes?.trim() || null,
          userId,
          isActive: true,
        },
        include: {
          user: { select: { id: true, email: true, name: true, isActive: true } }
        }
      });

      await prisma.auditLog.create({
        data: {
          entityType: 'Manufacturer', entityId: manufacturer.id, action: 'CREATED',
          performedByUserId: req.user?.id || null, performedByName: req.user?.name || 'Unknown',
          metadata: JSON.stringify({ manufacturerName: manufacturer.name, hasUserAccount: !!userId })
        }
      });

      res.status(201).json(manufacturer);
    } catch (error) {
      console.error('Error creating manufacturer:', error);
      res.status(500).json({ error: 'Failed to create manufacturer', details: error.message });
    }
  });

  // PATCH /manufacturers/:id
  router.patch('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, contactInfo, notes, isActive, createUserAccount, email, password } = req.body;

      const existing = await prisma.manufacturer.findUnique({
        where: { id },
        include: { user: { select: { id: true, email: true } } }
      });
      if (!existing) return res.status(404).json({ error: 'Manufacturer not found' });

      // Duplicate name check
      if (name && name.trim() !== existing.name) {
        const duplicate = await prisma.manufacturer.findUnique({ where: { name: name.trim() } });
        if (duplicate) return res.status(400).json({ error: 'A manufacturer with this name already exists' });
      }

      // ── Core manufacturer fields ──────────────────────────────────
      const updates = {};
      if (name        !== undefined) updates.name        = name.trim();
      if (contactInfo !== undefined) updates.contactInfo = contactInfo?.trim() || null;
      if (notes       !== undefined) updates.notes       = notes?.trim() || null;
      if (isActive    !== undefined) updates.isActive    = isActive;

      // ── User account: create for existing manufacturer without one ─
      if (createUserAccount && !existing.userId) {
        if (!email?.trim())          return res.status(400).json({ error: 'Email is required' });
        if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

        const existingUser = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
        if (existingUser) return res.status(400).json({ error: 'A user with this email already exists' });

        const user = await prisma.user.create({
          data: {
            email: email.trim().toLowerCase(),
            password: await bcrypt.hash(password, 10),
            name: (name?.trim() || existing.name),
            role: 'MANUFACTURER',
            isActive: true,
            showInSalesRepDropdown: false,
          }
        });
        updates.userId = user.id;
      }

      // ── User account: update credentials for existing user ─────────
      if (existing.userId && !createUserAccount) {
        const userUpdates = {};
        if (email?.trim()) {
          const emailLower = email.trim().toLowerCase();
          if (emailLower !== existing.user?.email) {
            const conflict = await prisma.user.findUnique({ where: { email: emailLower } });
            if (conflict && conflict.id !== existing.userId)
              return res.status(400).json({ error: 'A user with this email already exists' });
            userUpdates.email = emailLower;
          }
        }
        if (password && password.length >= 8) {
          userUpdates.password = await bcrypt.hash(password, 10);
        } else if (password && password.length > 0) {
          return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }
        if (Object.keys(userUpdates).length > 0) {
          await prisma.user.update({ where: { id: existing.userId }, data: userUpdates });
        }
      }

      // ── Deactivate linked user when deactivating manufacturer ──────
      if (isActive === false && existing.userId) {
        await prisma.user.update({ where: { id: existing.userId }, data: { isActive: false } });
      }
      if (isActive === true && existing.userId) {
        await prisma.user.update({ where: { id: existing.userId }, data: { isActive: true } });
      }

      const manufacturer = await prisma.manufacturer.update({
        where: { id },
        data: updates,
        include: {
          user: { select: { id: true, email: true, name: true, isActive: true } }
        }
      });

      await prisma.auditLog.create({
        data: {
          entityType: 'Manufacturer', entityId: id, action: 'UPDATED',
          performedByUserId: req.user?.id || null, performedByName: req.user?.name || 'Unknown',
          changes: JSON.stringify(updates)
        }
      });

      res.json(manufacturer);
    } catch (error) {
      console.error('Error updating manufacturer:', error);
      res.status(500).json({ error: 'Failed to update manufacturer', details: error.message });
    }
  });

  // DELETE /manufacturers/:id
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const manufacturer = await prisma.manufacturer.findUnique({
        where: { id },
        include: { _count: { select: { orderItems: true } } }
      });
      if (!manufacturer) return res.status(404).json({ error: 'Manufacturer not found' });
      if (manufacturer._count.orderItems > 0)
        return res.status(400).json({ error: `Cannot delete manufacturer. ${manufacturer._count.orderItems} order item(s) are assigned to this manufacturer.` });

      await prisma.manufacturer.update({ where: { id }, data: { isActive: false } });
      if (manufacturer.userId)
        await prisma.user.update({ where: { id: manufacturer.userId }, data: { isActive: false } });

      await prisma.auditLog.create({
        data: {
          entityType: 'Manufacturer', entityId: id, action: 'DELETED',
          performedByUserId: req.user?.id || null, performedByName: req.user?.name || 'Unknown',
          metadata: JSON.stringify({ manufacturerName: manufacturer.name })
        }
      });

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting manufacturer:', error);
      res.status(500).json({ error: 'Failed to delete manufacturer', details: error.message });
    }
  });

  return router;
}
