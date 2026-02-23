/**
 * Cleans a product description by removing common noise like SKUs and trailing numeric codes.
 * - trims input and collapses whitespace
 * - removes long alphanumeric SKU-like tokens (letters+numbers, >=8 chars)
 * - removes trailing pure numeric tokens from the end
 * - returns a cleaned string, falling back to the original trimmed text if it becomes empty
 *
 * @param {string} input The raw product description.
 * @returns {string} A cleaned string.
 */
export function cleanProductDescription(input: string): string {
    if (!input || typeof input !== 'string') {
        return '';
    }
    
    const originalTrimmed = input.trim();

    // 1. Define regex for tokens to remove
    // SKU-like: >= 8 chars, contains both letters and digits. This avoids removing regular words or numbers.
    const skuRegex = /\b(?=[a-zA-Z0-9]*[a-zA-Z])(?=[a-zA-Z0-9]*[0-9])[a-zA-Z0-9]{8,}\b/g;
    // Trailing numeric code at the very end of the string
    const trailingNumericRegex = /\s+\d+$/;

    // 2. Remove SKU-like tokens
    let cleaned = originalTrimmed.replace(skuRegex, '');

    // 3. Remove trailing numeric code
    cleaned = cleaned.replace(trailingNumericRegex, '');

    // 4. Collapse whitespace that may have been created by removals and trim again
    cleaned = cleaned.trim().replace(/\s+/g, ' ');

    // 5. Fallback to original if cleaning made it empty, to avoid blank descriptions
    return cleaned.length > 0 ? cleaned : originalTrimmed;
}
