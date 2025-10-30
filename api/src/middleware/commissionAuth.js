// Commission-specific authentication middleware

export function canManageCommissions(req, res, next) {
  const allowedRoles = ['SUPER_ADMIN', 'ACCOUNTANT'];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ 
      error: 'Only Super Admins and Accountants can manage commissions'
    });
  }
  next();
}

export function canManageCommissionSettings(req, res, next) {
  if (req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ 
      error: 'Only Super Admins can manage commission settings'
    });
  }
  next();
}

export function checkCommissionAccess(req, res, next) {
  req.commissionAccess = {
    canViewAll: ['SUPER_ADMIN', 'ACCOUNTANT'].includes(req.user.role),
    canViewOwn: true,
    userName: req.user.name,
    role: req.user.role
  };
  next();
}
