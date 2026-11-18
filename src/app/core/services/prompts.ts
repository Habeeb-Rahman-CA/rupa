import { Category } from '../../core/models/domain.models';

export const DEFAULT_EXTRACTION_PROMPT =
  'Output ONLY a JSON object with the merchant name as \'title\' and total expense as \'total_amount\'. ' +
  'No other text. Example: {"title": "Starbucks", "total_amount": "5.50"}';

/**
 * Builds a category-aware extraction prompt that lists the user's expense
 * categories and asks the model to pick the best match plus up to two
 * ranked alternatives. Used as the default prompt when categories are
 * passed to extractBill and no custom prompt is given.
 */
export function buildCategoryAwarePrompt(categories: Category[]): string {
  const categoryList = categories.map((c) => c.name).join(', ');
  return (
    'You are an expense categorizer. Given a receipt image, extract: ' +
    'title (merchant/store name), total_amount (total expense as a string), ' +
    `category (the best match from: ${categoryList}), and ` +
    'category_alternatives (up to 2 ranked backup categories from the same list). ' +
    'Output ONLY a JSON object. No other text. ' +
    'Example: {"title": "Starbucks", "total_amount": "5.50", "category": "Groceries", "category_alternatives": ["Food", "Dining"]}'
  );
}
