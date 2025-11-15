// Persian language support utilities

/**
 * Check if a string contains Persian/Arabic characters
 */
export function isPersian(text) {
  if (!text) return false;
  // Persian/Arabic Unicode range: \u0600-\u06FF
  const persianRegex = /[\u0600-\u06FF]/;
  return persianRegex.test(text);
}

/**
 * Detect the primary direction of text (RTL for Persian, LTR for others)
 */
export function detectTextDirection(text) {
  if (!text) return 'ltr';
  
  // Count Persian/Arabic characters
  const persianChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const totalChars = text.replace(/\s/g, '').length;
  
  // If more than 30% Persian characters, consider it RTL
  if (totalChars > 0 && persianChars / totalChars > 0.3) {
    return 'rtl';
  }
  
  return 'ltr';
}

/**
 * Persian-aware string comparison for sorting
 * Handles both Persian and English text properly
 */
export function persianCompare(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  
  const aStr = String(a).trim();
  const bStr = String(b).trim();
  
  // Check if both are Persian or both are English
  const aIsPersian = isPersian(aStr);
  const bIsPersian = isPersian(bStr);
  
  // If both are Persian or both are English, use localeCompare
  if (aIsPersian === bIsPersian) {
    if (aIsPersian) {
      // Both Persian: use Persian locale
      return aStr.localeCompare(bStr, 'fa', { numeric: true, sensitivity: 'base' });
    } else {
      // Both English: use English locale
      return aStr.localeCompare(bStr, 'en', { numeric: true, sensitivity: 'base' });
    }
  }
  
  // Mixed: Persian comes after English
  return aIsPersian ? 1 : -1;
}

/**
 * Sort an array of objects by a property using Persian-aware comparison
 */
export function sortByProperty(array, property) {
  return [...array].sort((a, b) => {
    const aVal = a[property];
    const bVal = b[property];
    return persianCompare(aVal, bVal);
  });
}

