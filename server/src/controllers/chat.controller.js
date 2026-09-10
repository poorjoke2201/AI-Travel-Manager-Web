const chatService = require('../services/chat/chat.service');

async function sendMessage(req, res, next) {
  try {
    const result = await chatService.sendMessage({ userId: req.userId, ...req.body });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function listConversations(req, res, next) {
  try {
    res.status(200).json({ success: true, data: await chatService.listConversations(req.userId) });
  } catch (err) {
    next(err);
  }
}

async function applyAction(req, res, next) {
  try {
    const result = await chatService.applyAction({ userId: req.userId, ...req.body });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getConversation(req, res, next) {
  try {
    res.status(200).json({ success: true, data: await chatService.getConversation(req.userId, req.params.id) });
  } catch (err) {
    next(err);
  }
}

async function deleteConversation(req, res, next) {
  try {
    await chatService.deleteConversation(req.userId, req.params.id);
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { sendMessage, applyAction, listConversations, getConversation, deleteConversation };
