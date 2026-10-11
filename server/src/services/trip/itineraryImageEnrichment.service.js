const axios = require('axios');
const mongoose = require('mongoose');
const POI = require('../../models/POI');
const PlaceImages = require('../../models/PlaceImages');
const logger = require('../../utils/logger');

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const WIKIDATA_ENTITY_API = 'https://www.wikidata.org/wiki/Special:EntityData';
const WIKIMEDIA_COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const LOOKUP_CONCURRENCY = 4;
const MAX_COMMONS_PHOTOS = 10;
const REQUEST_TIMEOUT_MS = 7000;
const USER_AGENT = 'AITravelManager/1.0 (Wikipedia image enrichment)';

function normalizePlacePart(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function placeCacheKey(name, city) {
  return {
    normalizedName: normalizePlacePart(name),
    normalizedCity: normalizePlacePart(city),
  };
}

function wikipediaPageTitle(value) {
  const reference = String(value || '').trim();
  if (!reference) return null;
  try {
    if (/^https?:\/\//i.test(reference)) {
      const url = new URL(reference);
      const match = url.pathname.match(/\/wiki\/(.+)$/);
      return match ? decodeURIComponent(match[1]).replace(/_/g, ' ') : null;
    }
  } catch {
    return null;
  }
  return reference.replace(/_/g, ' ');
}

function isWikipediaTitleMatch(activityName, pageTitle) {
  const activityKey = normalizePlacePart(activityName);
  const titleKey = normalizePlacePart(String(pageTitle || '').replace(/\s*\([^)]*\)\s*$/, ''));
  if (!activityKey || !titleKey) return false;
  if (activityKey === titleKey) return true;

  const ignoredWords = new Set(['a', 'an', 'and', 'at', 'for', 'in', 'of', 'the', 'to']);
  const normalizeWord = (word) => word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word;
  const activityWords = activityKey.split(' ').map(normalizeWord).filter((word) => !ignoredWords.has(word));
  const titleWords = new Set(titleKey.split(' ').map(normalizeWord).filter((word) => !ignoredWords.has(word)));
  const sharedWords = activityWords.filter((word) => titleWords.has(word)).length;
  return activityWords.length >= 2 && sharedWords >= 2 && sharedWords / activityWords.length >= 0.8;
}

async function requestWikipedia(url, config = {}) {
  const response = await axios.get(url, {
    ...config,
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      'User-Agent': USER_AGENT,
      ...(config.headers || {}),
    },
  });
  return response.data;
}

async function wikidataDetails(wikidataId) {
  const id = String(wikidataId || '').trim().match(/^Q\d+$/i)?.[0];
  if (!id) return { title: null, commonsCategory: null };
  const entityData = await requestWikipedia(`${WIKIDATA_ENTITY_API}/${id}.json`);
  const entity = entityData?.entities?.[id];
  return {
    title: entity?.sitelinks?.enwiki?.title || null,
    commonsCategory: entity?.claims?.P373?.[0]?.mainsnak?.datavalue?.value || null,
  };
}

async function searchWikipediaTitle(name, city) {
  const query = [name, city].filter(Boolean).join(' ');
  const data = await requestWikipedia(WIKIPEDIA_API, {
    params: { action: 'query', list: 'search', srsearch: query, srlimit: 5, format: 'json' },
  });
  return chooseWikipediaTitle(name, data?.query?.search || []);
}

async function summaryThumbnail(title) {
  const data = await requestWikipedia(WIKIPEDIA_API, {
    params: {
      action: 'query',
      titles: title,
      redirects: 1,
      prop: 'extracts|pageimages|images|info|pageprops',
      exintro: 1,
      explaintext: 1,
      piprop: 'thumbnail',
      pithumbsize: 960,
      imlimit: MAX_COMMONS_PHOTOS,
      inprop: 'url',
      format: 'json',
    },
  });
  const page = Object.values(data?.query?.pages || {})[0];
  if (!page || page.missing != null) return null;
  const description = String(page.extract || '').trim();
  return {
    imageUrl: page.thumbnail?.source || null,
    wikipediaTitle: page.title || title,
    wikipediaUrl: page.fullurl || null,
    description: description.length > 650 ? `${description.slice(0, 647).trimEnd()}…` : description || null,
    wikidataId: page.pageprops?.wikibase_item || null,
    imageFileTitles: (page.images || [])
      .map((image) => image.title)
      .filter((fileTitle) => /^File:/i.test(fileTitle))
      .slice(0, MAX_COMMONS_PHOTOS),
  };
}

async function commonsCategoryPhotos(category) {
  if (!category) return [];
  const data = await requestWikipedia(WIKIMEDIA_COMMONS_API, {
    params: {
      action: 'query',
      generator: 'categorymembers',
      gcmtitle: `Category:${category}`,
      gcmtype: 'file',
      gcmlimit: MAX_COMMONS_PHOTOS,
      prop: 'imageinfo',
      iiprop: 'url|extmetadata',
      iiurlwidth: 960,
      format: 'json',
    },
  });
  return Object.values(data?.query?.pages || {}).flatMap((file) => {
    const info = file.imageinfo?.[0];
    if (!info?.thumburl && !info?.url) return [];
    return [{
      url: info.thumburl || info.url,
      pageUrl: info.descriptionurl || null,
      license: info.extmetadata?.LicenseShortName?.value || null,
      artist: info.extmetadata?.Artist?.value?.replace(/<[^>]*>/g, '').trim() || null,
    }];
  });
}

function chooseWikipediaTitle(name, results = []) {
  return results.map((result) => result.title).find((title) => isWikipediaTitleMatch(name, title)) || null;
}

async function wikipediaArticlePhotos(fileTitles = []) {
  if (!fileTitles.length) return [];
  const data = await requestWikipedia(WIKIPEDIA_API, {
    params: {
      action: 'query',
      titles: fileTitles.join('|'),
      prop: 'imageinfo',
      iiprop: 'url|extmetadata',
      iiurlwidth: 960,
      format: 'json',
    },
  });
  return Object.values(data?.query?.pages || {}).flatMap((file) => {
    const info = file.imageinfo?.[0];
    if (!info?.thumburl && !info?.url) return [];
    return [{
      url: info.thumburl || info.url,
      pageUrl: info.descriptionurl || null,
      license: info.extmetadata?.LicenseShortName?.value || null,
      artist: info.extmetadata?.Artist?.value?.replace(/<[^>]*>/g, '').trim() || null,
    }];
  });
}

async function resolveWikipediaContent(activity, city) {
  let title = wikipediaPageTitle(activity.wikipedia);
  let entity = null;
  if (!title && activity.wikidataId) {
    try {
      entity = await wikidataDetails(activity.wikidataId);
      title = entity.title;
    } catch (error) {
      logger.warn(`Wikidata article lookup failed for "${activity.name}", trying Wikipedia search`, error.message);
    }
  }
  if (!title) {
    title = await searchWikipediaTitle(activity.name, city);
    if (!title) return null;
  }

  const summary = await summaryThumbnail(title);
  if (!summary) return null;
  if (!entity && summary.wikidataId) {
    try {
      entity = await wikidataDetails(summary.wikidataId);
    } catch (error) {
      logger.warn(`Wikidata category lookup failed for "${activity.name}"`, error.message);
    }
  }
  let commonsPhotos = [];
  try {
    commonsPhotos = [
      ...await wikipediaArticlePhotos(summary.imageFileTitles),
      ...await commonsCategoryPhotos(entity?.commonsCategory),
    ];
  } catch (error) {
    logger.warn(`Wikipedia/Wikimedia image lookup failed for "${activity.name}"`, error.message);
  }
  const photos = [...new Map([
    ...(summary.imageUrl ? [{ url: summary.imageUrl }] : []),
    ...commonsPhotos,
  ].map((photo) => [photo.url, photo])).values()].slice(0, MAX_COMMONS_PHOTOS);
  return {
    ...summary,
    imageUrl: summary.imageUrl || photos[0]?.url || null,
    photos,
    wikipediaUrl: summary.wikipediaUrl || `https://en.wikipedia.org/wiki/${encodeURIComponent(summary.wikipediaTitle.replace(/ /g, '_'))}`,
  };
}

