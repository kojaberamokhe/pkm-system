// FSRS v6 Implementation using ts-fsrs library
import { fsrs, generatorParameters, Rating } from 'ts-fsrs';

/**
 * Get FSRS parameters from settings or use defaults
 * This is async and should be called before calculateNextReview
 */
async function getFSRSParams() {
  try {
    const requestRetention = parseFloat(await window.api.settings.get('request_retention')) || 0.9;
    const maximumInterval = parseInt(await window.api.settings.get('maximum_interval')) || 36500;
    
    return generatorParameters({
      request_retention: requestRetention,
      maximum_interval: maximumInterval
    });
  } catch (error) {
    console.error('Failed to load FSRS settings, using defaults:', error);
    return generatorParameters({
      request_retention: 0.9,
      maximum_interval: 36500
    });
  }
}

/**
 * Calculate next review using FSRS v6 algorithm
 * @param {Object} card - The card object with FSRS properties
 * @param {number} rating - Rating: 1=Again, 2=Hard, 3=Good, 4=Easy
 * @param {Object} params - Optional FSRS parameters (if not provided, will fetch from settings)
 * @returns {Promise<Object>} Updated card object with new scheduling
 */
export async function calculateNextReview(card, rating, params = null) {
  const now = new Date();
  
  // Convert rating to FSRS Rating enum (Grade)
  let fsrsGrade;
  switch (rating) {
    case 1:
      fsrsGrade = Rating.Again;
      break;
    case 2:
      fsrsGrade = Rating.Hard;
      break;
    case 3:
      fsrsGrade = Rating.Good;
      break;
    case 4:
      fsrsGrade = Rating.Easy;
      break;
    default:
      fsrsGrade = Rating.Good;
  }
  
  // Get parameters if not provided
  if (!params) {
    params = await getFSRSParams();
  }
  
  // Create FSRS instance
  const scheduler = fsrs(params);
  
  // Prepare card data for FSRS
  const fsrsCard = {
    due: card.due ? new Date(card.due) : now,
    stability: card.stability || 0,
    difficulty: card.difficulty || 0,
    scheduled_days: 0,
    reps: card.reps || 0,
    lapses: card.lapses || 0,
    state: card.state || 0,
    last_review: card.last_review ? new Date(card.last_review) : undefined,
    learning_steps: 0
  };
  
  // Calculate next review using FSRS v6
  const result = scheduler.next(fsrsCard, now, fsrsGrade);
  const nextCard = result.card;
  const log = result.log;
  
  return {
    ...card,
    stability: nextCard.stability,
    difficulty: nextCard.difficulty,
    reps: nextCard.reps,
    lapses: nextCard.lapses,
    state: nextCard.state,
    last_review: now.toISOString(),
    due: nextCard.due.toISOString()
  };
}

/**
 * Get preview intervals for each rating
 * @param {Object} card - The card object
 * @returns {Promise<Object>} Object with intervals for each rating (1-4)
 */
export async function getNextIntervals(card) {
  const intervals = {};
  const now = new Date();
  
  // Get parameters from settings
  const params = await getFSRSParams();
  
  // Create FSRS instance
  const scheduler = fsrs(params);
  
  // Prepare card data
  const fsrsCard = {
    due: card.due ? new Date(card.due) : now,
    stability: card.stability || 0,
    difficulty: card.difficulty || 0,
    scheduled_days: 0,
    reps: card.reps || 0,
    lapses: card.lapses || 0,
    state: card.state || 0,
    last_review: card.last_review ? new Date(card.last_review) : undefined,
    learning_steps: 0
  };
  
  // Get preview for all ratings
  const preview = scheduler.repeat(fsrsCard, now);
  
  // Extract intervals for Fail (Again) and Good only
  // Fail = Rating.Again (1), Good = Rating.Good (3)
  const failResult = preview[Rating.Again];
  const goodResult = preview[Rating.Good];
  
  if (failResult && failResult.card) {
    const dueDate = new Date(failResult.card.due);
    const days = Math.round((dueDate - now) / (1000 * 60 * 60 * 24));
    intervals[1] = days; // Fail
  }
  
  if (goodResult && goodResult.card) {
    const dueDate = new Date(goodResult.card.due);
    const days = Math.round((dueDate - now) / (1000 * 60 * 60 * 24));
    intervals[3] = days; // Good
  }
  
  return intervals;
}
