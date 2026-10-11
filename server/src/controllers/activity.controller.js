const activityService = require('../services/activity/activity.service');

async function listRecent(req, res, next) {
  try {
    const activities = await activityService.listRecentActivities(req.userId);
    res.json({ success: true, data: activities });
  } catch (error) {
    next(error);
  }
}

async function logThreeDView(req, res, next) {
  try {
    const result = await activityService.logThreeDView(req.userId, req.body);
    res.status(result.logged ? 201 : 200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

module.exports = { listRecent, logThreeDView };