function getPoiIds(days) {
  const ids = new Set();
  for (const day of days || []) {
    for (const activity of day.activities || []) {
      if (
        activity.type === 'poi'
        && activity.refId
        && mongoose.Types.ObjectId.isValid(activity.refId)
      ) {
        ids.add(String(activity.refId));
      }
    }
  }
  return [...ids];
}

async function getBackingPois(days) {
  const ids = getPoiIds(days);
  if (!ids.length) return new Map();
  const pois = await POI.find({ _id: { $in: ids } })
    .select('_id name city category poiType significance characteristics tags description imageUrl photos wikipedia wikipediaUrl wikidataId')
    .lean();
  return new Map(pois.map((poi) => [String(poi._id), poi]));
}

async function loadCachedImage(name, city) {
  const key = placeCacheKey(name, city);
  if (!key.normalizedName || !key.normalizedCity) return null;
  const cached = await PlaceImages.findOne(key).select('imageUrl photos description wikipediaTitle').lean();
  return cached || null;
}

async function storeCachedImage(name, city, content) {
  const key = placeCacheKey(name, city);
  if (!key.normalizedName || !key.normalizedCity || !(content?.imageUrl || content?.photos?.length || content?.description)) return;

  await PlaceImages.updateOne(
    key,
    {
      $set: {
        ...key,
        name: String(name).trim(),
        city: String(city).trim(),
        ...(content.imageUrl ? { imageUrl: content.imageUrl } : {}),
        ...(content.photos?.length ? { photos: content.photos } : {}),
        ...(content.description ? { description: content.description } : {}),
        ...(content.wikipediaTitle ? { wikipediaTitle: content.wikipediaTitle } : {}),
      },
    },
    { upsert: true }
  );
}

async function resolveDestinationLeadImage(destination) {
  const name = String(destination || '').trim();
  if (!name) return null;

  const cached = await loadCachedImage(name, name);
  if (cached) return cached.imageUrl || null;

  const content = await resolveWikipediaContent({ name }, name);
  if (!content) return null;
  await storeCachedImage(name, name, content);
  return content.imageUrl || null;
}

function applyWikipediaContent(activity, content) {
  if (!content) return;
  activity.imageUrl ||= content.imageUrl || null;
  activity.description ||= content.description || null;
  activity.wikipediaUrl ||= content.wikipediaUrl || null;
  if (!activity.photos?.length) activity.photos = content.photos || [];
}

