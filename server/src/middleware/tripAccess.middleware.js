const Trip = require('../models/Trip');
const ApiError = require('../utils/apiError');

function normalizePhoneNumber(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[^\d+]/g, '');
  if (!cleaned || (cleaned.length < 8 && !cleaned.startsWith('+'))) return null;
  return cleaned.startsWith('+') ? `+${cleaned.replace(/\+/g, '')}` : cleaned;
}

async function requireTripAccess(req, res, next) {
  try {
    const tripId = req.params.tripId || req.params.id;
    if (!tripId) return next();

    const trip = await Trip.findById(tripId);
    if (!trip) throw ApiError.notFound('Trip not found.');

    const currentUserId = String(req.userId);
    const currentPhone = req.user?.phoneNumber ? normalizePhoneNumber(req.user.phoneNumber) : null;
    const isInviteApprovalRequest = req.path && req.path.endsWith('/accept-invite');
    const isOwner = String(trip.userId) === currentUserId;
    const isMember = trip.groupMembers?.some((member) => {
      const sameUser = String(member.userId) === currentUserId;
      const samePhone = Boolean(currentPhone)
        && member.phoneNumber
        && normalizePhoneNumber(member.phoneNumber) === currentPhone;
      const allowedStatuses = isInviteApprovalRequest
        ? ['accepted', 'pending', 'invited']
        : ['accepted'];
      return (sameUser || samePhone) && allowedStatuses.includes(member.status);
    });

    if (!isOwner && !isMember) {
      throw ApiError.forbidden('You do not have access to this trip.');
    }

    req.trip = trip;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireTripAccess };
