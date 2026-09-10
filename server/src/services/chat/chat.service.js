const fs = require('fs');
const path = require('path');
const ChatConversation = require('../../models/ChatConversation');
const POI = require('../../models/POI');
const Trip = require('../../models/Trip');
const ApiError = require('../../utils/apiError');
const { generateJson } = require('../ai/gemini.service');
const { replaceItineraryActivity } = require('../trip/trip.service');
const { planItineraryRoutes } = require('../itinerary/routePlanner.service');
const { getBudget } = require('../expenses/budget.service');

const README_PATH = path.resolve(__dirname, '../../../../docs/chatbot.md');
const MAX_RECENT_MESSAGES = 8;
let readmeText = null;

function getReadmeContext(message) {
  if (!readmeText) {
    try {
      readmeText = fs.readFileSync(README_PATH, 'utf8');
    } catch {
      readmeText = '';
    }
  }

  const terms = message.toLowerCase().split(/\W+/).filter((term) => term.length > 3);
  const sections = readmeText.split(/\n(?=# )/);
  const ranked = sections
    .map((section) => ({ section, score: terms.reduce((score, term) => score + (section.toLowerCase().includes(term) ? 1 : 0), 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .filter((item) => item.score > 0)
    .map((item) => item.section.slice(0, 1800));

  return ranked.join('\n\n') || readmeText.slice(0, 1200);
}

async function getPoiContext(message, trip) {
  const cityFromQuestion = message.match(/\bin\s+([a-z][a-z\s-]{2,40}?)(?:\?|\.|,|$)/i)?.[1]?.trim();
  const city = (trip?.destination || cityFromQuestion || '').split(',')[0].trim();
  const cityNames = /^(mysuru|mysore)$/i.test(city) ? ['Mysuru', 'Mysore'] : [city];
  const query = city
    ? { city: { $in: cityNames.map((name) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) } }
    : { $text: { $search: message } };

  const pois = await POI.find(query)
    .sort({ googleRating: -1, reviewCountLakhs: -1 })
    .limit(12)
    .select('name city category poiType significance address entryFeeInr visitDurationHrs googleRating bestTimeToVisit openingTime closingTime description latitude longitude')
    .lean();

  return pois.map((poi) => ({
    name: poi.name,
    city: poi.city,
    category: poi.category,
    type: poi.poiType,
    significance: poi.significance,
    address: poi.address,
    entryFeeInr: poi.entryFeeInr,
    visitDurationHrs: poi.visitDurationHrs,
    rating: poi.googleRating,
    bestTimeToVisit: poi.bestTimeToVisit,
    openingTime: poi.openingTime,
    closingTime: poi.closingTime,
    description: poi.description,
    latitude: poi.latitude,
    longitude: poi.longitude,
  }));
}

function serializeTrip(trip) {
  if (!trip) return null;
  return {
    tripName: trip.tripName,
    origin: trip.origin,
    destination: trip.destination,
    dates: `${new Date(trip.startDate).toISOString().slice(0, 10)} to ${new Date(trip.endDate).toISOString().slice(0, 10)}`,
    numberOfDays: trip.numberOfDays,
    travellers: trip.travellers,
    budget: trip.budget,
    preferences: trip.placePreferences,
    foodPreferences: trip.foodPreferences,
    pace: trip.pace,
    selectedHotel: trip.recommendedHotel,
    transport: {
      selectedMode: trip.selectedTransportMode,
      intercity: trip.intercityTransport,
      intracity: trip.intracityTransport,
    },
    overview: trip.overview,
    preTrip: trip.preTrip,
    budgetSummary: trip.budgetSummary,
    selectedPlaces: trip.selectedPlaces,
    itinerary: (trip.itinerary || []).map((day) => ({
      day: day.day,
      date: day.date,
      summary: day.summary,
      activities: day.activities.map((activity) => ({
        type: activity.type,
        name: activity.name,
        startTime: activity.startTime,
        endTime: activity.endTime,
        duration: activity.duration,
        notes: activity.notes,
        location: activity.location,
      })),
    })),
  };
}

function parseAssistantResponse(content) {
  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return { message: content, action: null };
    const parsed = JSON.parse(match[0]);
    if (typeof parsed.message !== 'string') return { message: content, action: null };
    return { message: parsed.message, action: parsed.action || null };
  } catch {
    return { message: content, action: null };
  }
}

async function generateGeminiChat(messages) {
  const prompt = messages.map(({ role, content }) => `${role.toUpperCase()}:\n${content}`).join('\n\n');
  const response = await generateJson(`${prompt}\n\nReturn only the requested JSON object.`);
  return typeof response?.message === 'string' ? JSON.stringify(response) : null;
}

async function getOwnedTrip(userId, tripId) {
  if (!tripId) return null;
  const trip = await Trip.findOne({ _id: tripId, userId }).lean();
  if (!trip) throw ApiError.notFound('Trip not found or you do not have access to it.');
  return trip;
}

async function sendMessage({ userId, conversationId, tripId, contextType = 'app', message }) {
  const cleanMessage = String(message || '').trim();
  if (!cleanMessage || cleanMessage.length > 4000) throw ApiError.badRequest('Message must be between 1 and 4000 characters.');

  let conversation = conversationId
    ? await ChatConversation.findOne({ _id: conversationId, userId })
    : null;
  if (conversationId && !conversation) throw ApiError.notFound('Conversation not found.');

  const trip = await getOwnedTrip(userId, tripId || conversation?.tripId);
  if (!conversation) {
    conversation = await ChatConversation.create({ userId, tripId: trip?._id || null, contextType, messages: [] });
  }

  const budget = trip ? await getBudget(userId, trip._id) : null;
  const pois = await getPoiContext(cleanMessage, trip);
  const context = {
    pageContext: contextType,
    trip: serializeTrip(trip),
    help: getReadmeContext(cleanMessage),
    pois,
    actualBudget: budget,
  };
  const recentMessages = conversation.messages.slice(-MAX_RECENT_MESSAGES).map((item) => ({ role: item.role, content: item.content }));
  const messages = [
    {
      role: 'system',
      content: 'You are Travel Manager Assistant. Answer questions about this project and help users navigate Travel Manager. Use only the supplied project guide, trip data, POI records, and budget data for factual claims. If the POI list is empty, say that the local dataset did not return matching records instead of inventing specific records. For itinerary edits, identify the day and activity index from the supplied itinerary. If the user has not chosen a change, ask them to choose one of these options: replace with a nearby alternative, replace with a farther alternative, or remove the activity. Respond only as JSON: {"message":"...","action":null or {"type":"REMOVE_ITINERARY_ITEM|REPLACE_ITINERARY_ITEM","day":2,"activityIndex":1,"strategy":null or "nearby" or "farther","options":["nearby","farther","remove"],"requiresConfirmation":true}}. Never modify data without confirmation.',
    },
    {
      role: 'user',
      content: `Context:\n${JSON.stringify(context)}\n\nRecent conversation:\n${JSON.stringify(recentMessages)}\n\nUser message:\n${cleanMessage}`,
    },
  ];

  let answer;
  try {
    answer = await generateGeminiChat(messages);
  } catch {
    answer = null;
  }
  if (!answer) throw ApiError.serviceUnavailable('The travel assistant is unavailable right now.');
  const parsed = parseAssistantResponse(answer);

  conversation.messages.push({ role: 'user', content: cleanMessage });
  conversation.messages.push({ role: 'assistant', content: parsed.message, sources: [] });
  if (conversation.messages.length > 20) conversation.messages = conversation.messages.slice(-20);
  await conversation.save();

  return {
    conversationId: conversation._id,
    message: parsed.message,
    action: parsed.action,
    sources: [],
  };
}

async function applyAction({ userId, tripId, action }) {
  if (!tripId || !action || action.requiresConfirmation !== true) throw ApiError.badRequest('A confirmed assistant action is required.');
  const trip = await Trip.findOne({ _id: tripId, userId });
  if (!trip) throw ApiError.notFound('Trip not found or you do not have access to it.');

  const dayNumber = Number(action.day);
  const activityIndex = Number(action.activityIndex);
  const day = trip.itinerary.find((item) => item.day === dayNumber);
  const activity = day?.activities?.[activityIndex];
  if (!day || !activity || !['poi', 'restaurant', 'hotel'].includes(activity.type)) {
    throw ApiError.badRequest('The requested itinerary activity is not editable.');
  }

  if (action.type === 'REMOVE_ITINERARY_ITEM') {
    day.activities.splice(activityIndex, 1);
    await planItineraryRoutes(trip.itinerary, { accommodation: trip.recommendedHotel?.latitude ? { lat: trip.recommendedHotel.latitude, lng: trip.recommendedHotel.longitude } : trip.destinationLocation });
  } else if (action.type === 'REPLACE_ITINERARY_ITEM') {
    if (!['nearby', 'farther'].includes(action.strategy)) throw ApiError.badRequest('Replacement strategy is invalid.');
    await replaceItineraryActivity(trip._id, userId, dayNumber, activityIndex, action.strategy);
    return { tripId: trip._id, action: action.type, message: 'Itinerary activity replaced.' };
  } else {
    throw ApiError.badRequest('This assistant action is not enabled yet.');
  }

  await trip.save();
  return { tripId: trip._id, action: action.type, message: 'Itinerary updated.' };
}

async function listConversations(userId) {
  return ChatConversation.find({ userId }).sort({ updatedAt: -1 }).limit(30).select('_id tripId contextType summary updatedAt messages').lean();
}

async function getConversation(userId, conversationId) {
  const conversation = await ChatConversation.findOne({ _id: conversationId, userId }).lean();
  if (!conversation) throw ApiError.notFound('Conversation not found.');
  return conversation;
}

async function deleteConversation(userId, conversationId) {
  const result = await ChatConversation.deleteOne({ _id: conversationId, userId });
  if (!result.deletedCount) throw ApiError.notFound('Conversation not found.');
}

module.exports = { sendMessage, applyAction, listConversations, getConversation, deleteConversation };