async function enrichActivity(activity, city, poi, contentCache) {
  const hasReference = Boolean(activity.refId);
  const backingPoi = hasReference ? poi : null;
  const key = placeCacheKey(activity.name, city);
  const memoryKey = `${key.normalizedName}|${key.normalizedCity}`;
  if (!key.normalizedName || !key.normalizedCity) return;
  if (poi?.imageUrl) activity.imageUrl ||= poi.imageUrl;
  if (poi?.photos?.length) activity.photos = activity.photos?.length ? activity.photos : poi.photos;
  if (poi?.description) activity.description ||= poi.description;
  const isMissingContent = () => !activity.imageUrl || !activity.description || !activity.photos?.length;
  if (!isMissingContent()) return;

  if (!hasReference) {
    const cached = await loadCachedImage(activity.name, city);
    if (cached) applyWikipediaContent(activity, cached);
    if (!isMissingContent()) {
      contentCache.set(memoryKey, cached);
      return;
    }
  }
  if (contentCache.has(memoryKey)) {
    applyWikipediaContent(activity, contentCache.get(memoryKey));
    return;
  }

  const content = await resolveWikipediaContent({
    name: activity.name,
    wikipedia: backingPoi?.wikipedia,
    wikidataId: backingPoi?.wikidataId,
  }, city);
  if (!content) {
    logger.info(`No reliable Wikipedia article match for POI "${activity.name}" in "${city}".`);
    return;
  }
  applyWikipediaContent(activity, content);
  contentCache.set(memoryKey, content);
  logger.info(`Wikipedia content resolved for POI "${activity.name}".`, {
    hasImage: Boolean(content.imageUrl),
    photoCount: content.photos.length,
    hasDescription: Boolean(content.description),
  });

  if (backingPoi) {
    const updates = {};
    if (!backingPoi.imageUrl && content.imageUrl) updates.imageUrl = content.imageUrl;
    if (!backingPoi.description && content.description) updates.description = content.description;
    if (!backingPoi.wikipediaUrl && content.wikipediaUrl) updates.wikipediaUrl = content.wikipediaUrl;
    if (!backingPoi.photos?.length && content.photos?.length) updates.photos = content.photos;
    if (Object.keys(updates).length) await POI.updateOne({ _id: backingPoi._id }, { $set: updates });
  } else if (!hasReference) {
    await storeCachedImage(activity.name, city, content);
  }
}

async function enrichItineraryImages(days, destination) {
  try {
    const poisById = await getBackingPois(days);
    const jobs = [];
    const scheduled = new Set();
    const contentCache = new Map();

    for (const day of days || []) {
      for (const activity of day.activities || []) {
        if (activity.type !== 'poi') continue;
        const poi = activity.refId ? poisById.get(String(activity.refId)) || null : null;
        if (poi) {
          activity.category ||= poi.category || null;
          activity.poiType ||= poi.poiType || null;
          activity.significance ||= poi.significance || null;
          activity.characteristics ||= poi.characteristics || null;
          activity.tags = activity.tags?.length ? activity.tags : (poi.tags || []);
          activity.description ||= poi.description || null;
          activity.imageUrl ||= poi.imageUrl || null;
          activity.photos = activity.photos?.length ? activity.photos : (poi.photos || []);
        }
        if (!activity.name
          || (activity.imageUrl && activity.description && activity.photos?.length)) continue;
        const city = poi?.city || destination;
        const key = placeCacheKey(activity.name, city);
        const jobKey = `${activity.refId || ''}|${key.normalizedName}|${key.normalizedCity}`;
        if (scheduled.has(jobKey)) continue;
        scheduled.add(jobKey);
        jobs.push({ activity, poi, city });
      }
    }

    let nextJob = 0;
    async function worker() {
      while (nextJob < jobs.length) {
        const job = jobs[nextJob++];
        try {
          await enrichActivity(job.activity, job.city, job.poi, contentCache);
        } catch (error) {
          logger.warn(`Wikipedia/Wikimedia content lookup failed for "${job.activity.name}"`, error.message);
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(LOOKUP_CONCURRENCY, jobs.length) }, () => worker())
    );

    for (const day of days || []) {
      for (const activity of day.activities || []) {
        if (activity.type !== 'poi' || !activity.name) continue;
        const poi = activity.refId ? poisById.get(String(activity.refId)) || null : null;
        const key = placeCacheKey(activity.name, poi?.city || destination);
        applyWikipediaContent(activity, contentCache.get(`${key.normalizedName}|${key.normalizedCity}`));
      }
    }
  } catch (error) {
    logger.warn('Itinerary content enrichment could not complete; continuing without enriched content', error.message);
  }

  return days;
}

module.exports = {
  enrichItineraryImages,
  resolveDestinationLeadImage,
  isWikipediaTitleMatch,
  chooseWikipediaTitle,
  normalizePlacePart,
  wikipediaPageTitle,
};
